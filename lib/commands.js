'use strict';

/**
 * Tasmota command definitions and device-type auto-detection for ioBroker.
 *
 * This module is intentionally kept separate from main.js so it can be loaded
 * independently and extended without touching the core adapter logic.
 *
 * Reference: https://tasmota.github.io/docs/Commands/
 * Reference: ioBroker.sonoff adapter (roles and types)
 */

// ─── Command definitions ──────────────────────────────────────────────────────
// Each entry maps a Tasmota cmnd key to an ioBroker common block.
// Keys that support an index suffix (Power1…Power8, Shutter1…Shutter4) are
// stored as templates and expanded at runtime.

const COMMAND_DEFINITIONS = {
	// ── Power ────────────────────────────────────────────────────────────────
	Power: {
		name: 'Power',
		type: 'boolean',
		role: 'switch.power',
		read: true,
		write: true,
	},
	Power1: {
		name: 'Power 1',
		type: 'boolean',
		role: 'switch.power',
		read: true,
		write: true,
	},
	Power2: {
		name: 'Power 2',
		type: 'boolean',
		role: 'switch.power',
		read: true,
		write: true,
	},
	Power3: {
		name: 'Power 3',
		type: 'boolean',
		role: 'switch.power',
		read: true,
		write: true,
	},
	Power4: {
		name: 'Power 4',
		type: 'boolean',
		role: 'switch.power',
		read: true,
		write: true,
	},
	Power5: {
		name: 'Power 5',
		type: 'boolean',
		role: 'switch.power',
		read: true,
		write: true,
	},
	Power6: {
		name: 'Power 6',
		type: 'boolean',
		role: 'switch.power',
		read: true,
		write: true,
	},
	Power7: {
		name: 'Power 7',
		type: 'boolean',
		role: 'switch.power',
		read: true,
		write: true,
	},
	Power8: {
		name: 'Power 8',
		type: 'boolean',
		role: 'switch.power',
		read: true,
		write: true,
	},
	PowerOnState: {
		name: 'Power-on state',
		type: 'number',
		role: 'level',
		read: true,
		write: true,
		min: 0,
		max: 5,
	},
	BlinkCount: {
		name: 'Blink count',
		type: 'number',
		role: 'level',
		read: true,
		write: true,
		min: 0,
		max: 32000,
	},
	BlinkTime: {
		name: 'Blink time (0.1 s)',
		type: 'number',
		role: 'level',
		read: true,
		write: true,
		min: 2,
		max: 3600,
	},

	// ── Light ────────────────────────────────────────────────────────────────
	Dimmer: {
		name: 'Dimmer',
		type: 'number',
		role: 'level.dimmer',
		read: true,
		write: true,
		min: 0,
		max: 100,
		unit: '%',
	},
	Dimmer1: {
		name: 'Dimmer channel 1 (CW)',
		type: 'number',
		role: 'level.dimmer',
		read: true,
		write: true,
		min: 0,
		max: 100,
		unit: '%',
	},
	Dimmer2: {
		name: 'Dimmer channel 2 (WW)',
		type: 'number',
		role: 'level.dimmer',
		read: true,
		write: true,
		min: 0,
		max: 100,
		unit: '%',
	},
	Color: {
		name: 'Color (RRGGBB)',
		type: 'string',
		role: 'level.color.rgb',
		read: true,
		write: true,
	},
	CT: {
		name: 'Color temperature',
		type: 'number',
		role: 'level.color.temperature',
		read: true,
		write: true,
		min: 153,
		max: 500,
		unit: 'mired',
	},
	White: {
		name: 'White channel',
		type: 'number',
		role: 'level.color.white',
		read: true,
		write: true,
		min: 0,
		max: 100,
		unit: '%',
	},
	Hue: {
		name: 'Hue',
		type: 'number',
		role: 'level.color.hue',
		read: true,
		write: true,
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
		min: 0,
		max: 100,
		unit: '%',
	},
	Scheme: {
		name: 'Light scheme',
		type: 'number',
		role: 'level',
		read: true,
		write: true,
		min: 0,
		max: 12,
	},
	Fade: {
		name: 'Fade',
		type: 'boolean',
		role: 'switch',
		read: true,
		write: true,
	},
	Speed: {
		name: 'Fade speed',
		type: 'number',
		role: 'level',
		read: true,
		write: true,
		min: 1,
		max: 40,
	},
	LedPower: {
		name: 'LED power',
		type: 'boolean',
		role: 'switch.power',
		read: true,
		write: true,
	},
	LedState: {
		name: 'LED state',
		type: 'number',
		role: 'level',
		read: true,
		write: true,
		min: 0,
		max: 8,
	},
	Wakeup: {
		name: 'Start wake-up sequence',
		type: 'boolean',
		role: 'button',
		read: false,
		write: true,
	},
	WakeupDuration: {
		name: 'Wake-up duration (min)',
		type: 'number',
		role: 'level',
		read: true,
		write: true,
		min: 1,
		max: 3000,
	},

	// ── Shutter 1 ────────────────────────────────────────────────────────────
	ShutterOpen1: {
		name: 'Open shutter 1',
		type: 'boolean',
		role: 'button.open.blind',
		read: false,
		write: true,
	},
	ShutterClose1: {
		name: 'Close shutter 1',
		type: 'boolean',
		role: 'button.close.blind',
		read: false,
		write: true,
	},
	ShutterStop1: {
		name: 'Stop shutter 1',
		type: 'boolean',
		role: 'button.stop.blind',
		read: false,
		write: true,
	},
	ShutterPosition1: {
		name: 'Shutter 1 position',
		type: 'number',
		role: 'value.blind',
		read: true,
		write: true,
		min: 0,
		max: 100,
		unit: '%',
	},
	ShutterTilt1: {
		name: 'Shutter 1 tilt',
		type: 'number',
		role: 'value.tilt',
		read: true,
		write: true,
		min: -90,
		max: 90,
		unit: '°',
	},

	// ── Shutter 2 ────────────────────────────────────────────────────────────
	ShutterOpen2: {
		name: 'Open shutter 2',
		type: 'boolean',
		role: 'button.open.blind',
		read: false,
		write: true,
	},
	ShutterClose2: {
		name: 'Close shutter 2',
		type: 'boolean',
		role: 'button.close.blind',
		read: false,
		write: true,
	},
	ShutterStop2: {
		name: 'Stop shutter 2',
		type: 'boolean',
		role: 'button.stop.blind',
		read: false,
		write: true,
	},
	ShutterPosition2: {
		name: 'Shutter 2 position',
		type: 'number',
		role: 'value.blind',
		read: true,
		write: true,
		min: 0,
		max: 100,
		unit: '%',
	},
	ShutterTilt2: {
		name: 'Shutter 2 tilt',
		type: 'number',
		role: 'value.tilt',
		read: true,
		write: true,
		min: -90,
		max: 90,
		unit: '°',
	},

	// ── Shutter 3 ────────────────────────────────────────────────────────────
	ShutterOpen3: {
		name: 'Open shutter 3',
		type: 'boolean',
		role: 'button.open.blind',
		read: false,
		write: true,
	},
	ShutterClose3: {
		name: 'Close shutter 3',
		type: 'boolean',
		role: 'button.close.blind',
		read: false,
		write: true,
	},
	ShutterStop3: {
		name: 'Stop shutter 3',
		type: 'boolean',
		role: 'button.stop.blind',
		read: false,
		write: true,
	},
	ShutterPosition3: {
		name: 'Shutter 3 position',
		type: 'number',
		role: 'value.blind',
		read: true,
		write: true,
		min: 0,
		max: 100,
		unit: '%',
	},
	ShutterTilt3: {
		name: 'Shutter 3 tilt',
		type: 'number',
		role: 'value.tilt',
		read: true,
		write: true,
		min: -90,
		max: 90,
		unit: '°',
	},

	// ── Shutter 4 ────────────────────────────────────────────────────────────
	ShutterOpen4: {
		name: 'Open shutter 4',
		type: 'boolean',
		role: 'button.open.blind',
		read: false,
		write: true,
	},
	ShutterClose4: {
		name: 'Close shutter 4',
		type: 'boolean',
		role: 'button.close.blind',
		read: false,
		write: true,
	},
	ShutterStop4: {
		name: 'Stop shutter 4',
		type: 'boolean',
		role: 'button.stop.blind',
		read: false,
		write: true,
	},
	ShutterPosition4: {
		name: 'Shutter 4 position',
		type: 'number',
		role: 'value.blind',
		read: true,
		write: true,
		min: 0,
		max: 100,
		unit: '%',
	},
	ShutterTilt4: {
		name: 'Shutter 4 tilt',
		type: 'number',
		role: 'value.tilt',
		read: true,
		write: true,
		min: -90,
		max: 90,
		unit: '°',
	},

	// ── Fan ──────────────────────────────────────────────────────────────────
	FanSpeed: {
		name: 'Fan speed',
		type: 'number',
		role: 'value.speed.fan',
		read: true,
		write: true,
		min: 0,
		max: 3,
	},

	// ── Sensor offsets ───────────────────────────────────────────────────────
	TempOffset: {
		name: 'Temperature offset',
		type: 'number',
		role: 'value.temperature',
		read: true,
		write: true,
		min: -12.6,
		max: 12.6,
		unit: '°C',
	},
	HumOffset: {
		name: 'Humidity offset',
		type: 'number',
		role: 'value.humidity',
		read: true,
		write: true,
		min: -10,
		max: 10,
		unit: '%',
	},

	// ── Timer ────────────────────────────────────────────────────────────────
	Timers: {
		name: 'Timers enabled',
		type: 'boolean',
		role: 'switch',
		read: true,
		write: true,
	},

	// ── System ───────────────────────────────────────────────────────────────
	Restart: {
		name: 'Restart device',
		type: 'number',
		role: 'button',
		read: false,
		write: true,
	},
	Reset: {
		name: 'Factory reset',
		type: 'number',
		role: 'button',
		read: false,
		write: true,
	},
	Backlog: {
		name: 'Backlog command',
		type: 'string',
		role: 'text',
		read: false,
		write: true,
	},
};

// ─── Device-type detection ────────────────────────────────────────────────────

/**
 * Capabilities detected for a single device.
 *
 * power - has at least one POWER relay
 * powerIndexes - relay indexes (empty if only generic POWER)
 * dimmer - has dimmer (brightness) control
 * dimmerChannels - per-channel dimmer indexes seen (e.g. [1,2] when Dimmer1 and Dimmer2 appear)
 * color - has RGB color control
 * ct - has color-temperature control
 * white - has dedicated white channel
 * shutters - number of shutters detected (0 = none)
 * fan - has fan speed control
 * sensor - has environmental sensor
 */
/**
 * Analyse all known state IDs for a device and return its capabilities.
 *
 * The state IDs are the "relative" keys below the device root, e.g.:
 *   "tele.STATE.POWER", "tele.STATE.Shutter1.Position", "stat.RESULT.Dimmer"
 *
 * @param {string[]} relativeStateIds - relative state IDs (below device root)
 * @returns {DeviceCapabilities} detected capabilities for the device
 */
function detectDeviceCapabilities(relativeStateIds) {
	const caps = {
		power: false,
		powerIndexes: [],
		dimmer: false,
		dimmerChannels: [],
		color: false,
		ct: false,
		white: false,
		shutters: 0,
		fan: false,
		sensor: false,
	};

	for (const id of relativeStateIds) {
		// Flatten to individual key segments
		const segments = id.toLowerCase().split('.');

		for (const seg of segments) {
			// Power
			if (seg === 'power') {
				caps.power = true;
			}
			const powerMatch = seg.match(/^power(\d+)$/);
			if (powerMatch) {
				caps.power = true;
				const idx = parseInt(powerMatch[1], 10);
				if (!caps.powerIndexes.includes(idx)) {
					caps.powerIndexes.push(idx);
				}
			}

			// Light – track generic dimmer and per-channel dimmers separately
			if (seg === 'dimmer') {
				caps.dimmer = true;
			}
			const dimmerMatch = seg.match(/^dimmer(\d+)$/);
			if (dimmerMatch) {
				caps.dimmer = true;
				const idx = parseInt(dimmerMatch[1], 10);
				if (!caps.dimmerChannels.includes(idx)) {
					caps.dimmerChannels.push(idx);
				}
			}
			if (seg === 'color' || seg.match(/^color\d+$/)) {
				caps.color = true;
			}
			if (seg === 'ct' || seg === 'colortemp') {
				caps.ct = true;
			}
			if (seg === 'white') {
				caps.white = true;
			}
			if (seg === 'hue' || seg === 'sat' || seg === 'hsbcolor') {
				caps.color = true;
			}

			// Shutter: e.g. "shutter1", "shutter2"
			const shutterMatch = seg.match(/^shutter(\d+)$/);
			if (shutterMatch) {
				const n = parseInt(shutterMatch[1], 10);
				if (n > caps.shutters) {
					caps.shutters = n;
				}
			}

			// Fan
			if (seg === 'fanspeed') {
				caps.fan = true;
			}

			// Sensor
			if (
				seg === 'temperature' ||
				seg === 'humidity' ||
				seg === 'pressure' ||
				seg === 'dewpoint' ||
				seg === 'co2' ||
				seg === 'lux'
			) {
				caps.sensor = true;
			}
		}
	}

	// Sort power indexes ascending
	caps.powerIndexes.sort((a, b) => a - b);

	return caps;
}

/**
 * Return the list of cmnd command names that should exist for a device with
 * the given capabilities.
 *
 * @param {DeviceCapabilities} caps - device capabilities detected by detectDeviceCapabilities
 * @returns {string[]} array of command names (keys in COMMAND_DEFINITIONS)
 */
function getRequiredCommands(caps) {
	const cmds = [];

	// Power
	if (caps.power) {
		if (caps.powerIndexes.length === 0) {
			// Generic single-relay device
			cmds.push('Power');
		} else {
			for (const idx of caps.powerIndexes) {
				cmds.push(`Power${idx}`);
			}
		}
	}

	// Light – only add if a light is present
	if (caps.dimmer) {
		cmds.push('Dimmer');
		// Only add per-channel dimmers when explicitly detected in state IDs
		for (const ch of caps.dimmerChannels) {
			cmds.push(`Dimmer${ch}`);
		}
	}
	if (caps.color) {
		cmds.push('Color');
	}
	if (caps.ct) {
		cmds.push('CT');
	}
	if (caps.white) {
		cmds.push('White');
	}
	if (caps.dimmer || caps.color || caps.ct) {
		cmds.push('Fade', 'Speed', 'Scheme');
	}

	// Shutter
	for (let i = 1; i <= caps.shutters; i++) {
		cmds.push(`ShutterOpen${i}`, `ShutterClose${i}`, `ShutterStop${i}`, `ShutterPosition${i}`, `ShutterTilt${i}`);
	}

	// Fan
	if (caps.fan) {
		cmds.push('FanSpeed');
	}

	return cmds;
}

// ─── Auto-creation helper ─────────────────────────────────────────────────────

/**
 * Ensure that all required command states exist for a device.
 *
 * This is the main entry point called from the adapter after each device is
 * encountered.  It scans the existing state objects, determines which commands
 * the device supports, and creates any missing cmnd states.
 *
 * @param {import('@iobroker/adapter-core').AdapterInstance} adapter - the running adapter instance
 * @param {string} deviceId - short device ID (below adapter namespace)
 */
async function ensureDeviceCommands(adapter, deviceId) {
	try {
		// Collect all existing state objects for this device
		const objs = await adapter.getObjectViewAsync('system', 'state', {
			startkey: `${adapter.namespace}.${deviceId}.`,
			endkey: `${adapter.namespace}.${deviceId}.\u9999`,
		});

		const relativeIds = [];
		if (objs && objs.rows) {
			for (const row of objs.rows) {
				if (row.value && row.value._id) {
					const rel = row.value._id.replace(`${adapter.namespace}.${deviceId}.`, '');
					relativeIds.push(rel);
				}
			}
		}

		const caps = detectDeviceCapabilities(relativeIds);
		const requiredCmds = getRequiredCommands(caps);

		// Build set of cmnd keys that already exist
		const existingCmndKeys = new Set(
			relativeIds.filter(id => id.startsWith('cmnd.')).map(id => id.replace('cmnd.', '').split('.')[0]),
		);

		for (const cmdName of requiredCmds) {
			if (existingCmndKeys.has(cmdName)) {
				continue; // already exists
			}

			const def = COMMAND_DEFINITIONS[cmdName];
			if (!def) {
				continue;
			}

			const stateId = `${deviceId}.cmnd.${cmdName}`;
			await adapter.setObjectNotExistsAsync(stateId, {
				type: 'state',
				common: {
					name: def.name,
					type: def.type,
					role: def.role,
					read: def.read,
					write: def.write,
					...(def.min !== undefined ? { min: def.min } : {}),
					...(def.max !== undefined ? { max: def.max } : {}),
					...(def.unit !== undefined ? { unit: def.unit } : {}),
				},
				native: {},
			});

			adapter.log.debug(`Created command state: ${stateId}`);
		}
	} catch (err) {
		adapter.log.warn(`ensureDeviceCommands(${deviceId}): ${err.message}`);
	}
}

// ─── Setup function called from onReady ──────────────────────────────────────

/**
 * Attach command-management behaviour to a running adapter instance.
 *
 * After setup the adapter will:
 *  1. Scan all existing devices once at startup and create missing cmnd states.
 *  2. Re-scan whenever a new tele/STATE or stat/RESULT message is processed
 *     so that newly discovered devices are handled automatically.
 *
 * @param {import('@iobroker/adapter-core').AdapterInstance} adapter - the running adapter instance
 */
async function setupCommandManagement(adapter) {
	// Initial scan: process all already-known devices
	try {
		const deviceView = await adapter.getObjectViewAsync('system', 'device', {
			startkey: `${adapter.namespace}.`,
			endkey: `${adapter.namespace}.\u9999`,
		});

		if (deviceView && deviceView.rows) {
			const nsDepth = adapter.namespace.split('.').length;
			for (const row of deviceView.rows) {
				const obj = row.value;
				if (!obj) {
					continue;
				}
				// Only direct children of namespace (depth: namespace + 1)
				if (obj._id.split('.').length !== nsDepth + 1) {
					continue;
				}
				const shortId = obj._id.split('.').pop();
				await ensureDeviceCommands(adapter, shortId);
			}
		}
	} catch (err) {
		adapter.log.warn(`setupCommandManagement initial scan: ${err.message}`);
	}

	// Hook into stateChange so we can react when new devices are discovered
	// via incoming MQTT messages.  We patch processMqttMessage to trigger
	// ensureDeviceCommands whenever the device ID changes.
	const _seenDevices = new Set();

	const _origProcess = adapter.processMqttMessage.bind(adapter);
	adapter.processMqttMessage = async function (topic, payload) {
		await _origProcess(topic, payload);

		// Extract the device ID from the (already-processed) object tree.
		// Re-use the same parsing logic as in processMqttMessage.
		try {
			const topicPrefixes = adapter.getTopicPrefixes();
			let effectiveTopic = topic;
			for (const p of topicPrefixes) {
				if (topic.startsWith(`${p}/`)) {
					effectiveTopic = topic.slice(p.length + 1);
					break;
				}
			}

			const parts = effectiveTopic.split('/').filter(Boolean);
			if (parts.length < 2) {
				return;
			}

			const knownPrefixes = ['tele', 'cmnd', 'stat'];
			let deviceId;
			const structure = adapter.config.brokerTopicStructure || 'prefix-first';

			if (structure === 'device-first') {
				deviceId = parts[0];
			} else if (structure === 'prefix-first') {
				deviceId = knownPrefixes.includes(parts[0]) ? parts[1] : parts[0];
			} else {
				// auto
				if (knownPrefixes.includes(parts[0])) {
					deviceId = parts[1];
				} else if (parts.length >= 3 && knownPrefixes.includes(parts[1])) {
					deviceId = parts[0];
				} else {
					deviceId = parts[0];
				}
			}

			if (!deviceId) {
				return;
			}
			const safeDeviceId = adapter.sanitizeId(deviceId);

			if (!_seenDevices.has(safeDeviceId)) {
				_seenDevices.add(safeDeviceId);
				// Defer command-state creation so that the MQTT message processing
				// (which runs synchronously in processMqttMessage) has a chance to
				// create all device/channel/state objects first.  Two seconds is a
				// conservative but reasonable window; the worst case is that command
				// states are created on the *next* message from the device instead.
				setTimeout(() => ensureDeviceCommands(adapter, safeDeviceId), 2000);
			}
		} catch {
			// Ignore errors in the hook – they must not affect normal operation
		}
	};

	adapter.log.info('Tasmota command management active');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
	COMMAND_DEFINITIONS,
	detectDeviceCapabilities,
	getRequiredCommands,
	ensureDeviceCommands,
	setupCommandManagement,
};
