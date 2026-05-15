'use strict';

const { inferType, normalizeToken } = require('./value-utils');
const { PROFILES } = require('./state-profiles');

const WIFI_TOKENS = ['wifi', 'rssi', 'signal', 'ssid', 'bssid', 'channel'];
const SENSOR_TOKENS = [
	'sensor',
	'energy',
	'temperature',
	'humidity',
	'pressure',
	'dewpoint',
	'co2',
	'carbondioxide',
	'tvoc',
	'illuminance',
	'voltage',
	'current',
	'power',
	'apparentpower',
	'reactivepower',
	'factor',
	'today',
	'yesterday',
	'total',
];
const INFO_TOKENS = [
	'info',
	'status',
	'uptime',
	'hostname',
	'ip',
	'ipaddress',
	'mac',
	'version',
	'time',
	'heap',
	'loadavg',
	'mqtt',
	'lwt',
	'friendlyname',
	'switch',
	'button',
];

// Writable Tasmota commands that go into the controls folder.
// Physical switch inputs and button events are intentionally excluded –
// they are read-only device events, not commands sent to the device.
const CONTROL_PATTERNS = [
	/^power\d*$/i,
	/^dimmer\d*$/i,
	/^color\d*$/i,
	/^ct$/i,
	/^hue$/i,
	/^saturation$/i,
	/^white$/i,
	/^channel\d+$/i,
	/^shutteropen\d*$/i,
	/^shutterclose\d*$/i,
	/^shutterstop\d*$/i,
	/^shutterposition\d*$/i,
	/^fanspeed$/i,
	/^speed$/i,
	/^scheme$/i,
	/^led\d*$/i,
];

/**
 * @param {{
 *  prefix: string | null;
 *  sourceParts: string[];
 *  value: unknown;
 * }} input
 * @returns {{
 *  folder: string;
 *  command: string | null;
 *  write: boolean;
 *  role: string;
 *  type: ioBroker.CommonType;
 *  unit?: string;
 * }}
 */
function classifyState(input) {
	const normalized = input.sourceParts.map(part => normalizeToken(part));
	const joined = normalized.join(' ');
	const lastToken = normalized[normalized.length - 1] || '';
	const originalLast = input.sourceParts[input.sourceParts.length - 1] || '';

	let folder = 'raw';
	if (input.prefix === 'cmnd' || CONTROL_PATTERNS.some(pattern => pattern.test(originalLast))) {
		folder = 'controls';
	} else if (WIFI_TOKENS.some(token => joined.includes(token))) {
		folder = 'wifi';
	} else if (SENSOR_TOKENS.some(token => joined.includes(token))) {
		folder = 'sensors';
	} else if (INFO_TOKENS.some(token => joined.includes(token))) {
		folder = 'info';
	}

	const profile = PROFILES[lastToken] || PROFILES[lastToken.replace(/\d+$/, '')] || null;
	const type = profile ? profile.type : inferType(input.value);
	const write = folder === 'controls' || !!profile?.write;
	const role =
		profile?.role ||
		(type === 'boolean' ? (folder === 'controls' ? 'switch' : 'indicator') : type === 'number' ? 'value' : 'text');

	const matchedControlPattern = input.sourceParts.find(part => CONTROL_PATTERNS.some(pattern => pattern.test(part)));
	const command = write ? matchedControlPattern || originalLast || null : null;

	return {
		folder,
		command,
		write,
		role,
		type,
		unit: profile?.unit,
	};
}

module.exports = {
	classifyState,
};
