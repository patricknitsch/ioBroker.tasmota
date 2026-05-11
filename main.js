'use strict';

const utils = require('@iobroker/adapter-core');
const mqtt = require('mqtt');
const { mapMessage } = require('./lib/mapper');
const { buildCommon, isPowerKey } = require('./lib/datapoints');

/** Channel objects that are always created for every device. */
const STANDARD_CHANNELS = {
	status: 'Status',
	info: 'Information',
	controls: 'Controls',
};

/**
 * Channel objects created on first data arrival (optional).
 *
 */
const OPTIONAL_CHANNELS = {
	energy: 'Energy',
	sensors: 'Sensors',
};

class Tasmota extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
	 */
	constructor(options) {
		super({
			...options,
			name: 'tasmota',
		});

		this.mqttClient = null;
		this.aedesServer = null;
		this.netServer = null;

		/**
		 * Set of sanitised device IDs that have been fully initialised.
		 *
		 */
		this.discoveredDevices = new Set();

		/**
		 * Map of sanitised device ID to original MQTT device topic fragment.
		 *
		 */
		this.deviceTopics = {};

		/**
		 * Tracks channels that have already been created to avoid repeat calls.
		 *
		 */
		this.createdChannels = new Set();

		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	// Lifecycle

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

		this.setState('info.connection', false, true);
		await this.loadExistingDevices();

		if (this.config.mode === 'server') {
			await this.startMqttServer();
		} else {
			await this.startMqttClient();
		}

		// Subscribe to controls (new path) and legacy cmnd path for backward compat
		await this.subscribeStatesAsync('*.controls.*');
		await this.subscribeStatesAsync('*.cmnd.*');
	}

	/**
	 * Pre-populate discoveredDevices from the ioBroker object tree so we do not
	 * trigger auto-discovery for devices that already exist after a restart.
	 */
	async loadExistingDevices() {
		try {
			const devices = await this.getDevicesAsync();
			for (const dev of devices) {
				const shortId = dev._id.split('.').pop() || '';
				this.discoveredDevices.add(shortId);
				this.deviceTopics[shortId] = dev.native && dev.native.topic ? String(dev.native.topic) : shortId;
			}
			this.log.debug(`Loaded ${this.discoveredDevices.size} existing device(s)`);
		} catch (e) {
			this.log.warn(`Could not load existing devices: ${e.message}`);
		}
	}

	// MQTT server (broker)

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
		});
		this.netServer.on('error', err => {
			this.log.error(`MQTT server error: ${err.message}`);
			this.setState('info.connection', false, true);
		});
		this.aedesServer.on('publish', async (packet, client) => {
			if (!client) {
				return;
			}
			if (!packet.topic || packet.topic.startsWith('$SYS')) {
				return;
			}
			const topic = packet.topic;
			const payload = packet.payload ? packet.payload.toString() : '';
			this.log.debug(`MQTT server received: ${topic} = ${payload}`);
			await this.processMqttMessage(topic, payload);
		});
		this.aedesServer.on('client', client => this.log.info(`MQTT client connected: ${client.id}`));
		this.aedesServer.on('clientDisconnect', client => this.log.info(`MQTT client disconnected: ${client.id}`));
		this.aedesServer.on('clientError', (_client, err) => this.log.error(`MQTT broker error: ${err.message}`));
	}

	// MQTT client

	/**
	 * Parse brokerTopicPrefix config into a list of trimmed, non-empty prefixes.
	 *
	 * @returns {string[]}
	 */
	getTopicPrefixes() {
		return (this.config.brokerTopicPrefix || '')
			.split(',')
			.map(p => p.trim())
			.filter(p => p !== '');
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

		this.log.info(`Connecting to MQTT broker at ${url}`);
		this.mqttClient = mqtt.connect(url, options);

		this.mqttClient.on('connect', () => {
			this.log.info('Connected to MQTT broker');
			this.setState('info.connection', true, true);

			const topicPrefixes = this.getTopicPrefixes();
			const subscribeTopics = topicPrefixes.length > 0 ? topicPrefixes.map(p => `${p}/#`) : ['#'];

			if (this.mqttClient) {
				for (const sub of subscribeTopics) {
					this.mqttClient.subscribe(sub, { qos: 0 }, err => {
						if (err) {
							this.log.error(`Failed to subscribe: ${err.message}`);
						} else {
							this.log.info(`Subscribed to MQTT topics: ${sub}`);
						}
					});
				}
			}
		});

		this.mqttClient.on('reconnect', () => this.log.info('Reconnecting to MQTT broker...'));
		this.mqttClient.on('disconnect', () => {
			this.log.info('Disconnected from MQTT broker');
			this.setState('info.connection', false, true);
		});
		this.mqttClient.on('error', err => {
			this.log.error(`MQTT client error: ${err.message}`);
			this.setState('info.connection', false, true);
		});
		this.mqttClient.on('message', async (topic, payload) => {
			const message = payload ? payload.toString() : '';
			this.log.debug(`MQTT message: ${topic} = ${message}`);
			await this.processMqttMessage(topic, message);
		});
	}

	// Message processing

	/**
	 * Process an incoming MQTT message and create/update structured ioBroker states.
	 *
	 * @param {string} topic   - full MQTT topic
	 * @param {string} payload - message payload
	 */
	async processMqttMessage(topic, payload) {
		// Strip the first matching broker topic prefix
		const topicPrefixes = this.getTopicPrefixes();
		let effectiveTopic = topic;
		for (const topicPrefix of topicPrefixes) {
			if (topic.startsWith(`${topicPrefix}/`)) {
				effectiveTopic = topic.slice(topicPrefix.length + 1);
				break;
			}
		}

		const parts = effectiveTopic.split('/').filter(p => p !== '');
		if (parts.length < 2) {
			return;
		}

		const knownPrefixes = ['tele', 'cmnd', 'stat'];
		let prefix, deviceTopic, command;
		const structure = this.config.brokerTopicStructure || 'prefix-first';

		if (structure === 'device-first') {
			// {device}/{prefix}/{command}
			deviceTopic = parts[0];
			prefix = knownPrefixes.includes(parts[1]) ? parts[1] : null;
			command = prefix ? parts.slice(2).join('/') : parts.slice(1).join('/');
		} else {
			// prefix-first: {prefix}/{device}/{command}
			prefix = knownPrefixes.includes(parts[0]) ? parts[0] : null;
			deviceTopic = prefix ? parts[1] : parts[0];
			command = prefix ? parts.slice(2).join('/') : parts.slice(1).join('/');
		}

		if (!deviceTopic || !prefix || !command) {
			return;
		}

		const safeDeviceId = this.sanitizeId(deviceTopic);

		// Auto-discovery: initialise new devices on first sight
		if (!this.discoveredDevices.has(safeDeviceId)) {
			this.discoveredDevices.add(safeDeviceId);
			this.deviceTopics[safeDeviceId] = deviceTopic;
			await this.initDevice(safeDeviceId, deviceTopic);
			this.requestDeviceStatus(safeDeviceId);
		}

		// Map MQTT message to structured ioBroker state paths
		const mapped = mapMessage(prefix, command, payload);

		if (mapped.length === 0) {
			// Unknown message type - store as raw fallback
			const safeCmd = this.sanitizeId(command);
			await this.ensureChannel(safeDeviceId, 'raw', 'Raw');
			const rawId = `${safeDeviceId}.raw.${this.sanitizeId(prefix)}_${safeCmd}`;
			const parsedVal = this.coercePayload(payload);
			await this.ensureState(
				rawId,
				command,
				{ type: 'string', role: 'text', read: true, write: false },
				parsedVal,
			);
			return;
		}

		for (const entry of mapped) {
			const dotPos = entry.path.indexOf('.');
			const channel = dotPos >= 0 ? entry.path.slice(0, dotPos) : entry.path;
			const stateKey = dotPos >= 0 ? entry.path.slice(dotPos + 1) : entry.path;

			// Create optional channels (energy, sensors) on first data arrival
			if (OPTIONAL_CHANNELS[channel]) {
				await this.ensureChannel(safeDeviceId, channel, OPTIONAL_CHANNELS[channel]);
			}

			const stateId = `${safeDeviceId}.${channel}.${this.sanitizeId(stateKey)}`;
			const common = buildCommon(stateKey, entry.value, entry.writable);
			await this.ensureState(stateId, stateKey, common, entry.value);
		}
	}

	// Device initialisation

	/**
	 * Create the device object and its standard channels in ioBroker.
	 *
	 * @param {string} safeDeviceId   - sanitised device ID
	 * @param {string} originalTopic  - original MQTT topic fragment
	 */
	async initDevice(safeDeviceId, originalTopic) {
		this.log.info(`New Tasmota device discovered: ${originalTopic}`);

		await this.setObjectNotExistsAsync(safeDeviceId, {
			type: 'device',
			common: { name: originalTopic },
			native: { topic: originalTopic },
		});

		for (const [channel, name] of Object.entries(STANDARD_CHANNELS)) {
			await this.ensureChannel(safeDeviceId, channel, name);
		}

		// Pre-create status.online so it exists even before the first LWT arrives
		const onlineId = `${safeDeviceId}.status.online`;
		await this.ensureState(
			onlineId,
			'online',
			{ name: 'Connected', type: 'boolean', role: 'indicator.connected', read: true, write: false },
			false,
		);
	}

	/**
	 * Publish a "Status 0" command so the device responds with all status info,
	 * allowing us to populate the info channels immediately after discovery.
	 *
	 * @param {string} safeDeviceId - sanitised device ID
	 */
	requestDeviceStatus(safeDeviceId) {
		const originalTopic = this.deviceTopics[safeDeviceId] || safeDeviceId;
		const structure = this.config.brokerTopicStructure || 'prefix-first';
		let cmdTopic = structure === 'device-first' ? `${originalTopic}/cmnd/Status` : `cmnd/${originalTopic}/Status`;

		const prefixes = this.getTopicPrefixes();
		if (prefixes.length > 0) {
			cmdTopic = `${prefixes[0]}/${cmdTopic}`;
		}

		this.publishMqtt(cmdTopic, '0');
	}

	// Object helpers

	/**
	 * Ensure a channel object exists within a device.
	 * Uses an in-memory cache to avoid repeated setObjectNotExists calls.
	 *
	 * @param {string} deviceId - sanitised device ID
	 * @param {string} channel  - channel name (e.g. "status")
	 * @param {string} name     - human-readable channel name
	 */
	async ensureChannel(deviceId, channel, name) {
		const id = `${deviceId}.${channel}`;
		if (this.createdChannels.has(id)) {
			return;
		}
		this.createdChannels.add(id);
		await this.setObjectNotExistsAsync(id, {
			type: 'channel',
			common: { name },
			native: {},
		});
	}

	/**
	 * Ensure a state object exists and update its value.
	 *
	 * @param {string}  id     - full relative state ID
	 * @param {string}  name   - human-readable name
	 * @param {object}  common - ioBroker common block
	 * @param {unknown} value  - current value
	 */
	async ensureState(id, name, common, value) {
		await this.setObjectNotExistsAsync(id, {
			type: 'state',
			common: { name, ...common },
			native: {},
		});
		await this.setStateAsync(id, { val: /** @type {ioBroker.StateValue} */ (value), ack: true });
	}

	// Sanitization / coercion

	/**
	 * Sanitize a string for use as an ioBroker object ID.
	 *
	 * @param {string} input
	 * @returns {string}
	 */
	sanitizeId(input) {
		return input.replace(/[^A-Za-z0-9\-_]/g, '_');
	}

	/**
	 * Parse a string payload to its best-matching JavaScript type.
	 *
	 * @param {string} payload
	 * @returns {boolean | number | string}
	 */
	coercePayload(payload) {
		if (payload === 'ON' || payload === 'true') {
			return true;
		}
		if (payload === 'OFF' || payload === 'false') {
			return false;
		}
		const n = Number(payload);
		if (!isNaN(n) && payload.trim() !== '') {
			return n;
		}
		return payload;
	}

	// MQTT publish

	/**
	 * Publish a value to an MQTT topic via the active client or server.
	 *
	 * @param {string} topic
	 * @param {string} value
	 */
	publishMqtt(topic, value) {
		if (this.mqttClient && this.mqttClient.connected) {
			this.mqttClient.publish(topic, value, { qos: 0 }, err => {
				if (err) {
					this.log.error(`Failed to publish ${topic}: ${err.message}`);
				} else {
					this.log.debug(`Published: ${topic} = ${value}`);
				}
			});
		} else if (this.aedesServer) {
			this.aedesServer.publish(
				{
					cmd: 'publish',
					qos: 0,
					topic,
					payload: Buffer.from(value),
					retain: false,
					dup: false,
				},
				err => {
					if (err) {
						this.log.error(`Failed to publish ${topic}: ${err.message}`);
					} else {
						this.log.debug(`Published via server: ${topic} = ${value}`);
					}
				},
			);
		}
	}

	// State change handler

	/**
	 * Called when a subscribed ioBroker state changes (user-initiated command).
	 *
	 * @param {string}                           id    - state ID
	 * @param {ioBroker.State | null | undefined} state - new state value
	 */
	onStateChange(id, state) {
		if (!state || state.ack) {
			return;
		}

		const relativeId = id.replace(`${this.namespace}.`, '');
		const parts = relativeId.split('.');
		if (parts.length < 3) {
			return;
		}

		const deviceId = parts[0];
		const channel = parts[1];

		// Only react to controls and legacy cmnd channels
		if (channel !== 'controls' && channel !== 'cmnd') {
			return;
		}

		const command = parts.slice(2).join('/');
		const originalTopic = this.deviceTopics[deviceId] || deviceId;
		const structure = this.config.brokerTopicStructure || 'prefix-first';

		let topic =
			structure === 'device-first' ? `${originalTopic}/cmnd/${command}` : `cmnd/${originalTopic}/${command}`;

		const prefixes = this.getTopicPrefixes();
		if (prefixes.length > 0) {
			topic = `${prefixes[0]}/${topic}`;
		}

		// Convert boolean to ON/OFF for Tasmota
		let value;
		if (state.val === true) {
			value = 'ON';
		} else if (state.val === false) {
			value = 'OFF';
		} else {
			value = state.val !== null && state.val !== undefined ? String(state.val) : '';
		}

		this.publishMqtt(topic, value);
	}

	// Device Manager message handler

	/**
	 * Handle sendTo messages (e.g. from ioBroker admin Device Manager).
	 *
	 * @param {ioBroker.Message} msg
	 */
	async onMessage(msg) {
		if (!msg) {
			return;
		}

		if (msg.command === 'dm:listDevices') {
			const devices = Object.entries(this.deviceTopics).map(([id, topic]) => ({
				id,
				name: topic,
				native: { topic },
			}));
			this.sendTo(msg.from, msg.command, { result: devices }, msg.callback);
			return;
		}

		if (msg.command === 'dm:deviceDetails' && msg.message) {
			const deviceId = String(msg.message.id || msg.message);
			const topic = this.deviceTopics[deviceId] || deviceId;
			this.sendTo(
				msg.from,
				msg.command,
				{ result: { id: deviceId, name: topic, native: { topic } } },
				msg.callback,
			);
			return;
		}

		if (msg.command === 'dm:controlDevice' && msg.message) {
			const deviceId = String(msg.message.deviceId || '');
			const command = String(msg.message.command || '');
			const value = msg.message.value !== undefined ? String(msg.message.value) : '';

			if (deviceId && command) {
				const originalTopic = this.deviceTopics[deviceId] || deviceId;
				const structure = this.config.brokerTopicStructure || 'prefix-first';
				let topic =
					structure === 'device-first'
						? `${originalTopic}/cmnd/${command}`
						: `cmnd/${originalTopic}/${command}`;
				const prefixes = this.getTopicPrefixes();
				if (prefixes.length > 0) {
					topic = `${prefixes[0]}/${topic}`;
				}
				this.publishMqtt(topic, value);
			}
			this.sendTo(msg.from, msg.command, { result: 'ok' }, msg.callback);
			return;
		}
	}

	// Shutdown

	/**
	 * Called when adapter shuts down - callback must be called under any circumstances.
	 *
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			if (this.mqttClient) {
				this.mqttClient.end(true);
				this.mqttClient = null;
				this.log.info('MQTT client disconnected');
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

	// Legacy helpers kept so existing unit tests continue to pass

	/**
	 * Parse a string payload to its best-matching JavaScript type.
	 *
	 * @param {string} payload
	 * @returns {boolean | number | string}
	 */
	parseScalar(payload) {
		return this.coercePayload(payload);
	}

	/**
	 * Guess the ioBroker state type from a string value.
	 *
	 * @param {string} value
	 * @returns {string}
	 */
	guessStateType(value) {
		if (value === 'true' || value === 'false' || value === 'ON' || value === 'OFF') {
			return 'boolean';
		}
		if (!isNaN(Number(value)) && value.trim() !== '') {
			return 'number';
		}
		return 'string';
	}

	/**
	 * Recursively process a JSON object and create ioBroker states.
	 * Kept for backward-compat with existing unit tests; new code uses the mapper.
	 *
	 * @param {string} channelId
	 * @param {string} _baseId
	 * @param {object} obj
	 * @param {string} channelName
	 */
	async processJsonObject(channelId, _baseId, obj, channelName) {
		await this.setObjectNotExistsAsync(channelId, {
			type: 'channel',
			common: { name: channelName },
			native: {},
		});

		for (const [key, value] of Object.entries(obj)) {
			const safeKey = this.sanitizeId(key);
			const stateId = `${channelId}.${safeKey}`;

			if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
				await this.processJsonObject(stateId, stateId, value, key);
			} else {
				const strVal = Array.isArray(value) ? JSON.stringify(value) : value;
				const common = buildCommon(key, strVal, isPowerKey(key));
				await this.setObjectNotExistsAsync(stateId, {
					type: 'state',
					common: { name: key, ...common },
					native: {},
				});
				const convertedVal = typeof strVal === 'string' ? this.parseScalar(strVal) : strVal;
				await this.setStateAsync(stateId, { val: convertedVal, ack: true });
			}
		}
	}
}

if (require.main !== module) {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options]
	 */
	module.exports = options => new Tasmota(options);
	module.exports.Tasmota = Tasmota;
} else {
	new Tasmota();
}
