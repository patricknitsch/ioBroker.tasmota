'use strict';

const { DeviceManagement } = require('@iobroker/dm-utils');

const TILE_FONT_SIZE = 16;

// SVG icon data URIs for ioBroker object tree (common.icon on device objects)
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

// Named icon strings for the device manager card (dm-utils built-in icon set)
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

/** Find the first key from candidates that exists in deepKeys */
function _resolveKey(deepKeys, ...candidates) {
	return candidates.find(k => deepKeys.includes(k)) ?? null;
}

/** Resolve ENERGY sub-state handling both objectTree (ENERGY.X) and flat (ENERGY_X) formats */
function _energyKey(deepKeys, sub) {
	return _resolveKey(deepKeys, `ENERGY.${sub}`, `ENERGY_${sub}`);
}

/** Return all POWER/POWER1..16 keys present on the device */
function _powerKeys(deepKeys) {
	const keys = [];
	if (deepKeys.includes('POWER')) keys.push('POWER');
	for (let i = 1; i <= 16; i++) {
		if (deepKeys.includes(`POWER${i}`)) keys.push(`POWER${i}`);
	}
	return keys;
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

			const devicePrefix = `${deviceId}.`;
			const deepKeys = allStateIds
				.filter(id => id.startsWith(devicePrefix))
				.map(id => id.slice(devicePrefix.length));

			const deviceType = detectDeviceType(deepKeys);

			let isAlive = false;
			try {
				const s = await this._tasmota.getStateAsync(`${deviceId}.alive`);
				isAlive = s?.val === true;
			} catch { /* default false */ }

			/** @type {object} */
			const status = {
				connection: {
					stateId: `${ns}.${deviceId}.alive`,
					mapping: { true: 'connected', false: 'disconnected' },
				},
			};
			if (deepKeys.includes('RSSI')) {
				status.rssi = { stateId: `${ns}.${deviceId}.RSSI` };
			}

			const mainTileItems = this._buildMainTileItems(deviceId, deviceType, deepKeys, ns);

			context.addDevice({
				id: deviceId,
				name: displayName,
				icon: DM_ICONS[deviceType] || 'settings',
				color: !isAlive ? '#ffffff' : undefined,
				backgroundColor: !isAlive ? '#f44336' : undefined,
				status,
				customInfo: {
					id: deviceId,
					schema: { type: 'panel', items: mainTileItems },
				},
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
						confirmation: {
							en: 'Are you sure you want to delete this device?',
							de: 'Gerät wirklich löschen?',
						},
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

	// ---------------------------------------------------------------------------
	// Main tile – customInfo items
	// ---------------------------------------------------------------------------

	_buildMainTileItems(deviceId, deviceType, deepKeys, ns) {
		const has = k => deepKeys.includes(k);
		const fid = k => `${ns}.${deviceId}.${k}`;
		const items = {};

		// Device identification: IP + Module always shown when available
		if (has('IPAddress')) {
			items.IPAddress = this._tileStateItem(fid('IPAddress'), { en: 'IP', de: 'IP' });
		}
		if (has('Module')) {
			items.Module = this._tileStateItem(fid('Module'), { en: 'Module', de: 'Modul' });
		}

		switch (deviceType) {
			case 'socket': {
				for (const pk of _powerKeys(deepKeys)) {
					const lbl = pk === 'POWER' ? { en: 'Switch', de: 'Schalter' } : { en: `Switch ${pk.replace('POWER', '')}`, de: `Schalter ${pk.replace('POWER', '')}` };
					items[pk] = this._tileBoolStateItem(fid(pk), lbl);
				}
				break;
			}
			case 'energy_socket': {
				for (const pk of _powerKeys(deepKeys)) {
					const lbl = pk === 'POWER' ? { en: 'Switch', de: 'Schalter' } : { en: `Switch ${pk.replace('POWER', '')}`, de: `Schalter ${pk.replace('POWER', '')}` };
					items[pk] = this._tileBoolStateItem(fid(pk), lbl);
				}
				const eP = _energyKey(deepKeys, 'Power');
				const eV = _energyKey(deepKeys, 'Voltage');
				const eC = _energyKey(deepKeys, 'Current');
				const eT = _energyKey(deepKeys, 'Today');
				if (eP) items.EnergyPower    = this._tileStateItem(fid(eP), { en: 'Power',   de: 'Leistung'  }, 'W');
				if (eV) items.EnergyVoltage  = this._tileStateItem(fid(eV), { en: 'Voltage', de: 'Spannung'  }, 'V');
				if (eC) items.EnergyCurrent  = this._tileStateItem(fid(eC), { en: 'Current', de: 'Strom'     }, 'A');
				if (eT) items.EnergyToday    = this._tileStateItem(fid(eT), { en: 'Today',   de: 'Heute'     }, 'kWh');
				break;
			}
			case 'dimmer': {
				for (const pk of _powerKeys(deepKeys)) {
					items[pk] = this._tileBoolStateItem(fid(pk), { en: 'Switch', de: 'Schalter' });
				}
				if (has('Dimmer')) items.Dimmer = this._tileStateItem(fid('Dimmer'), { en: 'Brightness', de: 'Helligkeit' }, '%');
				break;
			}
			case 'ct': {
				for (const pk of _powerKeys(deepKeys)) {
					items[pk] = this._tileBoolStateItem(fid(pk), { en: 'Switch', de: 'Schalter' });
				}
				if (has('Dimmer')) items.Dimmer = this._tileStateItem(fid('Dimmer'), { en: 'Brightness', de: 'Helligkeit' }, '%');
				if (has('CT')) items.CT = this._tileStateItem(fid('CT'), { en: 'Color Temp', de: 'Farbtemp.' });
				break;
			}
			case 'rgb':
			case 'light': {
				for (const pk of _powerKeys(deepKeys)) {
					items[pk] = this._tileBoolStateItem(fid(pk), { en: 'Switch', de: 'Schalter' });
				}
				if (has('Dimmer')) items.Dimmer = this._tileStateItem(fid('Dimmer'), { en: 'Brightness', de: 'Helligkeit' }, '%');
				if (has('Color')) items.Color = this._tileStateItem(fid('Color'), { en: 'Color', de: 'Farbe' });
				if (has('CT')) items.CT = this._tileStateItem(fid('CT'), { en: 'Color Temp', de: 'Farbtemp.' });
				break;
			}
			case 'blind': {
				for (let i = 1; i <= 4; i++) {
					const posKey = `Shutter${i}.Position`;
					if (has(posKey)) {
						items[`Shutter${i}Position`] = this._tileStateItem(
							fid(posKey),
							{ en: `Shutter ${i}`, de: `Jalousie ${i}` },
							'%',
						);
					}
				}
				break;
			}
			case 'temperature': {
				if (has('Temperature')) items.Temperature = this._tileStateItem(fid('Temperature'), { en: 'Temperature', de: 'Temperatur' }, '°C');
				if (has('Humidity'))    items.Humidity    = this._tileStateItem(fid('Humidity'),    { en: 'Humidity',    de: 'Luftfeuchtigkeit' }, '%');
				if (has('Pressure'))   items.Pressure    = this._tileStateItem(fid('Pressure'),    { en: 'Pressure',    de: 'Luftdruck' }, 'hPa');
				break;
			}
		}

		return items;
	}

	// ---------------------------------------------------------------------------
	// Device details (Info + Controls tabs)
	// ---------------------------------------------------------------------------

	async getDeviceDetails(id) {
		const ns = this._tasmota.namespace;
		const fullId = `${ns}.${id}`;

		// Read static info from device states
		let moduleVal = '', versionVal = '';
		try {
			const ms = await this._tasmota.getStateAsync(`${id}.Module`);
			moduleVal = ms?.val ? String(ms.val) : '';
			const vs = await this._tasmota.getStateAsync(`${id}.Version`);
			versionVal = vs?.val ? String(vs.val) : '';
		} catch { /* ignore */ }

		// Load all state keys for this device
		let deepKeys = [];
		try {
			const result = await this._tasmota.getObjectListAsync({ startkey: `${fullId}.`, endkey: `${fullId}.香` });
			deepKeys = result.rows
				.filter(r => r.value?.type === 'state')
				.map(r => r.id.replace(`${fullId}.`, ''));
		} catch { /* continue */ }

		const has = k => deepKeys.includes(k);
		const fid = k => `${fullId}.${k}`;
		const deviceType = detectDeviceType(deepKeys);

		// Info tab
		const infoTabItems = {
			_h_general: this._headerItem({ en: 'Device Information', de: 'Geräteinformationen' }),
			_d_general: this._dividerItem(),
		};
		if (moduleVal)       infoTabItems.Module        = this._staticInfoItem({ en: 'Module',         de: 'Modul'         }, moduleVal);
		if (versionVal)      infoTabItems.Version       = this._staticInfoItem({ en: 'Firmware',        de: 'Firmware'      }, versionVal);
		if (has('IPAddress'))infoTabItems.IPAddress      = this._stateItem(fid('IPAddress'), { en: 'IP Address',    de: 'IP-Adresse'      });
		if (has('Hostname')) infoTabItems.Hostname       = this._stateItem(fid('Hostname'),  { en: 'Hostname',      de: 'Hostname'        });
		if (has('SSId'))     infoTabItems.SSId           = this._stateItem(fid('SSId'),      { en: 'Wi-Fi SSID',   de: 'WLAN-Name'       });
		if (has('RSSI'))     infoTabItems.RSSI           = this._stateItem(fid('RSSI'),      { en: 'RSSI',         de: 'RSSI'            }, 'dBm');
		if (has('Uptime'))   infoTabItems.Uptime         = this._stateItem(fid('Uptime'),    { en: 'Uptime',       de: 'Laufzeit'        });
		if (has('RestartReason')) infoTabItems.RestartReason = this._stateItem(fid('RestartReason'), { en: 'Restart Reason', de: 'Neustart-Grund' });

		// Controls tab
		const controlTabItems = this._buildControlTabItems(deviceType, deepKeys, fullId);
		const hasControls = Object.keys(controlTabItems).length > 0;

		const details = {
			id: String(id),
			schema: {
				type: 'tabs',
				items: {
					_tab_info: {
						type: 'panel',
						label: { en: 'Info', de: 'Info' },
						innerStyle: { maxWidth: 450 },
						items: infoTabItems,
					},
				},
			},
		};

		if (hasControls) {
			details.schema.items._tab_controls = {
				type: 'panel',
				label: { en: 'Controls', de: 'Steuerung' },
				innerStyle: { maxWidth: 450 },
				items: controlTabItems,
			};
		}

		return details;
	}

	_buildControlTabItems(deviceType, deepKeys, fullId) {
		const has = k => deepKeys.includes(k);
		const fid = k => `${fullId}.${k}`;
		const items = {};

		const addPowerSection = (powerKey) => {
			const num = powerKey.replace('POWER', '') || '';
			const label = num ? `Switch ${num}` : 'Switch';
			items[`${powerKey}_h`] = this._headerItem({ en: label, de: `Schalter${num ? ` ${num}` : ''}` });
			items[`${powerKey}_d`] = this._dividerItem();
			items[`${powerKey}_on`]  = { type: 'setState', id: fid(powerKey), label: { en: 'ON',  de: 'EIN' }, val: true,  variant: 'contained', color: 'primary',   sm: 6, newLine: true  };
			items[`${powerKey}_off`] = { type: 'setState', id: fid(powerKey), label: { en: 'OFF', de: 'AUS' }, val: false, variant: 'outlined',  color: 'secondary', sm: 6, newLine: false };
		};

		switch (deviceType) {
			case 'socket':
			case 'energy_socket':
				for (const pk of _powerKeys(deepKeys)) addPowerSection(pk);
				break;

			case 'dimmer':
				for (const pk of _powerKeys(deepKeys)) addPowerSection(pk);
				if (has('Dimmer')) {
					items._h_dim = this._headerItem({ en: 'Brightness', de: 'Helligkeit' });
					items._d_dim = this._dividerItem();
					items.Dimmer = this._sliderStateItem(fid('Dimmer'), { en: 'Brightness', de: 'Helligkeit' }, 0, 100, '%');
				}
				break;

			case 'ct':
				for (const pk of _powerKeys(deepKeys)) addPowerSection(pk);
				items._h_light = this._headerItem({ en: 'Light Settings', de: 'Lichteinstellungen' });
				items._d_light = this._dividerItem();
				if (has('Dimmer')) items.Dimmer = this._sliderStateItem(fid('Dimmer'), { en: 'Brightness', de: 'Helligkeit' }, 0, 100, '%');
				if (has('CT'))     items.CT     = this._sliderStateItem(fid('CT'),     { en: 'Color Temp', de: 'Farbtemp.'  }, 153, 500);
				break;

			case 'rgb':
			case 'light':
				for (const pk of _powerKeys(deepKeys)) addPowerSection(pk);
				items._h_light = this._headerItem({ en: 'Light Settings', de: 'Lichteinstellungen' });
				items._d_light = this._dividerItem();
				if (has('Dimmer')) items.Dimmer = this._sliderStateItem(fid('Dimmer'), { en: 'Brightness', de: 'Helligkeit' }, 0, 100, '%');
				if (has('CT'))     items.CT     = this._sliderStateItem(fid('CT'),     { en: 'Color Temp', de: 'Farbtemp.'  }, 153, 500);
				if (has('Color')) {
					items._h_color = this._headerItem({ en: 'Color', de: 'Farbe' });
					items._d_color = this._dividerItem();
					items.Color = { type: 'state', oid: fid('Color'), foreign: true, label: { en: 'Color (hex)', de: 'Farbe (hex)' }, control: 'input', sm: 12, newLine: true };
				}
				break;

			case 'blind':
				for (let i = 1; i <= 4; i++) {
					const posKey  = `Shutter${i}.Position`;
					const tiltKey = `Shutter${i}.Tilt`;
					if (!has(posKey)) continue;
					items[`_h_s${i}`] = this._headerItem({ en: `Shutter ${i}`, de: `Jalousie ${i}` });
					items[`_d_s${i}`] = this._dividerItem();
					items[`Shutter${i}Position`] = this._sliderStateItem(fid(posKey),  { en: 'Position', de: 'Position' }, 0, 100, '%');
					if (has(tiltKey)) {
						items[`Shutter${i}Tilt`] = this._sliderStateItem(fid(tiltKey), { en: 'Tilt',     de: 'Neigung'  }, 0, 100, '%');
					}
				}
				break;

			// temperature: no controls tab
		}

		return items;
	}

	// ---------------------------------------------------------------------------
	// Schema item helpers (grohe-smarthome style)
	// ---------------------------------------------------------------------------

	_headerItem(text) {
		return { type: 'header', text, sm: 12, newLine: true };
	}

	_dividerItem() {
		return { type: 'divider', color: 'primary' };
	}

	_staticInfoItem(label, data) {
		return { type: 'staticInfo', label, data, size: TILE_FONT_SIZE, addColon: true, newLine: true };
	}

	/** Read-only state display in the Info tab */
	_stateItem(oid, label, unit) {
		const item = { type: 'state', oid, foreign: true, label, newLine: true };
		if (unit) item.unit = unit;
		return item;
	}

	/** Live state value shown on the main tile (larger font size) */
	_tileStateItem(oid, label, unit) {
		const item = { type: 'state', oid, foreign: true, label, size: TILE_FONT_SIZE, newLine: true };
		if (unit) item.unit = unit;
		return item;
	}

	/** Boolean state displayed as On/Off text on the main tile */
	_tileBoolStateItem(oid, label) {
		return {
			type: 'state',
			oid,
			foreign: true,
			label,
			trueText:  { en: 'On',  de: 'Ein' },
			falseText: { en: 'Off', de: 'Aus' },
			size: TILE_FONT_SIZE,
			newLine: true,
		};
	}

	/** Writable slider state for the Controls tab */
	_sliderStateItem(oid, label, min, max, unit) {
		const item = { type: 'state', oid, foreign: true, label, control: 'slider', min, max, sm: 12, newLine: true };
		if (unit) item.unit = unit;
		return item;
	}
}

module.exports = { TasmotaDeviceManager, detectDeviceType, OBJ_ICONS };
