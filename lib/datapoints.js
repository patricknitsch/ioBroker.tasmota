'use strict';

/**
 * Flat data-point definitions for Tasmota structured mode.
 *
 * Inspired by the ioBroker.sonoff adapter datapoints table.
 * Reference: https://tasmota.github.io/docs/MQTT/
 *
 * The map uses TWO lookup strategies (see `lookupDatapoint`):
 *  1. Exact flat path match:  "ENERGY_Power" → { role:'value.power', unit:'W' }
 *  2. Leaf-key fallback:      "DS18B20_Temperature" → lookup("Temperature") → { role:'value.temperature', unit:'°C' }
 *
 * Each entry shape:
 *   name    - human-readable label
 *   type    - ioBroker CommonType ('boolean'|'number'|'string'|'mixed')
 *   role    - ioBroker state role
 *   read    - readable
 *   write   - writable by the user (will trigger a Tasmota cmnd message)
 *   cmd     - (writable only) Tasmota cmnd command name
 *   unit    - optional unit string
 *   min/max - optional numeric range
 *
 * @typedef {{
 *   name: string,
 *   type: string,
 *   role: string,
 *   read: boolean,
 *   write: boolean,
 *   cmd?: string,
 *   unit?: string,
 *   min?: number,
 *   max?: number
 * }} DatapointDef
 */

/** @type {Record<string, DatapointDef>} */
const DATAPOINTS = {
	// ── Power / Relay ─────────────────────────────────────────────────────────
	POWER: { name: 'Power', type: 'boolean', role: 'switch.power', read: true, write: true, cmd: 'POWER' },
	POWER1: { name: 'Power 1', type: 'boolean', role: 'switch.power', read: true, write: true, cmd: 'Power1' },
	POWER2: { name: 'Power 2', type: 'boolean', role: 'switch.power', read: true, write: true, cmd: 'Power2' },
	POWER3: { name: 'Power 3', type: 'boolean', role: 'switch.power', read: true, write: true, cmd: 'Power3' },
	POWER4: { name: 'Power 4', type: 'boolean', role: 'switch.power', read: true, write: true, cmd: 'Power4' },
	POWER5: { name: 'Power 5', type: 'boolean', role: 'switch.power', read: true, write: true, cmd: 'Power5' },
	POWER6: { name: 'Power 6', type: 'boolean', role: 'switch.power', read: true, write: true, cmd: 'Power6' },
	POWER7: { name: 'Power 7', type: 'boolean', role: 'switch.power', read: true, write: true, cmd: 'Power7' },
	POWER8: { name: 'Power 8', type: 'boolean', role: 'switch.power', read: true, write: true, cmd: 'Power8' },

	// ── Light / Dimmer / Color ────────────────────────────────────────────────
	Dimmer: {
		name: 'Dimmer',
		type: 'number',
		role: 'level.dimmer',
		read: true,
		write: true,
		cmd: 'Dimmer',
		min: 0,
		max: 100,
		unit: '%',
	},
	Color: { name: 'Color (RRGGBB)', type: 'string', role: 'level.color.rgb', read: true, write: true, cmd: 'Color' },
	CT: {
		name: 'Color temperature',
		type: 'number',
		role: 'level.color.temperature',
		read: true,
		write: true,
		cmd: 'CT',
		min: 153,
		max: 500,
		unit: 'mired',
	},
	Hue: {
		name: 'Hue',
		type: 'number',
		role: 'level.color.hue',
		read: true,
		write: true,
		cmd: 'Hue',
		min: 0,
		max: 360,
		unit: '°',
	},
	Saturation: {
		name: 'Saturation',
		type: 'number',
		role: 'level.color.saturation',
		read: true,
		write: true,
		cmd: 'Saturation',
		min: 0,
		max: 100,
		unit: '%',
	},
	White: {
		name: 'White channel',
		type: 'number',
		role: 'level.color.white',
		read: true,
		write: true,
		cmd: 'White',
		min: 0,
		max: 100,
		unit: '%',
	},
	Fade: { name: 'Fade', type: 'boolean', role: 'switch', read: true, write: true, cmd: 'Fade' },
	Speed: {
		name: 'Fade speed',
		type: 'number',
		role: 'value',
		read: true,
		write: true,
		cmd: 'Speed',
		min: 1,
		max: 40,
	},
	Scheme: {
		name: 'Light scheme',
		type: 'number',
		role: 'value',
		read: true,
		write: true,
		cmd: 'Scheme',
		min: 0,
		max: 12,
	},
	Channel: { name: 'Channel', type: 'number', role: 'level', read: true, write: true, cmd: 'Channel' },

	// ── Temperature / Humidity / Pressure ────────────────────────────────────
	Temperature: {
		name: 'Temperature',
		type: 'number',
		role: 'value.temperature',
		read: true,
		write: false,
		unit: '°C',
	},
	Humidity: { name: 'Humidity', type: 'number', role: 'value.humidity', read: true, write: false, unit: '%' },
	DewPoint: { name: 'Dew point', type: 'number', role: 'value.temperature', read: true, write: false, unit: '°C' },
	Pressure: { name: 'Pressure', type: 'number', role: 'value.pressure', read: true, write: false, unit: 'hPa' },
	SeaPressure: {
		name: 'Sea-level pressure',
		type: 'number',
		role: 'value.pressure',
		read: true,
		write: false,
		unit: 'hPa',
	},
	CarbonDioxide: { name: 'CO₂', type: 'number', role: 'value.CO2', read: true, write: false, unit: 'ppm' },
	eCO2: { name: 'eCO₂', type: 'number', role: 'value.eco2', read: true, write: false, unit: 'ppm' },
	TVOC: { name: 'TVOC', type: 'number', role: 'value.tvoc', read: true, write: false, unit: 'ppb' },
	Illuminance: {
		name: 'Illuminance',
		type: 'number',
		role: 'value.illuminance',
		read: true,
		write: false,
		unit: 'lx',
	},
	Distance: { name: 'Distance', type: 'number', role: 'value', read: true, write: false, unit: 'cm' },
	AirQuality: { name: 'Air quality', type: 'number', role: 'value', read: true, write: false, unit: '%' },
	Noise: { name: 'Noise', type: 'number', role: 'value', read: true, write: false, unit: 'dB' },
	UvIndex: { name: 'UV index', type: 'number', role: 'value.uv', read: true, write: false },
	'PM2.5': { name: 'PM2.5', type: 'number', role: 'value', read: true, write: false, unit: 'µg/m³' },
	PM10: { name: 'PM10', type: 'number', role: 'value', read: true, write: false, unit: 'µg/m³' },

	// ── Energy Monitoring ─────────────────────────────────────────────────────
	// Exact path overrides for ENERGY sub-object keys to distinguish from POWER (relay)
	ENERGY_Power: { name: 'Power', type: 'number', role: 'value.power', read: true, write: false, unit: 'W' },
	ENERGY_ApparentPower: {
		name: 'Apparent power',
		type: 'number',
		role: 'value.power.consumption',
		read: true,
		write: false,
		unit: 'VA',
	},
	ENERGY_ReactivePower: {
		name: 'Reactive power',
		type: 'number',
		role: 'value.power.consumption',
		read: true,
		write: false,
		unit: 'var',
	},
	ENERGY_Voltage: {
		name: 'Voltage',
		type: 'number',
		role: 'value.voltage',
		read: true,
		write: false,
		unit: 'V',
	},
	ENERGY_Current: {
		name: 'Current',
		type: 'number',
		role: 'value.current',
		read: true,
		write: false,
		unit: 'A',
	},
	ENERGY_Factor: { name: 'Power factor', type: 'number', role: 'value', read: true, write: false },
	ENERGY_Today: {
		name: 'Energy today',
		type: 'number',
		role: 'value.power.consumption',
		read: true,
		write: false,
		unit: 'kWh',
	},
	ENERGY_Yesterday: {
		name: 'Energy yesterday',
		type: 'number',
		role: 'value.power.consumption',
		read: true,
		write: false,
		unit: 'kWh',
	},
	ENERGY_Total: {
		name: 'Total energy',
		type: 'number',
		role: 'value.power.consumption',
		read: true,
		write: false,
		unit: 'kWh',
	},
	ENERGY_Period: { name: 'Period', type: 'number', role: 'value', read: true, write: false },
	ENERGY_TotalStartTime: { name: 'Total start time', type: 'string', role: 'date', read: true, write: false },
	// Leaf key fallbacks for energy (used when ENERGY_ prefix not present)
	Voltage: { name: 'Voltage', type: 'number', role: 'value.voltage', read: true, write: false, unit: 'V' },
	Current: { name: 'Current', type: 'number', role: 'value.current', read: true, write: false, unit: 'A' },
	Factor: { name: 'Power factor', type: 'number', role: 'value', read: true, write: false },
	Today: {
		name: 'Energy today',
		type: 'number',
		role: 'value.power.consumption',
		read: true,
		write: false,
		unit: 'kWh',
	},
	Yesterday: {
		name: 'Energy yesterday',
		type: 'number',
		role: 'value.power.consumption',
		read: true,
		write: false,
		unit: 'kWh',
	},
	Total: {
		name: 'Total energy',
		type: 'number',
		role: 'value.power.consumption',
		read: true,
		write: false,
		unit: 'kWh',
	},

	// ── Wi-Fi / Device Info ───────────────────────────────────────────────────
	RSSI: { name: 'WiFi RSSI', type: 'number', role: 'value.rssi', read: true, write: false },
	Signal: { name: 'WiFi signal', type: 'number', role: 'value.rssi', read: true, write: false, unit: 'dBm' },
	SSId: { name: 'WiFi SSID', type: 'string', role: 'info.ssid', read: true, write: false },
	BSSId: { name: 'WiFi BSSID', type: 'string', role: 'value', read: true, write: false },
	// Note: Wifi_Channel disambiguates from Channel (light, writable)
	Wifi_Channel: { name: 'WiFi channel', type: 'number', role: 'value', read: true, write: false },
	Wifi_RSSI: { name: 'WiFi RSSI', type: 'number', role: 'value.rssi', read: true, write: false },
	Wifi_Signal: { name: 'WiFi signal', type: 'number', role: 'value.rssi', read: true, write: false, unit: 'dBm' },
	Wifi_SSId: { name: 'WiFi SSID', type: 'string', role: 'info.ssid', read: true, write: false },
	Wifi_BSSId: { name: 'WiFi BSSID', type: 'string', role: 'value', read: true, write: false },
	Wifi_AP: { name: 'WiFi AP', type: 'number', role: 'value', read: true, write: false },
	Wifi_Downtime: { name: 'WiFi downtime', type: 'string', role: 'value', read: true, write: false },
	Wifi_LinkCount: { name: 'WiFi link count', type: 'number', role: 'value', read: true, write: false },
	Hostname: { name: 'Hostname', type: 'string', role: 'info.name', read: true, write: false },
	IPAddress: { name: 'IP address', type: 'string', role: 'info.ip', read: true, write: false },
	Gateway: { name: 'Gateway', type: 'string', role: 'value', read: true, write: false },
	Subnetmask: { name: 'Subnet mask', type: 'string', role: 'value', read: true, write: false },
	DNSServer1: { name: 'DNS server 1', type: 'string', role: 'value', read: true, write: false },
	DNSServer2: { name: 'DNS server 2', type: 'string', role: 'value', read: true, write: false },
	Mac: { name: 'MAC address', type: 'string', role: 'info.mac', read: true, write: false },

	// ── System info ──────────────────────────────────────────────────────────
	Uptime: { name: 'Uptime', type: 'string', role: 'value', read: true, write: false },
	UptimeSec: { name: 'Uptime (s)', type: 'number', role: 'value', read: true, write: false, unit: 's' },
	Time: { name: 'Device time', type: 'string', role: 'date', read: true, write: false },
	SleepMode: { name: 'Sleep mode', type: 'string', role: 'value', read: true, write: false },
	Sleep: { name: 'Sleep (ms)', type: 'number', role: 'value', read: true, write: false, unit: 'ms' },
	LoadAvg: { name: 'Load average', type: 'number', role: 'value', read: true, write: false },
	Heap: { name: 'Free heap', type: 'number', role: 'value', read: true, write: false, unit: 'kB' },
	MqttCount: { name: 'MQTT reconnect count', type: 'number', role: 'value', read: true, write: false },

	// StatusFWR fields
	Version: { name: 'Firmware version', type: 'string', role: 'value', read: true, write: false },
	BuildDateTime: { name: 'Build date/time', type: 'string', role: 'date', read: true, write: false },
	Core: { name: 'SDK core version', type: 'string', role: 'value', read: true, write: false },
	CpuFrequency: { name: 'CPU frequency', type: 'number', role: 'value', read: true, write: false, unit: 'MHz' },
	Hardware: { name: 'Hardware', type: 'string', role: 'value', read: true, write: false },

	// StatusNET fields (from Status 5)
	StatusNET_Hostname: { name: 'Hostname', type: 'string', role: 'info.name', read: true, write: false },
	StatusNET_IPAddress: { name: 'IP address', type: 'string', role: 'info.ip', read: true, write: false },
	StatusNET_Mac: { name: 'MAC address', type: 'string', role: 'info.mac', read: true, write: false },
	StatusNET_Gateway: { name: 'Gateway', type: 'string', role: 'value', read: true, write: false },

	// StatusFWR fields (from Status 2)
	StatusFWR_Version: { name: 'Firmware version', type: 'string', role: 'value', read: true, write: false },
	StatusFWR_BuildDateTime: { name: 'Build date/time', type: 'string', role: 'date', read: true, write: false },
	StatusFWR_Hardware: { name: 'Hardware', type: 'string', role: 'value', read: true, write: false },
	StatusFWR_CpuFrequency: {
		name: 'CPU frequency',
		type: 'number',
		role: 'value',
		read: true,
		write: false,
		unit: 'MHz',
	},

	// ── Shutter positions (exact flat-path for disambiguation) ───────────────
	Shutter1_Position: {
		name: 'Shutter 1 position',
		type: 'number',
		role: 'level.blind',
		read: true,
		write: true,
		cmd: 'ShutterPosition1',
		min: 0,
		max: 100,
		unit: '%',
	},
	Shutter1_Tilt: {
		name: 'Shutter 1 tilt',
		type: 'number',
		role: 'level.tilt',
		read: true,
		write: true,
		cmd: 'ShutterTilt1',
		unit: '%',
	},
	Shutter1_Direction: { name: 'Shutter 1 direction', type: 'number', role: 'value', read: true, write: false },
	Shutter1_Target: {
		name: 'Shutter 1 target',
		type: 'number',
		role: 'value',
		read: true,
		write: false,
		unit: '%',
	},
	Shutter2_Position: {
		name: 'Shutter 2 position',
		type: 'number',
		role: 'level.blind',
		read: true,
		write: true,
		cmd: 'ShutterPosition2',
		min: 0,
		max: 100,
		unit: '%',
	},
	Shutter2_Tilt: {
		name: 'Shutter 2 tilt',
		type: 'number',
		role: 'level.tilt',
		read: true,
		write: true,
		cmd: 'ShutterTilt2',
		unit: '%',
	},
	Shutter2_Direction: { name: 'Shutter 2 direction', type: 'number', role: 'value', read: true, write: false },
	Shutter2_Target: {
		name: 'Shutter 2 target',
		type: 'number',
		role: 'value',
		read: true,
		write: false,
		unit: '%',
	},
	Shutter3_Position: {
		name: 'Shutter 3 position',
		type: 'number',
		role: 'level.blind',
		read: true,
		write: true,
		cmd: 'ShutterPosition3',
		min: 0,
		max: 100,
		unit: '%',
	},
	Shutter3_Tilt: {
		name: 'Shutter 3 tilt',
		type: 'number',
		role: 'level.tilt',
		read: true,
		write: true,
		cmd: 'ShutterTilt3',
		unit: '%',
	},
	Shutter3_Direction: { name: 'Shutter 3 direction', type: 'number', role: 'value', read: true, write: false },
	Shutter3_Target: {
		name: 'Shutter 3 target',
		type: 'number',
		role: 'value',
		read: true,
		write: false,
		unit: '%',
	},
	Shutter4_Position: {
		name: 'Shutter 4 position',
		type: 'number',
		role: 'level.blind',
		read: true,
		write: true,
		cmd: 'ShutterPosition4',
		min: 0,
		max: 100,
		unit: '%',
	},
	Shutter4_Tilt: {
		name: 'Shutter 4 tilt',
		type: 'number',
		role: 'level.tilt',
		read: true,
		write: true,
		cmd: 'ShutterTilt4',
		unit: '%',
	},
	Shutter4_Direction: { name: 'Shutter 4 direction', type: 'number', role: 'value', read: true, write: false },
	Shutter4_Target: {
		name: 'Shutter 4 target',
		type: 'number',
		role: 'value',
		read: true,
		write: false,
		unit: '%',
	},

	// ── Fan / PWM / Analog ────────────────────────────────────────────────────
	FanSpeed: {
		name: 'Fan speed',
		type: 'number',
		role: 'value.speed.fan',
		read: true,
		write: true,
		cmd: 'FanSpeed',
		min: 0,
		max: 3,
	},
	VCC: { name: 'VCC', type: 'number', role: 'value.voltage', read: true, write: false, unit: 'V' },
	Vcc: { name: 'VCC', type: 'number', role: 'value.voltage', read: true, write: false, unit: 'V' },
};

/**
 * Look up a data-point definition for a given flat key.
 *
 * Strategy:
 *  1. Exact match on the full flat key (e.g. "ENERGY_Power", "Wifi_RSSI")
 *  2. Leaf-key fallback: last segment after the last underscore (e.g. "Temperature" from "DS18B20_Temperature")
 *
 * Returns null if nothing is found (caller should use generic heuristics).
 *
 * @param {string} flatKey - flattened state key (nested levels joined by "_")
 * @returns {DatapointDef | null} data-point definition, or null if not found
 */
function lookupDatapoint(flatKey) {
	if (DATAPOINTS[flatKey]) {
		return DATAPOINTS[flatKey];
	}
	const lastUnderscore = flatKey.lastIndexOf('_');
	if (lastUnderscore > 0) {
		const leafKey = flatKey.slice(lastUnderscore + 1);
		if (DATAPOINTS[leafKey]) {
			return DATAPOINTS[leafKey];
		}
	}
	return null;
}

/**
 * STATUS wrapper key → effective command name mapping.
 * The Tasmota Status 0 response wraps each section in a parent key.
 * We unwrap the sections that match STATE/SENSOR so they are treated as such.
 */
const STATUS_WRAPPER_COMMANDS = {
	StatusSTS: 'STATE', // Status 11 response — same content as tele/STATE
	StatusSNS: 'SENSOR', // Status 10 response — same content as tele/SENSOR
};

module.exports = { DATAPOINTS, lookupDatapoint, STATUS_WRAPPER_COMMANDS };
