'use strict';

const { isPowerKey, getDatapoint } = require('./datapoints');

/**
 * path     - relative path within device (e.g. "status.online", "energy.power")
 *
 * value    - parsed value
 *
 * writable - whether the ioBroker state should be writable
 */

/**
 * Fields whose lowercase key should be silently skipped when encountered
 * inside tele/STATE or sensor payloads.
 */
const SKIP_FIELDS = new Set(['time', 'tempunit', 'pressureunit', 'sleepmode', 'sleep', 'uptimesec']);

/**
 * Explicit mapping for fields inside tele/STATE Wifi sub-object.
 * null means "skip this field".
 *
 */
const WIFI_FIELD_MAP = {
	rssi: 'wifi.rssi',
	signal: 'wifi.signal',
	ssid: 'wifi.ssid',
	bssid: 'wifi.bssid',
	ap: null,
	channel: 'wifi.channel',
	mode: null,
	linkcount: 'wifi.linkCount',
	downtime: null,
};

/**
 * Explicit mapping for top-level scalar fields in tele/STATE that do NOT
 * fall into the POWER/Dimmer/Color pattern.
 * null means "skip this field".
 *
 */
const STATE_SCALAR_MAP = {
	uptime: 'info.uptime',
	heap: 'info.heap',
	loadavg: 'info.loadAvg',
	mqttcount: 'info.mqttCount',
};

/**
 * Safe JSON parse.
 *
 * @param {string | object} input
 * @returns {object | null}
 */
function tryParse(input) {
	if (input !== null && typeof input === 'object') {
		return input;
	}
	try {
		const parsed = JSON.parse(input);
		return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/**
 * Convert a Tasmota ON/OFF/numeric string to a typed JS value.
 *
 * @param {unknown} value
 * @returns {boolean | number | string | unknown}
 */
function coerce(value) {
	if (typeof value !== 'string') {
		return value;
	}
	if (value === 'ON' || value === 'true') {
		return true;
	}
	if (value === 'OFF' || value === 'false') {
		return false;
	}
	const n = Number(value);
	if (!isNaN(n) && value.trim() !== '') {
		return n;
	}
	return value;
}

// ── Section parsers ──────────────────────────────────────────────────────────

/**
 * Parse the Wifi sub-object inside tele/STATE.
 *
 * @param {object} wifi
 * @returns {{ path: string, value: unknown, writable: boolean }[]}
 */
function parseWifi(wifi) {
	const results = [];
	for (const [k, v] of Object.entries(wifi)) {
		const mapped = WIFI_FIELD_MAP[k.toLowerCase()];
		if (mapped === null) {
			continue;
		} // explicitly ignored
		if (mapped) {
			results.push({ path: mapped, value: coerce(v), writable: false });
		}
		// anything else in Wifi is silently dropped
	}
	return results;
}

/**
 * Parse tele/STATE JSON into structured MappedState entries.
 *
 * @param {object} obj
 * @returns {{ path: string, value: unknown, writable: boolean }[]}
 */
function parseStateObject(obj) {
	const results = [];

	for (const [key, value] of Object.entries(obj)) {
		const lkey = key.toLowerCase();

		// Skip time / meta fields
		if (SKIP_FIELDS.has(lkey)) {
			continue;
		}

		// Wifi sub-object
		if (lkey === 'wifi' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
			results.push(...parseWifi(value));
			continue;
		}

		// POWER*, Dimmer*, Color, CT → controls channel
		if (isPowerKey(key)) {
			results.push({ path: `controls.${key.toUpperCase()}`, value: coerce(value), writable: true });
			continue;
		}
		if (/^dimmer\d*$/i.test(key)) {
			results.push({ path: `controls.${key}`, value: coerce(value), writable: true });
			continue;
		}
		if (lkey === 'color') {
			results.push({ path: 'controls.Color', value, writable: true });
			continue;
		}
		if (lkey === 'ct') {
			results.push({ path: 'controls.CT', value: coerce(value), writable: true });
			continue;
		}
		if (lkey === 'hsbccolor' || lkey === 'hsbcolor') {
			results.push({ path: 'controls.HSBColor', value, writable: true });
			continue;
		}

		// Explicit scalar mapping
		const explicitPath = STATE_SCALAR_MAP[lkey];
		if (explicitPath === null) {
			continue;
		}
		if (explicitPath) {
			results.push({ path: explicitPath, value: coerce(value), writable: false });
			continue;
		}

		// Nested objects not explicitly handled → skip
		if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			continue;
		}

		// Unknown scalar — put in status channel
		results.push({ path: `status.${key}`, value: coerce(value), writable: false });
	}
	return results;
}

/**
 * Parse tele/ENERGY or the ENERGY sub-object of stat/STATUS8.
 *
 * @param {object} obj
 * @returns {{ path: string, value: unknown, writable: boolean }[]}
 */
function parseEnergyObject(obj) {
	const results = [];
	const fields = {
		Voltage: 'energy.voltage',
		Current: 'energy.current',
		Power: 'energy.power',
		ApparentPower: 'energy.apparentPower',
		ReactivePower: 'energy.reactivePower',
		Factor: 'energy.factor',
		Today: 'energy.today',
		Yesterday: 'energy.yesterday',
		Total: 'energy.total',
		Period: 'energy.period',
	};
	for (const [k, path] of Object.entries(fields)) {
		if (obj[k] !== undefined) {
			results.push({ path, value: coerce(obj[k]), writable: false });
		}
	}
	return results;
}

/**
 * Parse a sensor payload like { DHT22: { Temperature: 25, Humidity: 60 } }.
 * Known non-sensor fields are routed to their DATAPOINTS-defined channel (info, energy).
 * Sensor fields and unknown fields go to sensors.{prefix_key} with optional sensor prefix.
 *
 * @param {object}  obj
 * @param {string}  [prefix] - sensor device name (e.g. "DHT22"), used to namespace multiple sensors
 * @returns {{ path: string, value: unknown, writable: boolean }[]}
 */
function parseSensorObject(obj, prefix) {
	const results = [];

	for (const [key, value] of Object.entries(obj)) {
		if (SKIP_FIELDS.has(key.toLowerCase())) {
			continue;
		}

		if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			// Named sensor sub-object (e.g. DHT22) → recurse with sensor name as prefix
			results.push(...parseSensorObject(value, key));
		} else {
			// Look up the key in DATAPOINTS to find the target channel (keyword-based routing)
			const dp = getDatapoint(key);
			// Route known non-sensor, non-controls fields (e.g. info, energy) to their
			// declared channel. Sensor fields (channel='sensors') and unknown fields
			// still go to the sensors channel with the sensor-device prefix applied.
			if (dp && dp.channel !== 'controls' && dp.channel !== 'sensors') {
				// All DATAPOINTS keys are lowercase (e.g. 'hostname', 'voltage'), so
				// key.toLowerCase() produces a path consistent with the explicit parsers
				// (e.g. Hostname → info.hostname, Voltage → energy.voltage).
				results.push({
					path: `${dp.channel}.${key.toLowerCase()}`,
					value: coerce(value),
					writable: false,
				});
			} else {
				// Sensor field or unknown field: route to sensors with optional sensor-device prefix
				const stateKey = prefix ? `${prefix}_${key}` : key;
				results.push({
					path: `sensors.${stateKey}`,
					value: coerce(value),
					writable: false,
				});
			}
		}
	}
	return results;
}

/**
 * Parse stat/STATUS (Status 1) JSON.
 *
 * @param {object} obj
 * @returns {{ path: string, value: unknown, writable: boolean }[]}
 */
function parseStatusMessage(obj) {
	const s = obj.Status || obj;
	const results = [];
	if (s.FriendlyName !== undefined) {
		const name = Array.isArray(s.FriendlyName) ? s.FriendlyName[0] : String(s.FriendlyName);
		results.push({ path: 'info.friendlyName', value: name, writable: false });
	}
	if (s.Module !== undefined) {
		results.push({ path: 'info.module', value: String(s.Module), writable: false });
	}
	if (s.Power !== undefined) {
		results.push({ path: 'controls.POWER', value: s.Power !== 0 && s.Power !== '0', writable: true });
	}
	return results;
}

/**
 * Parse stat/STATUS2 (Firmware) JSON.
 *
 * @param {object} obj
 * @returns {{ path: string, value: unknown, writable: boolean }[]}
 */
function parseStatus2Message(obj) {
	const fw = obj.StatusFWR || obj;
	const results = [];
	if (fw.Version) {
		results.push({ path: 'info.version', value: String(fw.Version), writable: false });
	}
	if (fw.Hardware) {
		results.push({ path: 'info.hardware', value: String(fw.Hardware), writable: false });
	}
	if (fw.Core) {
		results.push({ path: 'info.core', value: String(fw.Core), writable: false });
	}
	if (fw.SDK) {
		results.push({ path: 'info.sdk', value: String(fw.SDK), writable: false });
	}
	return results;
}

/**
 * Parse stat/STATUS5 (Network) JSON.
 *
 * @param {object} obj
 * @returns {{ path: string, value: unknown, writable: boolean }[]}
 */
function parseStatus5Message(obj) {
	const net = obj.StatusNET || obj;
	const results = [];
	if (net.Hostname) {
		results.push({ path: 'info.hostname', value: String(net.Hostname), writable: false });
	}
	if (net.IPAddress) {
		results.push({ path: 'info.ip', value: String(net.IPAddress), writable: false });
	}
	if (net.Mac) {
		results.push({ path: 'info.mac', value: String(net.Mac), writable: false });
	}
	if (net.Gateway) {
		results.push({ path: 'info.gateway', value: String(net.Gateway), writable: false });
	}
	return results;
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Map a Tasmota MQTT message to a list of structured ioBroker state updates.
 *
 * @param {string}          prefix  - tele | stat | cmnd
 * @param {string}          command - STATE / SENSOR / ENERGY / LWT / STATUS / POWER / RESULT / …
 * @param {string | object} payload - raw MQTT payload string or already-parsed object
 * @returns {{ path: string, value: unknown, writable: boolean }[]}
 */
function mapMessage(prefix, command, payload) {
	const cmd = command.toUpperCase();
	const pfx = prefix.toLowerCase();

	// ── LWT ──────────────────────────────────────────────────────────────
	if (cmd === 'LWT') {
		const online = typeof payload === 'string' ? payload.toLowerCase() === 'online' : Boolean(payload);
		return [{ path: 'info.online', value: online, writable: false }];
	}

	// ── tele/STATE ────────────────────────────────────────────────────────
	if (pfx === 'tele' && cmd === 'STATE') {
		const obj = tryParse(payload);
		return obj ? parseStateObject(obj) : [];
	}

	// ── tele/SENSOR ───────────────────────────────────────────────────────
	if (pfx === 'tele' && cmd === 'SENSOR') {
		const obj = tryParse(payload);
		return obj ? parseSensorObject(obj) : [];
	}

	// ── tele/ENERGY ───────────────────────────────────────────────────────
	if (pfx === 'tele' && cmd === 'ENERGY') {
		const obj = tryParse(payload);
		return obj ? parseEnergyObject(obj) : [];
	}

	// ── stat/RESULT ───────────────────────────────────────────────────────
	if (pfx === 'stat' && cmd === 'RESULT') {
		const obj = tryParse(payload);
		if (!obj) {
			return [];
		}
		const results = [];
		for (const [key, value] of Object.entries(obj)) {
			if (isPowerKey(key)) {
				results.push({ path: `controls.${key.toUpperCase()}`, value: coerce(value), writable: true });
			} else if (/^dimmer\d*$/i.test(key)) {
				results.push({ path: `controls.${key}`, value: coerce(value), writable: true });
			} else if (key.toLowerCase() === 'color') {
				results.push({ path: 'controls.Color', value, writable: true });
			} else if (key.toLowerCase() === 'ct') {
				results.push({ path: 'controls.CT', value: coerce(value), writable: true });
			} else if (key === 'ENERGY' && value !== null && typeof value === 'object') {
				results.push(...parseEnergyObject(value));
			}
		}
		return results;
	}

	// ── stat/POWER* ───────────────────────────────────────────────────────
	if (pfx === 'stat' && isPowerKey(cmd)) {
		const val = typeof payload === 'string' ? payload === 'ON' || payload === '1' : Boolean(payload);
		return [{ path: `controls.${cmd}`, value: val, writable: true }];
	}

	// ── stat/STATUS (Status 1) ────────────────────────────────────────────
	if (pfx === 'stat' && cmd === 'STATUS') {
		const obj = tryParse(payload);
		return obj ? parseStatusMessage(obj) : [];
	}

	// ── stat/STATUS2 (Firmware) ───────────────────────────────────────────
	if (pfx === 'stat' && cmd === 'STATUS2') {
		const obj = tryParse(payload);
		return obj ? parseStatus2Message(obj) : [];
	}

	// ── stat/STATUS5 (Network) ────────────────────────────────────────────
	if (pfx === 'stat' && cmd === 'STATUS5') {
		const obj = tryParse(payload);
		return obj ? parseStatus5Message(obj) : [];
	}

	// ── stat/STATUS8 (Energy / Sensor) ────────────────────────────────────
	if (pfx === 'stat' && cmd === 'STATUS8') {
		const obj = tryParse(payload);
		if (!obj) {
			return [];
		}
		const src = obj.StatusSNS || obj;
		const results = [];
		if (src.ENERGY) {
			results.push(...parseEnergyObject(src.ENERGY));
		}
		for (const [k, v] of Object.entries(src)) {
			if (k === 'ENERGY' || k === 'Time') {
				continue;
			}
			if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
				results.push(...parseSensorObject(v, k));
			}
		}
		return results;
	}

	// ── stat/STATUS10 (Sensors) ───────────────────────────────────────────
	if (pfx === 'stat' && cmd === 'STATUS10') {
		const obj = tryParse(payload);
		if (!obj) {
			return [];
		}
		const src = obj.StatusSNS || obj;
		return parseSensorObject(src);
	}

	// ── Unrecognised ──────────────────────────────────────────────────────
	return [];
}

module.exports = { mapMessage, coerce };
