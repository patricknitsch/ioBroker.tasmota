'use strict';

const utils = require('@iobroker/adapter-core');
const mqtt = require('mqtt');

const { sanitizeId, parseScalar, inferType } = require('./lib/value-utils');
const { parseIncomingTopic } = require('./lib/topic-parser');
const { classifyState } = require('./lib/classifier');
const { DISCOVERY_COMMANDS } = require('./lib/discovery');

const DEVICE_FOLDERS = ['info', 'wifi', 'sensors', 'raw', 'controls'];

class Tasmota extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options]
	 */
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
		this.configMissingLogged = false;

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

		if (this.isConfigMissing()) {
			if (!this.configMissingLogged) {
				this.configMissingLogged = true;
				this.log.error('Konfiguration fehlt.');
			}
			return;
		}

		if (this.config.clearFolders) {
			await this.clearAllDeviceFolders();
		}

		if (this.config.mode === 'server') {
			await this.startMqttServer();
		} else {
			await this.startMqttClient();
		}

		await this.subscribeStatesAsync('*.controls.*');
	}

	isConfigMissing() {
		if (this.config.mode !== 'client') {
			return false;
		}
		const hostMissing = !String(this.config.brokerUrl || '').trim();
		const prefixMissing = !String(this.config.brokerTopicPrefix || '').trim();
		return hostMissing || prefixMissing;
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
				const valid = username === this.config.user && password && password.toString() === this.config.password;
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
			if (!client) {
				return;
			}
			if (!packet.topic) {
				return;
			}
			if (packet.topic.startsWith('$SYS')) {
				return;
			}
			await this.processMqttMessage(packet.topic, packet.payload ? packet.payload.toString() : '');
		});
	}

	getTopicPrefixes() {
		return (this.config.brokerTopicPrefix || '')
			.split(',')
			.map(p => p.trim())
			.filter(Boolean);
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

		const options = {
			clientId,
			clean: this.config.brokerCleanSession !== false,
			reconnectPeriod: this.config.brokerReconnectPeriod || 5000,
			connectTimeout: 30000,
			keepalive: this.config.brokerKeepalive || 60,
		};

		if (this.config.brokerUser) {
			options.username = this.config.brokerUser;
		}
		if (this.config.brokerPassword) {
			options.password = this.config.brokerPassword;
		}
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
			if (!client) {
				return;
			}
			for (const subscribeTopic of topics) {
				client.subscribe(subscribeTopic, { qos: 0 }, err => {
					if (err) {
						this.log.error(`Failed to subscribe: ${err.message}`);
					}
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
		if (!parsedTopic) {
			return;
		}

		const safeDeviceId = sanitizeId(parsedTopic.deviceId);
		const isNewDevice = await this.ensureDeviceStructure(safeDeviceId, parsedTopic.deviceId);
		if (isNewDevice) {
			await this.requestDeviceSnapshot(parsedTopic.deviceId);
		}

		const sourcePrefix = parsedTopic.prefix ? [parsedTopic.prefix] : [];
		const sourceParts = sourcePrefix.concat(parsedTopic.commandParts);
		const idPath = parsedTopic.commandParts.map(part => sanitizeId(part));

		let parsedPayload;
		try {
			parsedPayload = JSON.parse(payload);
		} catch {
			parsedPayload = payload;
		}

		if (parsedPayload && typeof parsedPayload === 'object' && !Array.isArray(parsedPayload)) {
			await this.storeObjectPayload(safeDeviceId, parsedTopic.prefix, parsedPayload, idPath, sourceParts);
		} else {
			await this.storeClassifiedState(safeDeviceId, idPath, sourceParts, parsedPayload);
		}
	}

	async storeObjectPayload(deviceId, prefix, objectValue, baseIdPath, baseSourcePath) {
		for (const [key, value] of Object.entries(objectValue)) {
			const nextIdPath = baseIdPath.concat(sanitizeId(key));
			const nextSourcePath = baseSourcePath.concat(key);

			if (value && typeof value === 'object' && !Array.isArray(value)) {
				await this.storeObjectPayload(deviceId, prefix, value, nextIdPath, nextSourcePath);
				continue;
			}

			await this.storeClassifiedState(deviceId, nextIdPath, [prefix, ...nextSourcePath].filter(Boolean), value);
		}
	}

	/**
	 * @param {string} deviceId
	 * @param {string[]} idPath
	 * @param {string[]} sourcePath
	 * @param {unknown} rawValue
	 */
	async storeClassifiedState(deviceId, idPath, sourcePath, rawValue) {
		const preparedValue = Array.isArray(rawValue) ? JSON.stringify(rawValue) : rawValue;
		const parsedValue = parseScalar(preparedValue);
		const sourceParts = sourcePath.length > 0 ? sourcePath : ['raw'];
		const meta = classifyState({
			prefix: sourcePath[0] || null,
			sourceParts,
			value: parsedValue,
		});

		const cleanPath = idPath.length > 0 ? idPath : ['value'];
		const folderPath = [deviceId, meta.folder];
		await this.ensureFolderPath(folderPath, meta.folder);

		if (cleanPath.length > 1) {
			for (let i = 0; i < cleanPath.length - 1; i++) {
				const channelPath = folderPath.concat(cleanPath.slice(0, i + 1));
				await this.ensureObject(channelPath.join('.'), 'channel', cleanPath[i]);
			}
		}

		const stateId = folderPath.concat(cleanPath).join('.');
		const stateName = sourceParts[sourceParts.length - 1] || cleanPath[cleanPath.length - 1];
		await this.ensureStateObject(stateId, stateName, meta, parsedValue, sourceParts);
		await this.setStateAsync(stateId, { val: parsedValue, ack: true });
	}

	async ensureFolderPath(pathParts, fallbackName) {
		for (let i = 0; i < pathParts.length; i++) {
			const id = pathParts.slice(0, i + 1).join('.');
			if (i === 0) {
				await this.ensureObject(id, 'device', pathParts[0]);
			} else {
				await this.ensureObject(id, 'channel', pathParts[i] || fallbackName);
			}
		}
	}

	async ensureStateObject(id, name, meta, value, sourceParts) {
		const common = {
			name,
			role: meta.role,
			type: meta.type || inferType(value),
			read: true,
			write: !!meta.write,
		};
		if (meta.unit) {
			common.unit = meta.unit;
		}

		await this.setObjectNotExistsAsync(id, {
			type: 'state',
			common,
			native: {
				tasmota: {
					folder: meta.folder,
					sourcePath: sourceParts,
					command: meta.command,
				},
			},
		});
	}

	async ensureObject(id, type, name) {
		if (type === 'device') {
			await this.setObjectNotExistsAsync(id, {
				type: 'device',
				common: { name },
				native: {},
			});
			return;
		}
		await this.setObjectNotExistsAsync(id, {
			type,
			common: { name },
			native: {},
		});
	}

	async ensureDeviceStructure(safeDeviceId, displayName) {
		if (this.knownDevices.has(safeDeviceId)) {
			return false;
		}

		await this.ensureObject(safeDeviceId, 'device', displayName);
		for (const folder of DEVICE_FOLDERS) {
			await this.ensureObject(`${safeDeviceId}.${folder}`, 'channel', folder);
		}
		this.knownDevices.add(safeDeviceId);
		return true;
	}

	async clearAllDeviceFolders() {
		const startkey = `${this.namespace}.`;
		const endkey = `${this.namespace}.\u9999`;
		const objectList = await this.getObjectListAsync({ startkey, endkey });
		const deviceIds = objectList.rows
			.filter(row => row.value?.type === 'device')
			.map(row => row.id.replace(`${this.namespace}.`, ''));

		for (const deviceId of deviceIds) {
			await this.delObjectAsync(deviceId, { recursive: true });
		}
		this.knownDevices.clear();
		this.discoveryRequested.clear();
	}

	async loadKnownDeviceIds() {
		const startkey = `${this.namespace}.`;
		const endkey = `${this.namespace}.\u9999`;
		const objectList = await this.getObjectListAsync({ startkey, endkey });
		const deviceIds = objectList.rows
			.filter(row => row.value?.type === 'device')
			.map(row => row.id.replace(`${this.namespace}.`, ''));

		for (const deviceId of deviceIds) {
			this.knownDevices.add(deviceId);
		}
		return deviceIds;
	}

	async requestSnapshotsForKnownDevices() {
		const knownDevices = await this.loadKnownDeviceIds();
		for (const deviceId of knownDevices) {
			await this.requestDeviceSnapshot(deviceId);
		}
	}

	async requestDeviceSnapshot(deviceId) {
		if (this.discoveryRequested.has(deviceId)) {
			return;
		}
		this.discoveryRequested.add(deviceId);
		for (const item of DISCOVERY_COMMANDS) {
			await this.publishCommand(deviceId, item.command, item.payload);
		}
	}

	async onStateChange(id, state) {
		if (!state || state.ack) {
			return;
		}

		const relativeId = id.replace(`${this.namespace}.`, '');
		const parts = relativeId.split('.');
		if (parts.length < 3 || parts[1] !== 'controls') {
			return;
		}

		const deviceId = parts[0];
		const object = await this.getObjectAsync(relativeId);
		const command = object?.native?.tasmota?.command || parts[parts.length - 1];
		const payload = this.toCommandPayload(state.val);
		await this.publishCommand(deviceId, command, payload);
	}

	/**
	 * @param {ioBroker.StateValue | null | undefined} value
	 * @returns {string}
	 */
	toCommandPayload(value) {
		if (value === true) {
			return 'ON';
		}
		if (value === false) {
			return 'OFF';
		}
		return String(value ?? '');
	}

	async publishCommand(deviceId, command, payload) {
		if (!deviceId || !command) {
			return;
		}

		const structure = this.config.brokerTopicStructure || 'prefix-first';
		let topic = structure === 'device-first' ? `${deviceId}/cmnd/${command}` : `cmnd/${deviceId}/${command}`;
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

	parseScalar(value) {
		return parseScalar(value);
	}

	guessStateType(value) {
		return inferType(value);
	}

	async processJsonObject(channelId, _baseId, obj) {
		await this.ensureObject(channelId, 'channel', channelId.split('.').pop() || channelId);
		for (const [key, value] of Object.entries(obj)) {
			const stateId = `${channelId}.${sanitizeId(key)}`;
			if (value && typeof value === 'object' && !Array.isArray(value)) {
				await this.processJsonObject(stateId, stateId, value);
			} else {
				const parsedValue = parseScalar(Array.isArray(value) ? JSON.stringify(value) : value);
				await this.ensureStateObject(
					stateId,
					key,
					{
						folder: 'raw',
						write: false,
						role: inferType(parsedValue) === 'number' ? 'value' : 'text',
						type: inferType(parsedValue),
					},
					parsedValue,
					[key],
				);
				await this.setStateAsync(stateId, { val: parsedValue, ack: true });
			}
		}
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
