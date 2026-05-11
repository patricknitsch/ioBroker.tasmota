'use strict';

// DatapointDef: { channel, name, type, role, read, write, unit?, min?, max? }
// Inline JSDoc typedef is intentionally avoided here; use JSDoc type comments
// at call sites instead to keep TypeScript happy without a separate .d.ts file.

/**
 * Known Tasmota datapoint definitions keyed by lowercase field name.
 * Types and roles are derived from the ioBroker.sonoff adapter as reference.
 *
 */
const DATAPOINTS = {
	// ── Info / Connection ────────────────────────────────────────────
	online: {
		channel: 'info',
		name: 'Connected',
		type: 'boolean',
		role: 'indicator.connected',
		read: true,
		write: false,
	},

	// ── WiFi ─────────────────────────────────────────────────────────
	rssi: {
		channel: 'wifi',
		name: 'RSSI',
		type: 'number',
		role: 'value.rssi',
		unit: 'dBm',
		read: true,
		write: false,
	},
	signal: {
		channel: 'wifi',
		name: 'Signal Quality',
		type: 'number',
		role: 'value',
		unit: '%',
		read: true,
		write: false,
	},
	ssid: {
		channel: 'wifi',
		name: 'WiFi SSID',
		type: 'string',
		role: 'info.ssid',
		read: true,
		write: false,
	},
	linkcount: {
		channel: 'wifi',
		name: 'WiFi Reconnects',
		type: 'number',
		role: 'value',
		read: true,
		write: false,
	},
	bssid: {
		channel: 'wifi',
		name: 'BSSID',
		type: 'string',
		role: 'info.mac',
		read: true,
		write: false,
	},
	channel: {
		channel: 'wifi',
		name: 'WiFi Channel',
		type: 'number',
		role: 'value',
		read: true,
		write: false,
	},

	// ── Status ───────────────────────────────────────────────────────
	heap: {
		channel: 'info',
		name: 'Free Heap',
		type: 'number',
		role: 'value',
		unit: 'kB',
		read: true,
		write: false,
	},
	loadavg: {
		channel: 'info',
		name: 'Load Average',
		type: 'number',
		role: 'value',
		unit: '%',
		read: true,
		write: false,
	},
	mqttcount: {
		channel: 'info',
		name: 'MQTT Connect Count',
		type: 'number',
		role: 'value',
		read: true,
		write: false,
	},

	// ── Info ─────────────────────────────────────────────────────────
	hostname: {
		channel: 'info',
		name: 'Hostname',
		type: 'string',
		role: 'info.name',
		read: true,
		write: false,
	},
	ip: {
		channel: 'info',
		name: 'IP Address',
		type: 'string',
		role: 'info.ip',
		read: true,
		write: false,
	},
	mac: {
		channel: 'info',
		name: 'MAC Address',
		type: 'string',
		role: 'info.mac',
		read: true,
		write: false,
	},
	version: {
		channel: 'info',
		name: 'Firmware Version',
		type: 'string',
		role: 'info.firmware',
		read: true,
		write: false,
	},
	hardware: {
		channel: 'info',
		name: 'Hardware',
		type: 'string',
		role: 'info.hardware',
		read: true,
		write: false,
	},
	core: {
		channel: 'info',
		name: 'Arduino Core',
		type: 'string',
		role: 'info.hardware',
		read: true,
		write: false,
	},
	uptime: {
		channel: 'info',
		name: 'Uptime',
		type: 'string',
		role: 'info.uptime',
		read: true,
		write: false,
	},
	module: {
		channel: 'info',
		name: 'Module',
		type: 'string',
		role: 'info.type',
		read: true,
		write: false,
	},
	friendlyname: {
		channel: 'info',
		name: 'Friendly Name',
		type: 'string',
		role: 'info.name',
		read: true,
		write: false,
	},
	gateway: {
		channel: 'info',
		name: 'Gateway',
		type: 'string',
		role: 'info.ip',
		read: true,
		write: false,
	},

	// ── Energy ───────────────────────────────────────────────────────
	voltage: {
		channel: 'energy',
		name: 'Voltage',
		type: 'number',
		role: 'value.voltage',
		unit: 'V',
		read: true,
		write: false,
	},
	current: {
		channel: 'energy',
		name: 'Current',
		type: 'number',
		role: 'value.current',
		unit: 'A',
		read: true,
		write: false,
	},
	power: {
		channel: 'energy',
		name: 'Power',
		type: 'number',
		role: 'value.power',
		unit: 'W',
		read: true,
		write: false,
	},
	apparentpower: {
		channel: 'energy',
		name: 'Apparent Power',
		type: 'number',
		role: 'value.power',
		unit: 'VA',
		read: true,
		write: false,
	},
	reactivepower: {
		channel: 'energy',
		name: 'Reactive Power',
		type: 'number',
		role: 'value.power',
		unit: 'var',
		read: true,
		write: false,
	},
	factor: {
		channel: 'energy',
		name: 'Power Factor',
		type: 'number',
		role: 'value',
		min: 0,
		max: 1,
		read: true,
		write: false,
	},
	today: {
		channel: 'energy',
		name: 'Energy Today',
		type: 'number',
		role: 'value.power.consumption',
		unit: 'kWh',
		read: true,
		write: false,
	},
	yesterday: {
		channel: 'energy',
		name: 'Energy Yesterday',
		type: 'number',
		role: 'value.power.consumption',
		unit: 'kWh',
		read: true,
		write: false,
	},
	total: {
		channel: 'energy',
		name: 'Total Energy',
		type: 'number',
		role: 'value.power.consumption',
		unit: 'kWh',
		read: true,
		write: false,
	},
	period: {
		channel: 'energy',
		name: 'Power Period',
		type: 'number',
		role: 'value.power',
		unit: 'W',
		read: true,
		write: false,
	},

	// ── Sensors ──────────────────────────────────────────────────────
	temperature: {
		channel: 'sensors',
		name: 'Temperature',
		type: 'number',
		role: 'value.temperature',
		unit: '°C',
		read: true,
		write: false,
	},
	humidity: {
		channel: 'sensors',
		name: 'Humidity',
		type: 'number',
		role: 'value.humidity',
		unit: '%',
		read: true,
		write: false,
	},
	dewpoint: {
		channel: 'sensors',
		name: 'Dew Point',
		type: 'number',
		role: 'value.temperature',
		unit: '°C',
		read: true,
		write: false,
	},
	pressure: {
		channel: 'sensors',
		name: 'Pressure',
		type: 'number',
		role: 'value.pressure',
		unit: 'hPa',
		read: true,
		write: false,
	},
	carbondioxide: {
		channel: 'sensors',
		name: 'CO₂',
		type: 'number',
		role: 'value.co2',
		unit: 'ppm',
		read: true,
		write: false,
	},
	co2: {
		channel: 'sensors',
		name: 'CO₂',
		type: 'number',
		role: 'value.co2',
		unit: 'ppm',
		read: true,
		write: false,
	},
	tvoc: {
		channel: 'sensors',
		name: 'Total VOC',
		type: 'number',
		role: 'value',
		unit: 'ppb',
		read: true,
		write: false,
	},
	illuminance: {
		channel: 'sensors',
		name: 'Illuminance',
		type: 'number',
		role: 'value.illuminance',
		unit: 'lux',
		read: true,
		write: false,
	},
	gas: {
		channel: 'sensors',
		name: 'Gas Resistance',
		type: 'number',
		role: 'value',
		unit: 'kΩ',
		read: true,
		write: false,
	},
};

/** Matches POWER, POWER1 … POWER8 (case-insensitive). */
const RE_POWER = /^power\d*$/i;

/** Matches Dimmer, Dimmer1 … (case-insensitive). */
const RE_DIMMER = /^dimmer\d*$/i;

/**
 * Return the datapoint definition for a known Tasmota field name.
 * Also handles POWER* and Dimmer* patterns dynamically.
 *
 * @param {string} key - field name (any case)
 * @returns {{ channel: string, name: string, type: string, role: string, read: boolean, write: boolean, unit?: string, min?: number, max?: number } | undefined}
 */
function getDatapoint(key) {
	const lkey = key.toLowerCase();

	// POWER* pattern takes priority over the energy 'power' entry in DATAPOINTS.
	// Standalone POWER (and POWER1-8) are relay switch controls, whereas the
	// energy 'Power' measurement is always mapped explicitly by the energy parser.
	if (RE_POWER.test(key)) {
		return {
			channel: 'controls',
			name: key.toUpperCase(),
			type: 'boolean',
			role: 'switch.power',
			read: true,
			write: true,
		};
	}

	if (RE_DIMMER.test(key)) {
		return {
			channel: 'controls',
			name: key,
			type: 'number',
			role: 'level.dimmer',
			unit: '%',
			min: 0,
			max: 100,
			read: true,
			write: true,
		};
	}

	if (DATAPOINTS[lkey]) {
		return DATAPOINTS[lkey];
	}

	return undefined;
}

/**
 * Build the ioBroker common block for a state from a datapoint definition.
 * Falls back to a sensible generic definition when the datapoint is unknown.
 *
 * @param {string}       key   - field name
 * @param {unknown}      value - current value (used for type inference fallback)
 * @param {boolean}      [writable] - override write flag
 * @returns {object} ioBroker common object
 */
function buildCommon(key, value, writable) {
	const dp = getDatapoint(key);
	if (dp) {
		const common = {
			name: dp.name,
			type: dp.type,
			role: dp.role,
			read: dp.read,
			write: writable !== undefined ? writable : dp.write,
		};
		if (dp.unit) {
			common.unit = dp.unit;
		}
		if (dp.min !== undefined) {
			common.min = dp.min;
		}
		if (dp.max !== undefined) {
			common.max = dp.max;
		}
		return common;
	}

	// Unknown field — infer from value
	const valStr = String(value);
	let type = 'string';
	let role = 'text';
	if (value === true || value === false || valStr === 'ON' || valStr === 'OFF') {
		type = 'boolean';
		role = 'indicator';
	} else if (!isNaN(Number(valStr)) && valStr.trim() !== '') {
		type = 'number';
		role = 'value';
	}

	return {
		name: key,
		type,
		role,
		read: true,
		write: writable !== undefined ? writable : false,
	};
}

/**
 * Return true if key matches the POWER pattern.
 *
 * @param {string} key
 * @returns {boolean}
 */
function isPowerKey(key) {
	return RE_POWER.test(key);
}

module.exports = { getDatapoint, buildCommon, isPowerKey, DATAPOINTS };
