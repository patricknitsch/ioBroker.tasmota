'use strict';

const utils = require('@iobroker/adapter-core');
const mqtt = require('mqtt');
// lib/commands.js ships as part of this adapter and is always present.
// It provides command-state auto-creation based on device-type detection.
const { setupCommandManagement } = require('./lib/commands');
// lib/datapoints.js provides the flat data-point map for structured mode.
const { lookupDatapoint, STATUS_WRAPPER_COMMANDS } = require('./lib/datapoints');

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

		/** @type {Set<string>} device IDs already seen in structured mode */
		this._seenStructuredDevices = new Set();

		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Handle messages sent via sendTo() from the admin tab or scripts.
	 *
	 * @param {ioBroker.Message} obj - message object
	 */
	async onMessage(obj) {
		if (!obj || obj.command !== 'clearDevices') {
			return;
		}
		await this.clearDeviceObjects();
		if (obj.callback) {
			this.sendTo(obj.from, obj.command, { result: 'ok' }, obj.callback);
		}
	}

	/**
	 * Delete all device objects (and their children) below the adapter namespace.
	 * The `info` channel is preserved so connection state is always available.
	 */
	async clearDeviceObjects() {
		this.log.info('Clearing all device objects...');
		try {
			const view = await this.getObjectViewAsync('system', 'device', {
				startkey: `${this.namespace}.`,
				endkey: `${this.namespace}.\u9999`,
			});
			if (!view || !view.rows) {
				return;
			}
			const nsDepth = this.namespace.split('.').length;
			for (const row of view.rows) {
				const obj = row.value;
				if (!obj) {
					continue;
				}
				// Only direct children of the namespace (depth: ns + 1), skip info
				if (obj._id.split('.').length !== nsDepth + 1) {
					continue;
				}
				const shortId = obj._id.split('.').pop();
				if (shortId === 'info') {
					continue;
				}
				await this.delObjectAsync(shortId, { recursive: true });
				this.log.debug(`Deleted device tree: ${shortId}`);
			}
			this.log.info('Device objects cleared.');
		} catch (err) {
			this.log.warn(`clearDeviceObjects: ${err.message}`);
		}
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

		// Optionally clear all device objects on startup
		if (this.config.clearOnStart) {
			await this.clearDeviceObjects();
		}

		if (this.config.mode === 'server') {
			await this.startMqttServer();
		} else {
			await this.startMqttClient();
		}

		if (this.config.rawTopicMode) {
			// Raw mode: subscribe to cmnd states and set up command-state auto-creation
			await this.subscribeStatesAsync('*.cmnd.*');
			await setupCommandManagement(this);
		} else {
			// Structured mode: subscribe to flat device states (device.FLATKEY)
			// so writes to writable states (e.g. device.POWER) trigger MQTT publishes
			await this.subscribeStatesAsync('*.*');
		}
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

		const safeDeviceId = this.sanitizeId(deviceId);

		// ── STRUCTURED MODE ────────────────────────────────────────────────────
		if (!this.config.rawTopicMode) {
			// Ignore cmnd messages in structured mode — they are outgoing only
			if (prefix === 'cmnd') {
				return;
			}

			// Lazy-initialise (test stubs don't call the constructor)
			if (!this._seenStructuredDevices) {
				this._seenStructuredDevices = new Set();
			}

			// Auto-query new devices when first seen
			if (!this._seenStructuredDevices.has(safeDeviceId)) {
				this._seenStructuredDevices.add(safeDeviceId);
				// Check after a short delay (so the triggering message can create the
				// device object first) whether this device needs a full Status 0 query.
				setTimeout(() => this._checkAndAutoQuery(safeDeviceId), 1500);
			}

			const command = remainingParts.join('_') || 'raw';
			await this.processStructuredMessage(safeDeviceId, prefix, command, payload);
			return;
		}

		// ── RAW MODE (existing behaviour) ─────────────────────────────────────

		// Skip tele messages when the user has not enabled telemetry storage
		if (prefix === 'tele' && !this.config.storeTeleData) {
			return;
		}

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

	// ── Structured-mode processing ────────────────────────────────────────────

	/**
	 * Process a single MQTT message in structured mode.
	 * Data is stored flat under the device root (e.g. "device.POWER", "device.Wifi_RSSI")
	 * with proper ioBroker roles, types and units from the datapoints table.
	 *
	 * @param {string} deviceId  - sanitized device ID (below adapter namespace)
	 * @param {string|null} prefix   - Tasmota prefix ("tele","stat") or null
	 * @param {string} command   - command / sub-topic (e.g. "STATE", "SENSOR", "STATUS11")
	 * @param {string} payload   - raw MQTT payload
	 */
	async processStructuredMessage(deviceId, prefix, command, payload) {
		// Ensure device-level object exists
		await this.ensureObject(deviceId, 'device', deviceId);

		// Try to parse JSON
		let parsed = null;
		try {
			parsed = JSON.parse(payload);
		} catch {
			// not JSON
		}

		// Resolve STATUS wrapper keys (e.g. StatusSTS → treat as STATE)
		let effectiveCommand = command;
		let jsonData = parsed;

		if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
			const topKeys = Object.keys(parsed);
			if (topKeys.length === 1) {
				const wrapperKey = topKeys[0];
				if (STATUS_WRAPPER_COMMANDS[wrapperKey]) {
					// Known wrapper → unwrap and treat as STATE or SENSOR
					effectiveCommand = STATUS_WRAPPER_COMMANDS[wrapperKey];
					jsonData = parsed[wrapperKey];
				} else if (wrapperKey.startsWith('Status')) {
					// Other STATUS wrappers (StatusFWR, StatusNET, StatusLOG, etc.)
					// Store flat under the wrapper key as a namespace prefix
					if (typeof parsed[wrapperKey] === 'object' && parsed[wrapperKey] !== null) {
						await this.flattenAndStore(deviceId, wrapperKey, parsed[wrapperKey]);
					}
					return;
				}
			}
		}

		if (effectiveCommand === 'STATE' || effectiveCommand === 'RESULT') {
			// STATE / RESULT: flat JSON at the device root
			// Contains POWER, Dimmer, Color, CT, Wifi.*, etc.
			if (jsonData !== null && typeof jsonData === 'object' && !Array.isArray(jsonData)) {
				await this.flattenAndStore(deviceId, '', jsonData);
			} else if (jsonData !== null) {
				await this.storeStructuredState(deviceId, command, String(jsonData));
			}
		} else if (effectiveCommand === 'SENSOR') {
			// SENSOR: nested structure – each top-level key is a sensor name or "ENERGY"
			if (jsonData !== null && typeof jsonData === 'object' && !Array.isArray(jsonData)) {
				for (const [sensorKey, sensorVal] of Object.entries(jsonData)) {
					if (sensorKey === 'Time') {
						continue; // timestamp is already in STATE
					}
					if (sensorVal !== null && typeof sensorVal === 'object' && !Array.isArray(sensorVal)) {
						// Named sensor sub-object (DS18B20, BME280, ENERGY, …)
						await this.flattenAndStore(deviceId, sensorKey, sensorVal);
					} else {
						// Scalar at sensor root level
						await this.storeStructuredState(deviceId, sensorKey, sensorVal);
					}
				}
			}
		} else {
			// Generic fallback for unknown commands
			if (jsonData !== null && typeof jsonData === 'object' && !Array.isArray(jsonData)) {
				const keyPrefix = command && command !== 'raw' ? command : '';
				await this.flattenAndStore(deviceId, keyPrefix, jsonData);
			} else if (payload) {
				await this.storeStructuredState(deviceId, command, payload);
			}
		}
	}

	/**
	 * Recursively flatten a JSON object and store each leaf as a state.
	 * Nested keys are joined with "_" (e.g. Wifi.RSSI → "Wifi_RSSI").
	 *
	 * @param {string} deviceId - device root ID
	 * @param {string} prefix   - current flat path prefix (empty string for root level)
	 * @param {object} obj      - object to flatten
	 */
	async flattenAndStore(deviceId, prefix, obj) {
		if (!obj || typeof obj !== 'object') {
			return;
		}
		for (const [key, value] of Object.entries(obj)) {
			if (key === 'Time') {
				continue; // skip Tasmota timestamps from SENSOR sub-objects
			}
			const flatKey = prefix ? `${prefix}_${key}` : key;
			if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
				// Nested object – recurse
				await this.flattenAndStore(deviceId, flatKey, value);
			} else {
				// Leaf value
				const strVal = Array.isArray(value) ? JSON.stringify(value) : value;
				await this.storeStructuredState(deviceId, flatKey, strVal);
			}
		}
	}

	/**
	 * Create (if missing) and update a single structured-mode state.
	 * Looks up the data-point definition from the flat key; falls back to
	 * generic role/type heuristics for unknown keys.
	 *
	 * @param {string} deviceId - device root ID
	 * @param {string} flatKey  - flat key (e.g. "POWER", "Wifi_RSSI", "ENERGY_Voltage")
	 * @param {unknown} value   - value to store
	 */
	async storeStructuredState(deviceId, flatKey, value) {
		const safeKey = this.sanitizeId(flatKey);
		const stateId = `${deviceId}.${safeKey}`;
		const def = lookupDatapoint(flatKey);

		if (def) {
			await this.setObjectNotExistsAsync(stateId, {
				type: 'state',
				common: {
					name: def.name,
					type: /** @type {ioBroker.CommonType} */ (def.type),
					role: def.role,
					read: def.read,
					write: def.write,
					...(def.unit !== undefined ? { unit: def.unit } : {}),
					...(def.min !== undefined ? { min: def.min } : {}),
					...(def.max !== undefined ? { max: def.max } : {}),
				},
				native: {},
			});
		} else {
			// Generic fallback
			const strVal = String(value);
			await this.ensureObject(
				stateId,
				'state',
				safeKey,
				this.guessStateRole(strVal),
				this.guessStateType(strVal),
			);
		}

		// Convert value to the declared type
		let parsedVal;
		if (def && def.type === 'boolean') {
			parsedVal = this.parseScalar(String(value));
		} else if (def && def.type === 'number') {
			const n = Number(value);
			parsedVal = isNaN(n) ? String(value) : n;
		} else if (def && def.type === 'string') {
			parsedVal = String(value);
		} else if (typeof value === 'string') {
			parsedVal = this.parseScalar(value);
		} else {
			parsedVal = value;
		}

		// @ts-expect-error - parsedVal is narrowed to a valid state value type
		await this.setStateAsync(stateId, { val: parsedVal, ack: true });
	}

	/**
	 * Check whether a newly-seen device already has state objects.
	 * If it has very few states (i.e. it is brand new), publish a Status 0
	 * command to retrieve all device information without requiring a restart.
	 *
	 * @param {string} deviceId - sanitized device ID
	 */
	async _checkAndAutoQuery(deviceId) {
		try {
			const stateView = await this.getObjectViewAsync('system', 'state', {
				startkey: `${this.namespace}.${deviceId}.`,
				endkey: `${this.namespace}.${deviceId}.\u9999`,
			});
			const stateCount = stateView && stateView.rows ? stateView.rows.length : 0;
			// Query if the device has fewer than 3 states — it likely just appeared
			if (stateCount < 3) {
				this.autoQueryDevice(deviceId);
			}
		} catch {
			// Ignore errors — auto-query is best-effort
		}
	}

	/**
	 * Publish "Status 0" (all status) to a Tasmota device via MQTT.
	 * The response populates all device data without requiring a restart.
	 *
	 * @param {string} deviceId - sanitized device ID
	 */
	autoQueryDevice(deviceId) {
		this.log.info(`Auto-querying status for new device: ${deviceId}`);
		this.publishTasmotaCmd(deviceId, 'Status', '0');
	}

	/**
	 * Publish a Tasmota command to a device via MQTT.
	 * Works in both client and server mode, and respects the configured
	 * topic structure and broker prefix.
	 *
	 * @param {string} deviceId  - sanitized device ID
	 * @param {string} cmdName   - Tasmota command (e.g. "POWER", "Status", "ShutterPosition1")
	 * @param {unknown} value    - value to send (boolean → "ON"/"OFF", else String)
	 */
	publishTasmotaCmd(deviceId, cmdName, value) {
		const structure = this.config.brokerTopicStructure || 'prefix-first';
		let topic;
		if (structure === 'device-first') {
			topic = `${deviceId}/cmnd/${cmdName}`;
		} else {
			topic = `cmnd/${deviceId}/${cmdName}`;
		}
		const topicPrefixes = this.getTopicPrefixes();
		if (topicPrefixes.length > 0) {
			topic = `${topicPrefixes[0]}/${topic}`;
		}

		let strValue;
		if (value === true) {
			strValue = 'ON';
		} else if (value === false) {
			strValue = 'OFF';
		} else {
			strValue = value !== null && value !== undefined ? String(value) : '';
		}

		this._publishMqtt(topic, strValue);
	}

	/**
	 * Low-level MQTT publish that works in both client and server (aedes) mode.
	 *
	 * @param {string} topic - full MQTT topic
	 * @param {string} value - string payload
	 */
	_publishMqtt(topic, value) {
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
				// Convert string values (e.g. "ON"→true, "OFF"→false, "42"→42) so the
				// stored value always matches the declared state type.
				const convertedVal = typeof strVal === 'string' ? this.parseScalar(strVal) : strVal;
				await this.setStateAsAck(stateId, convertedVal);
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
		const relativeId = id.replace(`${this.namespace}.`, '');
		const parts = relativeId.split('.');

		if (!this.config.rawTopicMode) {
			// ── STRUCTURED MODE ────────────────────────────────────────────────
			// Flat device state written → publish to Tasmota cmnd topic
			// Expected pattern: device.FLATKEY (exactly 2 parts)
			if (parts.length !== 2) {
				return;
			}
			const [deviceId, flatKey] = parts;
			const def = lookupDatapoint(flatKey);
			if (!def || !def.write || !def.cmd) {
				return; // not a writable datapoint
			}
			this.publishTasmotaCmd(deviceId, def.cmd, state.val);
			return;
		}

		// ── RAW MODE ──────────────────────────────────────────────────────────
		// Only handle cmnd states – stat and tele come from the device and must not be echoed back
		if (parts.length < 3 || parts[1] !== 'cmnd') {
			return;
		}

		// Reconstruct a Tasmota command topic from the state ID
		const device = parts[0];
		const command = parts.slice(2).join('/');

		const structure = this.config.brokerTopicStructure || 'prefix-first';
		let topic;
		if (structure === 'device-first') {
			topic = `${device}/cmnd/${command}`;
		} else {
			topic = `cmnd/${device}/${command}`;
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

		this._publishMqtt(topic, value);
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
	 */
	module.exports = options => new Tasmota(options);
	module.exports.Tasmota = Tasmota;
} else {
	// otherwise start the instance directly
	new Tasmota();
}
