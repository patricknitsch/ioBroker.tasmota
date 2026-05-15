'use strict';

const PROFILES = {
	// Connectivity
	online: { type: 'boolean', role: 'indicator.reachable' },
	lwt: { type: 'boolean', role: 'indicator.reachable' },

	// Device info
	hostname: { type: 'string', role: 'info.name' },
	friendlyname: { type: 'string', role: 'info.name' },
	ipaddress: { type: 'string', role: 'info.ip' },
	mac: { type: 'string', role: 'info.mac' },
	version: { type: 'string', role: 'info.version' },
	uptime: { type: 'string', role: 'value.interval' },
	time: { type: 'string', role: 'date' },
	mqtcount: { type: 'number', role: 'value' },

	// WiFi
	rssi: { type: 'number', role: 'value.signal', unit: '%' },
	signal: { type: 'number', role: 'value.signal', unit: '%' },
	ssid: { type: 'string', role: 'text' },
	bssid: { type: 'string', role: 'text' },

	// Relay / switch controls
	power: { type: 'boolean', role: 'switch', write: true },

	// Light controls
	dimmer: { type: 'number', role: 'level.dimmer', unit: '%', write: true },
	color: { type: 'string', role: 'level.color.rgb', write: true },
	ct: { type: 'number', role: 'level.color.temperature', unit: 'mired', write: true },
	hue: { type: 'number', role: 'level.color.hue', unit: '°', write: true },
	saturation: { type: 'number', role: 'level.color.saturation', unit: '%', write: true },
	white: { type: 'number', role: 'level.color.white', unit: '%', write: true },
	speed: { type: 'number', role: 'value', write: true },
	scheme: { type: 'number', role: 'value', write: true },

	// Shutter controls
	shutteropen: { type: 'boolean', role: 'button.open.blind', write: true },
	shutterclose: { type: 'boolean', role: 'button.close.blind', write: true },
	shutterstop: { type: 'boolean', role: 'button', write: true },
	shutterposition: { type: 'number', role: 'level.blind', unit: '%', write: true },
	shutterdirection: { type: 'number', role: 'value' },

	// Fan
	fanspeed: { type: 'number', role: 'level.mode.fan', write: true },

	// Sensors
	temperature: { type: 'number', role: 'value.temperature', unit: '°C' },
	humidity: { type: 'number', role: 'value.humidity', unit: '%' },
	dewpoint: { type: 'number', role: 'value.temperature', unit: '°C' },
	pressure: { type: 'number', role: 'value.pressure', unit: 'hPa' },
	co2: { type: 'number', role: 'value', unit: 'ppm' },
	carbondioxide: { type: 'number', role: 'value', unit: 'ppm' },
	tvoc: { type: 'number', role: 'value', unit: 'ppb' },
	illuminance: { type: 'number', role: 'value.brightness', unit: 'lx' },
	voltage: { type: 'number', role: 'value.voltage', unit: 'V' },
	current: { type: 'number', role: 'value.current', unit: 'A' },
	apparentpower: { type: 'number', role: 'value.power', unit: 'VA' },
	reactivepower: { type: 'number', role: 'value.power', unit: 'var' },
	factor: { type: 'number', role: 'value' },
	today: { type: 'number', role: 'value.energy', unit: 'kWh' },
	yesterday: { type: 'number', role: 'value.energy', unit: 'kWh' },
	total: { type: 'number', role: 'value.energy', unit: 'kWh' },
};

module.exports = {
	PROFILES,
};
