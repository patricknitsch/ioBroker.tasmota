'use strict';

const utils = require('@iobroker/adapter-core');
const mqtt = require('mqtt');

const { sanitizeId, parseScalar, inferType } = require('./lib/value-utils');
const { parseIncomingTopic } = require('./lib/topic-parser');
const { DATAPOINTS } = require('./lib/datapoints');
const { DISCOVERY_COMMANDS } = require('./lib/discovery');
const { TasmotaDeviceManager } = require('./lib/device-manager');

class Tasmota extends utils.Adapter {
	constructor(options) {
		super({
			...options,
			name: 'tasmota',
		});

		this.mqttClient = null;
		this.aedesServer = null;
		this.netServer = null;
		this.knownDevices = new Set();
		this.discoveryRequested = new Set();
		this.ensuredObjects = new Set();
		this.configMissingLogged = false;
		this.deviceManager = null;

		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	async onReady() {
		await this.setObjectNotExistsAsync('info', {
			type: 'channel',
			common: { name: 'Information' },
			native: {},
		});
		await this.setObjectNotExistsAsync('info.connection', {
			type: 'state',
			common: {
				name: 'Connected to MQTT broker',
				role: 'indicator.connected',
				type: 'boolean',
				read: true,
				write: false,
				def: false,
			},
			native: {},
		});
		await this.setStateAsync('info.connection', { val: false, ack: true });

		const configurationErrors = this.getConfigurationErrors();
		if (configurationErrors.length > 0) {
			if (!this.configMissingLogged) {
				this.configMissingLogged = true;
				this.log.error('Konfiguration fehlt.');
				for (const errorMessage of configurationErrors) {
					this.log.error(errorMessage);
				}
			}
			this.terminate?.('Konfiguration fehlt.');
			return;
		}

		if (this.config.clearFolders) {
			await this.clearAllDevices();
		}

		await this.initKnownDevices();

		if (this.config.mode === 'server') {
			await this.startMqttServer();
		} else {
			await this.startMqttClient();
		}

		await this.subscribeStatesAsync('*');

		this.deviceManager = new TasmotaDeviceManager(this);
	}

	getConfigurationErrors() {
		const errors = [];
		if (this.config.mode !== 'client') {
			return errors;
		}
		const hostMissing = !String(this.config.brokerUrl || '').trim();
		if (hostMissing) {
			errors.push('Broker Host fehlt.');
		}
		const portNumber = Number(this.config.brokerPort);
		if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
			errors.push('Broker Port ist ungültig.');
		}
		const prefixMissing = !String(this.config.brokerTopicPrefix || '').trim();
		if (prefixMissing) {
			errors.push('Topic-Präfix fehlt.');
		}
		const userSet = !!String(this.config.brokerUser || '').trim();
		const passwordSet = !!String(this.config.brokerPassword || '').trim();
		if (userSet !== passwordSet) {
			errors.push('Broker Benutzername und Passwort müssen gemeinsam gesetzt werden.');
		}
		if (this.config.brokerUseTls) {
			const certSet = !!String(this.config.brokerCertPath || '').trim();
			const keySet = !!String(this.config.brokerKeyPath || '').trim();
			if (certSet !== keySet) {
				errors.push('TLS-Zertifikat und TLS-Schlüssel müssen gemeinsam gesetzt werden.');
			}
		}
		return errors;
	}

	async initKnownDevices() {
		const deviceIds = await this.loadKnownDeviceIds();
		for (const deviceId of deviceIds) {
			try {
				await this.setStateAsync(`${deviceId}.alive`, { val: false, ack: true });
			} catch {
				// state may not exist yet on first run
			}
		}
	}

	async loadKnownDeviceIds() {
		const startkey = `${this.namespace}.`;
		const endkey = `${this.namespace}.香`;
		const objectList = await this.getObjectListAsync({ startkey, endkey });
		const deviceIds = objectList.rows
			.filter(row => row.value?.type === 'device')
			.map(row => row.id.replace(`${this.namespace}.`, ''));
		for (const deviceId of deviceIds) {
			this.knownDevices.add(deviceId);
		}
		return deviceIds;
	}

	getTopicPrefixes() {
		return (this.config.brokerTopicPrefix || '')
			.split(',')
			.map(p => p.trim())
			.filter(Boolean);
	}

	async startMqttServer() {
		let Aedes;
		try {
			Aedes = require('aedes').Aedes;
		} catch {
			this.log.error('aedes module not found. Please install it: npm install aedes');
			return;
		}

		const fs = require('fs');
		const net = require('net');
		const tls = require('tls');

		const aedesOpts = {};
		if (this.config.user && this.config.password) {
			aedesOpts.authenticate = (client, username, password, callback) => {
				const valid =
					username === this.config.user && password && password.toString() === this.config.password;
				callback(null, valid);
			};
		}

		this.aedesServer = await Aedes.createBroker(aedesOpts);
		const port = this.config.port || 1883;
		const bind = this.config.bind || '0.0.0.0';

		if (this.config.serverSsl) {
			const tlsOptions = {};
			if (this.config.serverCertPath && this.config.serverKeyPath) {
				try {
					tlsOptions.cert = fs.readFileSync(this.config.serverCertPath);
					tlsOptions.key = fs.readFileSync(this.config.serverKeyPath);
				} catch (e) {
					this.log.error(`Failed to load server certificates: ${e.message}`);
				}
			}
			this.netServer = tls.createServer(tlsOptions, this.aedesServer.handle);
		} else {
			this.netServer = net.createServer(this.aedesServer.handle);
		}

		this.netServer.listen(port, bind, () => {
			this.log.info(`MQTT server listening on ${bind}:${port} (${this.config.serverSsl ? 'MQTTS' : 'MQTT'})`);
			this.setState('info.connection', true, true);
			void this.requestSnapshotsForKnownDevices();
		});

		this.netServer.on('error', err => {
			this.log.error(`MQTT server error: ${err.message}`);
			this.setState('info.connection', false, true);
		});

		this.aedesServer.on('publish', async (packet, client) => {
			if (!client) return;
			if (!packet.topic) return;
			if (packet.topic.startsWith('$SYS')) return;
			await this.processMqttMessage(packet.topic, packet.payload ? packet.payload.toString() : '');
		});
	}

	async startMqttClient() {
		const fs = require('fs');
		const brokerHost = this.config.brokerUrl || 'localhost';
		const brokerPort = this.config.brokerPort || 1883;
		const useTls = this.config.brokerUseTls || false;
		const protocol = useTls ? 'mqtts' : 'mqtt';
		const url = `${protocol}://${brokerHost}:${brokerPort}`;
		const clientId = this.config.brokerClientId
			? this.config.brokerClientId
			: `iobroker_tasmota_${this.namespace}_${Math.random().toString(16).slice(2, 8)}`;

		const clientTimeoutSec = Number(this.config.clientTimeout) || 30;
		const options = {
			clientId,
			clean: this.config.brokerCleanSession !== false,
			reconnectPeriod: this.config.brokerReconnectPeriod || 5000,
			connectTimeout: clientTimeoutSec * 1000,
			keepalive: this.config.brokerKeepalive || 60,
		};

		if (this.config.brokerUser) options.username = this.config.brokerUser;
		if (this.config.brokerPassword) options.password = this.config.brokerPassword;

		if (useTls) {
			options.rejectUnauthorized = this.config.brokerTlsRejectUnauthorized !== false;
			if (this.config.brokerCertPath && this.config.brokerKeyPath) {
				try {
					options.cert = fs.readFileSync(this.config.brokerCertPath);
					options.key = fs.readFileSync(this.config.brokerKeyPath);
					if (this.config.brokerCaPath) {
						options.ca = fs.readFileSync(this.config.brokerCaPath);
					}
				} catch (e) {
					this.log.error(`Failed to load broker TLS certificates: ${e.message}`);
				}
			}
		}

		this.mqttClient = mqtt.connect(url, options);

		this.mqttClient.on('connect', () => {
			this.log.info(`Connected to MQTT broker at ${url}`);
			this.setState('info.connection', true, true);
			const topicPrefixes = this.getTopicPrefixes();
			const topics = topicPrefixes.length > 0 ? topicPrefixes.map(p => `${p}/#`) : ['#'];
			const client = this.mqttClient;
			if (!client) return;
			for (const subscribeTopic of topics) {
				client.subscribe(subscribeTopic, { qos: 0 }, err => {
					if (err) this.log.error(`Failed to subscribe: ${err.message}`);
				});
			}
			void this.requestSnapshotsForKnownDevices();
		});

		this.mqttClient.on('disconnect', () => this.setState('info.connection', false, true));
		this.mqttClient.on('error', err => {
			this.log.error(`MQTT client error: ${err.message}`);
			this.setState('info.connection', false, true);
		});
		this.mqttClient.on('message', async (topic, payload) =>
			this.processMqttMessage(topic, payload ? payload.toString() : ''),
		);
	}

	async processMqttMessage(topic, payload) {
		const parsedTopic = parseIncomingTopic(
			topic,
			this.getTopicPrefixes(),
			this.config.brokerTopicStructure || 'prefix-first',
		);
		if (!parsedTopic) return;

		const safeDeviceId = sanitizeId(parsedTopic.deviceId);
		const lastCommand = parsedTopic.commandParts[parsedTopic.commandParts.length - 1] || '';
		const isLwtMessage = lastCommand.toUpperCase() === 'LWT';

		if (isLwtMessage) {
			const isOnline = parseScalar(payload) === true;
			const deviceExists = this.knownDevices.has(safeDeviceId);

			if (!isOnline && !deviceExists) return;

			if (!deviceExists) {
				await this.ensureDevice(safeDeviceId, parsedTopic.deviceId);
			}

			if (isOnline) {
				this.discoveryRequested.delete(safeDeviceId);
				await this.requestDeviceSnapshot(parsedTopic.deviceId);
			}

			await this.setStateAsync(`${safeDeviceId}.alive`, { val: isOnline, ack: true });
			return;
		}

		if (!this.knownDevices.has(safeDeviceId)) return;

		const prefix = parsedTopic.prefix ? parsedTopic.prefix.toLowerCase() : '';
		if (prefix === 'tele') {
			if (lastCommand.toUpperCase() === 'SENSOR' && this.config.processTeleSensor === false) return;
			if (lastCommand.toUpperCase() === 'STATE' && this.config.processTeleState === false) return;
		}
		if ((prefix === 'stat') && lastCommand.toUpperCase() === 'RESULT' && this.config.processStatResult === false) return;

		let parsedPayload;
		try {
			parsedPayload = JSON.parse(payload);
		} catch {
			parsedPayload = payload;
		}

		const useObjectTree = this.config.objectTree !== false;

		if (parsedPayload !== null && typeof parsedPayload === 'object' && !Array.isArray(parsedPayload)) {
			if (useObjectTree) {
				await this.storeObjectPayload(safeDeviceId, parsedTopic.commandParts, parsedPayload);
			} else {
				await this.storeObjectPayloadFlat(safeDeviceId, parsedTopic.commandParts, parsedPayload);
			}
		} else {
			await this.storeLeafState(safeDeviceId, null, lastCommand, parsedPayload);
		}
	}

	async storeObjectPayloadFlat(deviceId, commandParts, obj, keyPrefix) {
		for (const [key, value] of Object.entries(obj)) {
			const flatKey = keyPrefix ? `${keyPrefix}_${key}` : key;
			if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
				await this.storeObjectPayloadFlat(deviceId, commandParts, value, flatKey);
			} else {
				await this.storeLeafState(deviceId, null, flatKey, value);
			}
		}
	}

	async storeObjectPayload(deviceId, commandParts, obj) {
		const lastCmd = commandParts[commandParts.length - 1] || '';
		const entries = Object.entries(obj);

		// Flatten redundant single-key wrapper:
		// INFO1/{"Info1":{...}}, STATUS5/{"StatusNET":{...}} → skip wrapper level
		if (entries.length === 1) {
			const [key, val] = entries[0];
			if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
				if (this.isRedundantWrapper(lastCmd, key)) {
					await this.storeObjectPayload(deviceId, commandParts, val);
					return;
				}
			}
		}

		for (const [key, value] of entries) {
			if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
				await this.ensureChannel(deviceId, key);
				for (const [subKey, subValue] of Object.entries(value)) {
					const leaf = subValue !== null && typeof subValue === 'object' && !Array.isArray(subValue)
						? JSON.stringify(subValue)
						: subValue;
					await this.storeLeafState(deviceId, key, subKey, leaf);
				}
			} else {
				await this.storeLeafState(deviceId, null, key, value);
			}
		}
	}

	isRedundantWrapper(commandPart, wrapperKey) {
		const normCmd = commandPart.toLowerCase().replace(/\d+$/, '');
		const normKey = wrapperKey.toLowerCase().replace(/\d+$/, '');
		// Exact match (INFO1/Info1) or wrapper starts with command base (STATUS5/StatusNET)
		return normCmd.length >= 3 && (normCmd === normKey || normKey.startsWith(normCmd));
	}

	async storeLeafState(deviceId, channelKey, stateKey, rawValue) {
		const parsedValue = Array.isArray(rawValue) ? JSON.stringify(rawValue) : parseScalar(rawValue);

		// Look up profile: compound key first for shutter/nested states, then plain key
		const compoundKey = channelKey ? `${channelKey}_${stateKey}` : null;
		const profile = (compoundKey && DATAPOINTS[compoundKey]) || DATAPOINTS[stateKey] || null;

		const rawType = profile ? profile.type : inferType(parsedValue);
		const type = rawType === 'mixed' ? 'mixed' : rawType;
		const role = profile?.role || (type === 'boolean' ? 'switch' : type === 'number' ? 'value' : 'text');
		const write = !!(profile?.write);

		const command = write ? this.stateKeyToCommand(channelKey, stateKey) : null;

		const safeChannelKey = channelKey ? sanitizeId(channelKey) : null;
		const safeStateKey = sanitizeId(stateKey);
		const stateId = safeChannelKey
			? `${deviceId}.${safeChannelKey}.${safeStateKey}`
			: `${deviceId}.${safeStateKey}`;

		const common = {
			name: stateKey,
			type,
			role,
			read: true,
			write,
		};
		if (profile?.unit) common.unit = profile.unit;
		if (profile?.min !== undefined) common.min = profile.min;
		if (profile?.max !== undefined) common.max = profile.max;
		if (profile?.states) common.states = profile.states;

		if (!this.ensuredObjects.has(stateId)) {
			await this.setObjectNotExistsAsync(stateId, {
				type: 'state',
				common,
				native: { tasmota: { command } },
			});
			this.ensuredObjects.add(stateId);
		}

		await this.setStateAsync(stateId, { val: parsedValue, ack: true });
	}

	stateKeyToCommand(channelKey, stateKey) {
		if (channelKey) {
			const shutterMatch = channelKey.match(/^Shutter(\d+)$/i);
			if (shutterMatch) {
				if (stateKey === 'Position') return `ShutterPosition${shutterMatch[1]}`;
				if (stateKey === 'Tilt') return `ShutterTilt${shutterMatch[1]}`;
				return null; // Direction and Target are read-only
			}
		}
		return stateKey;
	}

	async ensureDevice(safeDeviceId, displayName) {
		if (this.knownDevices.has(safeDeviceId)) return;

		await this.setObjectNotExistsAsync(safeDeviceId, {
			type: 'device',
			common: {
				name: displayName,
				statusStates: {
					onlineId: `${this.namespace}.${safeDeviceId}.alive`,
				},
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(`${safeDeviceId}.alive`, {
			type: 'state',
			common: {
				name: 'alive',
				type: 'boolean',
				role: 'indicator.reachable',
				read: true,
				write: false,
				def: false,
			},
			native: {},
		});

		await this.setStateAsync(`${safeDeviceId}.alive`, { val: false, ack: true });
		this.knownDevices.add(safeDeviceId);
	}

	async ensureChannel(deviceId, channelKey) {
		const channelId = `${deviceId}.${sanitizeId(channelKey)}`;
		if (this.ensuredObjects.has(channelId)) return;
		await this.setObjectNotExistsAsync(channelId, {
			type: 'channel',
			common: { name: channelKey },
			native: {},
		});
		this.ensuredObjects.add(channelId);
	}

	async clearAllDevices() {
		const startkey = `${this.namespace}.`;
		const endkey = `${this.namespace}.香`;
		const objectList = await this.getObjectListAsync({ startkey, endkey });
		const deviceIds = objectList.rows
			.filter(row => row.value?.type === 'device')
			.map(row => row.id.replace(`${this.namespace}.`, ''));
		for (const deviceId of deviceIds) {
			await this.delObjectAsync(deviceId, { recursive: true });
		}
		this.knownDevices.clear();
		this.discoveryRequested.clear();
		this.ensuredObjects.clear();
	}

	async requestSnapshotsForKnownDevices() {
		for (const deviceId of this.knownDevices) {
			await this.requestDeviceSnapshot(deviceId);
		}
	}

	async requestDeviceSnapshot(deviceId) {
		if (this.discoveryRequested.has(deviceId)) return;
		this.discoveryRequested.add(deviceId);
		for (const item of DISCOVERY_COMMANDS) {
			await this.publishCommand(deviceId, item.command, item.payload);
		}
	}

	async onStateChange(id, state) {
		if (!state || state.ack) return;

		const relativeId = id.replace(`${this.namespace}.`, '');
		const obj = await this.getObjectAsync(relativeId);
		if (!obj?.common?.write) return;

		const command = obj.native?.tasmota?.command;
		if (!command) return;

		const deviceId = relativeId.split('.')[0];
		const payload = this.toCommandPayload(state.val);
		await this.publishCommand(deviceId, command, payload);
	}

	toCommandPayload(value) {
		if (value === true) return 'ON';
		if (value === false) return 'OFF';
		return String(value ?? '');
	}

	async publishCommand(deviceId, command, payload) {
		if (!deviceId || !command) return;

		const structure = this.config.brokerTopicStructure || 'prefix-first';
		let topic =
			structure === 'device-first' ? `${deviceId}/cmnd/${command}` : `cmnd/${deviceId}/${command}`;
		const topicPrefixes = this.getTopicPrefixes();
		if (topicPrefixes.length > 0) {
			topic = `${topicPrefixes[0]}/${topic}`;
		}

		if (this.mqttClient && this.mqttClient.connected) {
			const client = this.mqttClient;
			await new Promise(resolve => {
				client.publish(topic, payload, { qos: 0 }, () => resolve(undefined));
			});
			return;
		}

		if (this.aedesServer) {
			const server = this.aedesServer;
			await new Promise(resolve => {
				server.publish(
					{
						cmd: 'publish',
						qos: 0,
						topic,
						payload: Buffer.from(String(payload)),
						retain: false,
						dup: false,
					},
					() => resolve(undefined),
				);
			});
		}
	}

	// Kept for test compatibility
	parseScalar(value) {
		return parseScalar(value);
	}

	guessStateType(value) {
		return inferType(value);
	}

	onUnload(callback) {
		try {
			if (this.mqttClient) {
				this.mqttClient.end(true);
				this.mqttClient = null;
			}
			if (this.aedesServer) {
				this.aedesServer.close(() => this.log.info('MQTT server stopped'));
				this.aedesServer = null;
			}
			if (this.netServer) {
				this.netServer.close();
				this.netServer = null;
			}
			this.setState('info.connection', false, true);
			callback();
		} catch {
			callback();
		}
	}
}

if (require.main !== module) {
	module.exports = options => new Tasmota(options);
	module.exports.Tasmota = Tasmota;
} else {
	new Tasmota();
}
