'use strict';

const { DeviceManagement } = require('@iobroker/dm-utils');

// SVG icon data URIs for ioBroker object tree
function _svgUri(path, fill) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${fill}" d="${path}"/></svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const OBJ_ICONS = {
	blind:         _svgUri('M3,3H21V5H3M3,7H21V9H3M3,11H21V13H3M3,15H21V17H3M3,19H21V21H3Z', '#455a64'),
	dimmer:        _svgUri('M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21M12,4A5,5 0 0,0 7,9C7,11.05 8.23,12.81 10,13.58V16H14V13.58C15.77,12.81 17,11.05 17,9A5,5 0 0,0 12,4Z', '#ffc107'),
	ct:            _svgUri('M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21M12,4A5,5 0 0,0 7,9C7,11.05 8.23,12.81 10,13.58V16H14V13.58C15.77,12.81 17,11.05 17,9A5,5 0 0,0 12,4Z', '#ff9800'),
	rgb:           _svgUri('M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21M12,4A5,5 0 0,0 7,9C7,11.05 8.23,12.81 10,13.58V16H14V13.58C15.77,12.81 17,11.05 17,9A5,5 0 0,0 12,4Z', '#e91e63'),
	light:         _svgUri('M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21M12,4A5,5 0 0,0 7,9C7,11.05 8.23,12.81 10,13.58V16H14V13.58C15.77,12.81 17,11.05 17,9A5,5 0 0,0 12,4Z', '#ffeb3b'),
	energy_socket: _svgUri('M7,2V13H10V22L17,10H13L17,2H7Z', '#ff9800'),
	socket:        _svgUri('M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,7V9H8V7H10M14,7H16V9H14V7M8,13V11H10V13H9V15H11V13H13V15H15V13H14V11H16V13C16,14.1 15.1,15 14,15H13V19H11V15H10C8.9,15 8,14.1 8,13Z', '#1976d2'),
	temperature:   _svgUri('M15,13.5V7A3,3 0 0,0 12,4A3,3 0 0,0 9,7V13.5C7.79,14.36 7,15.65 7,17A5,5 0 0,0 12,22A5,5 0 0,0 17,17C17,15.65 16.21,14.36 15,13.5Z', '#f44336'),
	unknown:       _svgUri('M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5M5,15.91L12,19.82L19,15.91V8.09L12,4.18L5,8.09V15.91Z', '#9e9e9e'),
};

// Named icon strings for the device manager card (dm-utils built-in icons)
const DM_ICONS = {
	blind: 'blind', rgb: 'rgb', ct: 'ct', dimmer: 'dimmer', light: 'light',
	energy_socket: 'socket', socket: 'socket', temperature: 'temperature', unknown: 'settings',
};

/**
 * Detect the device type from state keys relative to the device object.
 * @param {string[]} keys  e.g. ['POWER', 'alive', 'ENERGY.Power', 'Shutter1.Position']
 * @returns {'blind'|'rgb'|'ct'|'dimmer'|'light'|'energy_socket'|'socket'|'temperature'|'unknown'}
 */
function detectDeviceType(keys) {
	const has = k => keys.includes(k);
	const hasPat = re => keys.some(k => re.test(k));

	if (hasPat(/^Shutter\d/)) return 'blind';
	if (has('Color') && has('Hue')) return 'rgb';
	if (has('CT') && has('Dimmer') && !has('Color')) return 'ct';
	if (has('CT') && !has('Color')) return 'ct';
	if (has('Dimmer')) return 'dimmer';
	if (has('CT') || has('Color')) return 'light';
	if (hasPat(/^ENERGY[._]/)) return 'energy_socket';
	if (hasPat(/^POWER/)) return 'socket';
	if (has('Temperature') || has('Humidity')) return 'temperature';
	return 'unknown';
}

class TasmotaDeviceManager extends DeviceManagement {
	/**
	 * @param {import('../main').Tasmota} adapter
	 */
	constructor(adapter) {
		super(adapter);
		this._tasmota = adapter;
	}

	getInstanceInfo() {
		return {
			apiVersion: 'v3',
			actions: [
				{
					id: 'refreshAll',
					icon: 'refresh',
					label: { en: 'Refresh all devices', de: 'Alle Geräte aktualisieren' },
					handler: async () => {
						for (const deviceId of this._tasmota.knownDevices) {
							this._tasmota.discoveryRequested.delete(deviceId);
							await this._tasmota.requestDeviceSnapshot(deviceId);
						}
						return { refresh: 'devices' };
					},
				},
			],
		};
	}

	async loadDevices(context) {
		const ns = this._tasmota.namespace;

		// Load all state IDs once for type detection
		let allStateIds = [];
		try {
			const result = await this._tasmota.getObjectListAsync({ startkey: `${ns}.`, endkey: `${ns}.香` });
			allStateIds = result.rows.filter(r => r.value?.type === 'state').map(r => r.id.replace(`${ns}.`, ''));
		} catch { /* continue with empty */ }

		const devices = [...this._tasmota.knownDevices];
		context.setTotalDevices(devices.length);

		for (const deviceId of devices) {
			const deviceObj = await this._tasmota.getObjectAsync(deviceId).catch(() => null);
			const displayName = deviceObj?.common?.name || deviceId;

			// Keys relative to device, including nested (e.g. 'ENERGY.Power', 'Shutter1.Position')
			const devicePrefix = `${deviceId}.`;
			const deepKeys = allStateIds
				.filter(id => id.startsWith(devicePrefix))
				.map(id => id.slice(devicePrefix.length));

			const deviceType = detectDeviceType(deepKeys);

			// Read alive state synchronously for initial status
			let isAlive = false;
			try {
				const s = await this._tasmota.getStateAsync(`${deviceId}.alive`);
				isAlive = s?.val === true;
			} catch { /* default false */ }

			/** @type {object} */
			const status = { connection: isAlive ? 'connected' : 'disconnected' };
			if (deepKeys.includes('RSSI')) {
				status.rssi = { stateId: `${ns}.${deviceId}.RSSI` };
			}

			context.addDevice({
				id: deviceId,
				name: displayName,
				icon: DM_ICONS[deviceType] || 'settings',
				status,
				controls: this._buildControls(deviceId, deviceType, deepKeys, ns),
				hasDetails: true,
				actions: [
					{
						id: 'refresh',
						icon: 'refresh',
						label: { en: 'Refresh', de: 'Aktualisieren' },
						handler: async () => {
							this._tasmota.discoveryRequested.delete(deviceId);
							await this._tasmota.requestDeviceSnapshot(deviceId);
							return { refresh: 'none' };
						},
					},
					{
						id: 'delete',
						icon: 'delete',
						label: { en: 'Delete device', de: 'Gerät löschen' },
						confirmation: { en: 'Are you sure you want to delete this device?', de: 'Gerät wirklich löschen?' },
						handler: async () => {
							await this._tasmota.delObjectAsync(deviceId, { recursive: true });
							this._tasmota.knownDevices.delete(deviceId);
							this._tasmota.discoveryRequested.delete(deviceId);
							return { delete: deviceId };
						},
					},
				],
			});
		}
	}

	/**
	 * Build the control list for a device based on its type and available state keys.
	 */
	_buildControls(deviceId, deviceType, keys, ns) {
		const adapter = this._tasmota;
		const has = k => keys.includes(k);

		/** Write a command and return the new state */
		function makeHandler(command, defaultVal) {
			return async (dId, cId, state) => {
				const payload = typeof state === 'boolean'
					? adapter.toCommandPayload(state)
					: String(state ?? defaultVal ?? 0);
				await adapter.publishCommand(dId, command, payload);
				return { val: state, ts: Date.now(), ack: false };
			};
		}

		/** Read the current ioBroker state */
		function makeGetter(stateRelId, fallback) {
			return async (dId) => {
				try {
					const s = await adapter.getStateAsync(`${dId}.${stateRelId}`);
					if (s) return s;
				} catch { /* fall through */ }
				return { val: fallback, ts: Date.now(), ack: true };
			};
		}

		function sw(key, label) {
			return {
				id: key, type: 'switch', label, icon: 'socket',
				stateId: `${ns}.${deviceId}.${key}`,
				handler: makeHandler(key, false),
				getStateHandler: makeGetter(key, false),
			};
		}

		function slider(id, stateRelId, command, label, icon, min, max, unit) {
			return {
				id, type: 'slider', label, icon, min, max, unit,
				stateId: `${ns}.${deviceId}.${stateRelId}`,
				handler: makeHandler(command, min),
				getStateHandler: makeGetter(stateRelId, min),
			};
		}

		function color(id, stateRelId, command, label) {
			return {
				id, type: 'color', label, icon: 'rgb',
				stateId: `${ns}.${deviceId}.${stateRelId}`,
				handler: makeHandler(command, '#ffffff'),
				getStateHandler: makeGetter(stateRelId, '#ffffff'),
			};
		}

		function info(id, stateRelId, label, icon, unit) {
			return {
				id, type: 'info', label, icon, unit,
				stateId: `${ns}.${deviceId}.${stateRelId}`,
				getStateHandler: makeGetter(stateRelId, null),
			};
		}

		// Add all POWER/POWER1..16 switches present
		const powerSwitches = () => {
			const result = [];
			if (has('POWER')) result.push(sw('POWER', { en: 'Power', de: 'Schalter' }));
			for (let i = 1; i <= 16; i++) {
				if (has(`POWER${i}`)) result.push(sw(`POWER${i}`, { en: `Power ${i}`, de: `Schalter ${i}` }));
			}
			return result;
		};

		// Find energy state path (objectTree creates 'ENERGY.Power', flat creates 'ENERGY_Power')
		const energyKey = sub => has(`ENERGY.${sub}`) ? `ENERGY.${sub}` : (has(`ENERGY_${sub}`) ? `ENERGY_${sub}` : null);

		const controls = [];

		switch (deviceType) {
			case 'blind':
				for (let i = 1; i <= 4; i++) {
					const posKey = `Shutter${i}.Position`;
					const tiltKey = `Shutter${i}.Tilt`;
					if (has(posKey)) {
						controls.push(slider(
							`Shutter${i}_Position`, posKey, `ShutterPosition${i}`,
							{ en: `Shutter ${i} – Position`, de: `Jalousie ${i} – Position` },
							'blind', 0, 100, '%',
						));
					}
					if (has(tiltKey)) {
						controls.push(slider(
							`Shutter${i}_Tilt`, tiltKey, `ShutterTilt${i}`,
							{ en: `Shutter ${i} – Tilt`, de: `Jalousie ${i} – Neigung` },
							'blind', 0, 100, '%',
						));
					}
				}
				break;

			case 'rgb':
				controls.push(...powerSwitches());
				if (has('Dimmer')) controls.push(slider('Dimmer', 'Dimmer', 'Dimmer', { en: 'Brightness', de: 'Helligkeit' }, 'dimmer', 0, 100, '%'));
				if (has('Color')) controls.push(color('Color', 'Color', 'Color', { en: 'Color', de: 'Farbe' }));
				if (has('CT')) controls.push(slider('CT', 'CT', 'CT', { en: 'Color Temp', de: 'Farbtemp.' }, 'ct', 153, 500, undefined));
				break;

			case 'ct':
				controls.push(...powerSwitches());
				if (has('Dimmer')) controls.push(slider('Dimmer', 'Dimmer', 'Dimmer', { en: 'Brightness', de: 'Helligkeit' }, 'dimmer', 0, 100, '%'));
				controls.push(slider('CT', 'CT', 'CT', { en: 'Color Temp', de: 'Farbtemp.' }, 'ct', 153, 500, undefined));
				break;

			case 'dimmer':
				controls.push(...powerSwitches());
				controls.push(slider('Dimmer', 'Dimmer', 'Dimmer', { en: 'Brightness', de: 'Helligkeit' }, 'dimmer', 0, 100, '%'));
				break;

			case 'light':
				controls.push(...powerSwitches());
				if (has('CT')) controls.push(slider('CT', 'CT', 'CT', { en: 'Color Temp', de: 'Farbtemp.' }, 'ct', 153, 500, undefined));
				if (has('Color')) controls.push(color('Color', 'Color', 'Color', { en: 'Color', de: 'Farbe' }));
				break;

			case 'energy_socket': {
				controls.push(...powerSwitches());
				const pwr = energyKey('Power');
				const volt = energyKey('Voltage');
				const cur = energyKey('Current');
				const today = energyKey('Today');
				if (pwr) controls.push(info('EnergyPower', pwr, { en: 'Power', de: 'Leistung' }, 'socket', 'W'));
				if (volt) controls.push(info('EnergyVoltage', volt, { en: 'Voltage', de: 'Spannung' }, 'socket', 'V'));
				if (cur) controls.push(info('EnergyCurrent', cur, { en: 'Current', de: 'Strom' }, 'socket', 'A'));
				if (today) controls.push(info('EnergyToday', today, { en: 'Today', de: 'Heute' }, 'socket', 'kWh'));
				break;
			}

			case 'temperature':
				if (has('Temperature')) controls.push(info('Temperature', 'Temperature', { en: 'Temperature', de: 'Temperatur' }, 'temperature', '°C'));
				if (has('Humidity')) controls.push(info('Humidity', 'Humidity', { en: 'Humidity', de: 'Luftfeuchtigkeit' }, 'temperature', '%'));
				if (has('Pressure')) controls.push(info('Pressure', 'Pressure', { en: 'Pressure', de: 'Luftdruck' }, 'temperature', 'hPa'));
				break;

			default:
				// socket + unknown – just power switches
				controls.push(...powerSwitches());
				break;
		}

		return controls;
	}

	async getDeviceDetails(id) {
		const data = {};
		const fields = ['IPAddress', 'Hostname', 'Version', 'Module', 'RSSI', 'SSId', 'Uptime', 'RestartReason'];
		for (const key of fields) {
			try {
				const s = await this._tasmota.getStateAsync(`${id}.${key}`);
				data[key] = s?.val != null ? String(s.val) : '';
			} catch {
				data[key] = '';
			}
		}

		const schema = {
			type: 'panel',
			items: {
				IPAddress:     { type: 'text', label: { en: 'IP Address', de: 'IP-Adresse' }, disabled: true, xs: 12, sm: 6, md: 4 },
				Hostname:      { type: 'text', label: { en: 'Hostname', de: 'Hostname' }, disabled: true, xs: 12, sm: 6, md: 4 },
				Version:       { type: 'text', label: { en: 'Firmware', de: 'Firmware' }, disabled: true, xs: 12, sm: 6, md: 4 },
				Module:        { type: 'text', label: { en: 'Module', de: 'Modul' }, disabled: true, xs: 12, sm: 6, md: 4 },
				RSSI:          { type: 'text', label: 'RSSI (dBm)', disabled: true, xs: 12, sm: 6, md: 4 },
				SSId:          { type: 'text', label: { en: 'Wi-Fi SSID', de: 'WLAN-Name' }, disabled: true, xs: 12, sm: 6, md: 4 },
				Uptime:        { type: 'text', label: { en: 'Uptime', de: 'Laufzeit' }, disabled: true, xs: 12, sm: 12, md: 6 },
				RestartReason: { type: 'text', label: { en: 'Restart Reason', de: 'Neustart-Grund' }, disabled: true, xs: 12, sm: 12, md: 6 },
			},
		};

		return { id, schema, data };
	}
}

module.exports = { TasmotaDeviceManager, detectDeviceType, OBJ_ICONS };
