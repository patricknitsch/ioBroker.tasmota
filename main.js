'use strict';

const utils = require('@iobroker/adapter-core');
const mqtt = require('mqtt');

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

		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Called when adapter is started.
	 */
	async onReady() {
		// Ensure the info objects exist before setting any state on them
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

		if (this.config.mode === 'server') {
			await this.startMqttServer();
		} else {
			await this.startMqttClient();
		}

		// Subscribe to cmnd states so user-initiated commands are published over MQTT
		await this.subscribeStatesAsync('*.cmnd.*');
	}

	/**
	 * Start an MQTT server (broker) using aedes.
	 */
	async startMqttServer() {
		let Aedes;
		try {
			// @ts-expect-error - aedes CJS interop: Aedes is a named export at runtime
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
			} // ignore retained/internal messages without a client
			if (!packet.topic || packet.topic.startsWith('$SYS')) {
				return;
			}

			const topic = packet.topic;
			const payload = packet.payload ? packet.payload.toString() : '';

			this.log.debug(`MQTT server received: ${topic} = ${payload}`);
			await this.processMqttMessage(topic, payload);
		});

		this.aedesServer.on('client', client => {
			this.log.info(`MQTT client connected: ${client.id}`);
		});

		this.aedesServer.on('clientDisconnect', client => {
			this.log.info(`MQTT client disconnected: ${client.id}`);
		});
		this.aedesServer.on('clientError', (_client, err) => {
			this.log.error(`MQTT broker error: ${err.message}`);
		});
	}

	/**
	 * Parse the brokerTopicPrefix config value into a list of trimmed, non-empty prefix strings.
	 * The value may contain multiple prefixes separated by commas.
	 *
	 * @returns {string[]} array of topic prefixes
	 */
	getTopicPrefixes() {
		return (this.config.brokerTopicPrefix || '')
			.split(',')
			.map(p => p.trim())
			.filter(p => p !== '');
	}

	/**
	 * Start an MQTT client connecting to an external broker.
	 */
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

			// Subscribe to each configured topic prefix, or all topics if none are configured
			const topicPrefixes = this.getTopicPrefixes();
			const subscribeTopics = topicPrefixes.length > 0 ? topicPrefixes.map(p => `${p}/#`) : ['#'];

			if (this.mqttClient) {
				for (const subscribeTopic of subscribeTopics) {
					this.mqttClient.subscribe(subscribeTopic, { qos: 0 }, err => {
						if (err) {
							this.log.error(`Failed to subscribe: ${err.message}`);
						} else {
							this.log.info(`Subscribed to MQTT topics: ${subscribeTopic}`);
						}
					});
				}
			}
		});

		this.mqttClient.on('reconnect', () => {
			this.log.info('Reconnecting to MQTT broker...');
		});

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

	/**
	 * Process an incoming MQTT message and create/update ioBroker states.
	 * Handles Tasmota FullTopic format: %prefix%/%topic%/...
	 *
	 * @param {string} topic - MQTT topic
	 * @param {string} payload - message payload
	 */
	async processMqttMessage(topic, payload) {
		// Strip the first matching broker topic prefix from the front if configured.
		// Multiple prefixes can be configured separated by commas.
		const topicPrefixes = this.getTopicPrefixes();
		let effectiveTopic = topic;
		for (const topicPrefix of topicPrefixes) {
			if (topic.startsWith(`${topicPrefix}/`)) {
				effectiveTopic = topic.slice(topicPrefix.length + 1);
				break;
			}
		}

		// Parse topic into parts
		const parts = effectiveTopic.split('/').filter(p => p !== '');
		if (parts.length < 2) {
			return;
		}

		// Tasmota known prefixes
		const knownPrefixes = ['tele', 'cmnd', 'stat'];
		let prefix, deviceId, remainingParts;

		const structure = this.config.brokerTopicStructure || 'prefix-first';

		if (structure === 'device-first') {
			// Format: {device}/{prefix}/{command}  (e.g. office_light/tele/STATE)
			deviceId = parts[0];
			prefix = knownPrefixes.includes(parts[1]) ? parts[1] : null;
			remainingParts = prefix ? parts.slice(2) : parts.slice(1);
		} else if (structure === 'prefix-first') {
			// Format: {prefix}/{device}/{command}  (e.g. tele/office_light/STATE)
			prefix = knownPrefixes.includes(parts[0]) ? parts[0] : null;
			deviceId = prefix ? parts[1] : parts[0];
			remainingParts = prefix ? parts.slice(2) : parts.slice(1);
		} else {
			// Auto-detect
			if (knownPrefixes.includes(parts[0])) {
				prefix = parts[0];
				deviceId = parts[1];
				remainingParts = parts.slice(2);
			} else if (parts.length >= 3 && knownPrefixes.includes(parts[1])) {
				deviceId = parts[0];
				prefix = parts[1];
				remainingParts = parts.slice(2);
			} else {
				prefix = null;
				deviceId = parts[0];
				remainingParts = parts.slice(1);
			}
		}

		if (!deviceId) {
			return;
		}

		// Sanitize IDs
		const safeDeviceId = this.sanitizeId(deviceId);
		const safePrefix = prefix ? this.sanitizeId(prefix) : null;

		// Build state path: deviceId[.prefix][.remainingParts...]
		const channelId = safePrefix ? `${safeDeviceId}.${safePrefix}` : safeDeviceId;

		// Ensure device object exists
		await this.ensureObject(safeDeviceId, 'device', safeDeviceId);

		// Ensure channel object exists (e.g. tasmota1.tele)
		if (safePrefix) {
			await this.ensureObject(channelId, 'channel', `${safeDeviceId} ${safePrefix}`);
		}

		if (remainingParts.length === 0) {
			// No sub-topic, store the raw payload
			const stateId = channelId;
			await this.setStateValue(stateId, payload, topic);
			return;
		}

		const commandName = remainingParts.join('_');
		const safeCommandName = this.sanitizeId(commandName);
		const baseStateId = `${channelId}.${safeCommandName}`;

		// Try to parse JSON payload
		let parsed = null;
		try {
			parsed = JSON.parse(payload);
		} catch {
			// not JSON - store raw value
		}

		if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
			// JSON object - recurse through its properties
			await this.processJsonObject(baseStateId, `${channelId}.${safeCommandName}`, parsed, safeCommandName);
		} else {
			// Scalar value - store directly
			await this.ensureObject(
				baseStateId,
				'state',
				safeCommandName,
				this.guessStateRole(payload),
				this.guessStateType(payload),
			);
			await this.setStateAsAck(baseStateId, this.parseScalar(payload));
		}
	}

	/**
	 * Recursively process a JSON object and create ioBroker states.
	 *
	 * @param {string} channelId - channel object ID to create/use
	 * @param {string} _baseId - unused (kept for API compatibility)
	 * @param {object} obj - JSON object to process
	 * @param {string} channelName - human-readable name for the channel
	 */
	async processJsonObject(channelId, _baseId, obj, channelName) {
		await this.ensureObject(channelId, 'channel', channelName);

		for (const [key, value] of Object.entries(obj)) {
			const safeKey = this.sanitizeId(key);
			const stateId = `${channelId}.${safeKey}`;

			if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
				// Nested object - recurse
				await this.processJsonObject(stateId, stateId, value, key);
			} else {
				// Scalar or array - store as state
				const strVal = Array.isArray(value) ? JSON.stringify(value) : value;
				await this.ensureObject(
					stateId,
					'state',
					key,
					this.guessStateRole(String(strVal)),
					this.guessStateType(String(strVal)),
				);
				await this.setStateAsAck(stateId, strVal);
			}
		}
	}

	/**
	 * Ensure an ioBroker object exists; create it with setObjectNotExists if not.
	 *
	 * @param {string} id - object ID (relative to adapter namespace)
	 * @param {"state" | "channel" | "device"} type - object type
	 * @param {string} name - human-readable name
	 * @param {string} [role] - state role
	 * @param {ioBroker.CommonType} [stateType] - state type
	 */
	async ensureObject(id, type, name, role, stateType) {
		if (type === 'state') {
			await this.setObjectNotExistsAsync(id, {
				type: 'state',
				common: {
					name,
					role: role || 'value',
					type: stateType || 'mixed',
					read: true,
					write: true,
				},
				native: {},
			});
		} else if (type === 'device') {
			await this.setObjectNotExistsAsync(id, {
				type: 'device',
				common: { name },
				native: {},
			});
		} else {
			await this.setObjectNotExistsAsync(id, {
				type: 'channel',
				common: { name },
				native: {},
			});
		}
	}

	/**
	 * Set a state value with ack=true.
	 *
	 * @param {string} id - state ID
	 * @param {unknown} value - value to set
	 */
	async setStateAsAck(id, value) {
		// @ts-expect-error - value is unknown at the call site but ioBroker accepts any JSON-safe value
		await this.setStateAsync(id, { val: value, ack: true });
	}

	/**
	 * Set raw string as a state (used for non-JSON topics).
	 *
	 * @param {string} stateId - state ID
	 * @param {string} payload - raw payload
	 * @param {string} _topic - original MQTT topic (unused, kept for API compatibility)
	 */
	async setStateValue(stateId, payload, _topic) {
		const parsed = this.parseScalar(payload);
		const role = this.guessStateRole(payload);
		const type = this.guessStateType(payload);
		await this.ensureObject(stateId, 'state', stateId.split('.').pop() || stateId, role, type);
		await this.setStateAsAck(stateId, parsed);
	}

	/**
	 * Sanitize a string for use as an ioBroker object ID.
	 * Only A-Za-z0-9-_ are allowed; everything else is replaced with underscore.
	 *
	 * @param {string} input - string to sanitize
	 * @returns {string} sanitized string
	 */
	sanitizeId(input) {
		return input.replace(/[^A-Za-z0-9\-_]/g, '_');
	}

	/**
	 * Parse a string payload to its best-matching JavaScript type.
	 *
	 * @param {string} payload - raw string payload
	 * @returns {boolean | number | string} parsed value
	 */
	parseScalar(payload) {
		if (payload === 'true' || payload === 'ON') {
			return true;
		}
		if (payload === 'false' || payload === 'OFF') {
			return false;
		}
		const num = Number(payload);
		if (!isNaN(num) && payload.trim() !== '') {
			return num;
		}
		return payload;
	}

	/**
	 * Guess the ioBroker state role from the value alone (no key-name heuristics).
	 * This keeps the adapter generic so it does not need updating when the MQTT
	 * structure changes.
	 *
	 * @param {string} value - string value
	 * @returns {string} ioBroker state role
	 */
	guessStateRole(value) {
		if (value === 'ON' || value === 'OFF' || value === 'true' || value === 'false') {
			return 'indicator';
		}
		if (!isNaN(Number(value)) && value.trim() !== '') {
			return 'value';
		}
		return 'text';
	}

	/**
	 * Guess the ioBroker state type from a string value.
	 *
	 * @param {string} value - string value to inspect
	 * @returns {ioBroker.CommonType} ioBroker state type
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
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 *
	 * @param {() => void} callback - must be called when cleanup is done
	 */
	onUnload(callback) {
		try {
			if (this.mqttClient) {
				this.mqttClient.end(true);
				this.mqttClient = null;
				this.log.info('MQTT client disconnected');
			}
			if (this.aedesServer) {
				this.aedesServer.close(() => {
					this.log.info('MQTT server stopped');
				});
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

	/**
	 * Is called if a subscribed state changes.
	 *
	 * @param {string} id - state ID
	 * @param {ioBroker.State | null | undefined} state - new state value
	 */
	onStateChange(id, state) {
		if (!state || state.ack) {
			return;
		}

		// A state was changed from outside (command from user)
		// Only handle cmnd states – stat and tele come from the device and must not be echoed back
		const relativeId = id.replace(`${this.namespace}.`, '');
		const parts = relativeId.split('.');

		if (parts.length < 3 || parts[1] !== 'cmnd') {
			return;
		}

		// Reconstruct a Tasmota command topic from the state ID
		const device = parts[0];
		const prefix = 'cmnd';
		const command = parts.slice(2).join('/');

		const structure = this.config.brokerTopicStructure || 'prefix-first';
		let topic;
		if (structure === 'device-first') {
			// Format: {device}/cmnd/{command}
			topic = `${device}/${prefix}/${command}`;
		} else {
			// Format: cmnd/{device}/{command}
			topic = `${prefix}/${device}/${command}`;
		}

		// Prepend first broker topic prefix if configured
		const topicPrefixes = this.getTopicPrefixes();
		if (topicPrefixes.length > 0) {
			topic = `${topicPrefixes[0]}/${topic}`;
		}

		// Convert value for Tasmota commands: boolean true/false → ON/OFF
		let value;
		if (state.val === true) {
			value = 'ON';
		} else if (state.val === false) {
			value = 'OFF';
		} else {
			value = state.val !== null && state.val !== undefined ? String(state.val) : '';
		}

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
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
	 */
	module.exports = options => new Tasmota(options);
} else {
	// otherwise start the instance directly
	new Tasmota();
}
