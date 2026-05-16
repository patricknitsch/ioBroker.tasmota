'use strict';

const { DeviceManagement } = require('@iobroker/dm-utils');

const DEVICE_ICONS = {
	blind: 'blind',
	rgb: 'rgb',
	ct: 'ct',
	dimmer: 'dimmer',
	light: 'light',
	socket: 'socket',
	temperature: 'temperature',
	unknown: 'settings',
};

/**
 * Detect the device type based on which state IDs exist under the device.
 * @param {string[]} stateIds  all state IDs relative to instance namespace
 * @param {string} deviceId
 * @returns {'blind'|'rgb'|'ct'|'dimmer'|'light'|'socket'|'temperature'|'unknown'}
 */
function detectDeviceType(stateIds, deviceId) {
	const prefix = `${deviceId}.`;
	const keys = stateIds.filter(id => id.startsWith(prefix)).map(id => id.slice(prefix.length));
	const has = key => keys.some(k => k === key || k.startsWith(`${key}.`) || k.startsWith(`${key}_`));

	if (has('Shutter1') || keys.some(k => /^Shutter\d/.test(k))) return 'blind';
	if (has('Color') && has('Hue')) return 'rgb';
	if (has('CT') && !has('Color')) return 'ct';
	if (has('Dimmer')) return 'dimmer';
	if (has('CT') || has('Color')) return 'light';
	if (keys.some(k => /^ENERGY/.test(k) || k === 'ENERGY_Power')) return 'socket';
	if (has('POWER') || keys.some(k => /^POWER\d/.test(k))) return 'socket';
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

	/**
	 * @param {import('@iobroker/dm-utils').ActionContext} context
	 */
	async loadDevices(context) {
		const ns = this._tasmota.namespace;
		let stateIds = [];
		try {
			const allObjects = await this._tasmota.getObjectListAsync({
				startkey: `${ns}.`,
				endkey: `${ns}.香`,
			});
			stateIds = allObjects.rows
				.filter(r => r.value?.type === 'state')
				.map(r => r.id.replace(`${ns}.`, ''));
		} catch {
			// continue with empty list
		}

		const devices = [...this._tasmota.knownDevices];
		context.setTotalDevices(devices.length);

		for (const deviceId of devices) {
			const deviceObj = await this._tasmota.getObjectAsync(deviceId).catch(() => null);
			const displayName = deviceObj?.common?.name || deviceId;
			const deviceType = detectDeviceType(stateIds, deviceId);
			const icon = DEVICE_ICONS[deviceType] || DEVICE_ICONS.unknown;

			/** @type {import('@iobroker/dm-utils').DeviceStatus} */
			const status = {
				connection: { stateId: `${ns}.${deviceId}.alive`, type: 'boolean', map: { true: 'connected', false: 'disconnected' } },
				rssi: { stateId: `${ns}.${deviceId}.RSSI` },
			};

			const controls = this._buildControls(deviceId, deviceType, stateIds, ns);

			context.addDevice({
				id: deviceId,
				name: displayName,
				icon,
				status,
				controls,
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
	 * @param {string} deviceId
	 * @param {string} deviceType
	 * @param {string[]} stateIds  relative to namespace
	 * @param {string} ns
	 * @returns {object[]}
	 */
	_buildControls(deviceId, deviceType, stateIds, ns) {
		const controls = [];
		const prefix = `${deviceId}.`;
		const keys = stateIds.filter(id => id.startsWith(prefix)).map(id => id.slice(prefix.length));
		const has = key => keys.includes(key);
		const fqid = key => `${ns}.${deviceId}.${key}`;

		if (has('POWER')) {
			controls.push({ id: 'POWER', type: 'switch', label: { en: 'Power', de: 'Schalter' }, icon: 'socket', stateId: fqid('POWER') });
		}

		const powerKeys = keys.filter(k => /^POWER\d+$/.test(k));
		for (const pk of powerKeys) {
			controls.push({ id: pk, type: 'switch', label: pk, icon: 'socket', stateId: fqid(pk) });
		}

		if (has('Dimmer')) {
			controls.push({ id: 'Dimmer', type: 'slider', label: { en: 'Dimmer', de: 'Dimmer' }, icon: 'dimmer', min: 0, max: 100, unit: '%', stateId: fqid('Dimmer') });
		}

		if (has('CT')) {
			controls.push({ id: 'CT', type: 'slider', label: { en: 'Color Temperature', de: 'Farbtemperatur' }, icon: 'ct', min: 153, max: 500, stateId: fqid('CT') });
		}

		if (has('Color')) {
			controls.push({ id: 'Color', type: 'color', label: { en: 'Color', de: 'Farbe' }, icon: 'rgb', stateId: fqid('Color') });
		}

		if (deviceType === 'blind') {
			const shutterKeys = keys.filter(k => /^Shutter\d+$/.test(k));
			for (const sk of shutterKeys) {
				const posKey = `${sk}.Position`;
				if (has(posKey)) {
					controls.push({ id: `${sk}_Position`, type: 'slider', label: { en: `${sk} Position`, de: `${sk} Position` }, icon: 'blind', min: 0, max: 100, unit: '%', stateId: fqid(posKey) });
				}
			}
		}

		if (has('ENERGY_Power') || keys.some(k => k === 'ENERGY.Power')) {
			const powerStateId = has('ENERGY_Power') ? fqid('ENERGY_Power') : fqid('ENERGY.Power');
			controls.push({ id: 'EnergyPower', type: 'info', label: { en: 'Power', de: 'Leistung' }, icon: 'socket', unit: 'W', stateId: powerStateId });
		}

		return controls;
	}

	/**
	 * @param {string} id  device ID (relative to adapter namespace)
	 */
	async getDeviceDetails(id) {
		const ns = this._tasmota.namespace;
		const schema = {
			type: 'panel',
			items: {
				IPAddress: { type: 'staticText', label: { en: 'IP Address', de: 'IP-Adresse' }, newLine: true },
				Hostname: { type: 'staticText', label: { en: 'Hostname', de: 'Hostname' }, newLine: false },
				Version: { type: 'staticText', label: { en: 'Firmware Version', de: 'Firmware-Version' }, newLine: true },
				Module: { type: 'staticText', label: { en: 'Module', de: 'Modul' }, newLine: false },
				RSSI: { type: 'staticText', label: 'RSSI', newLine: true },
				SSId: { type: 'staticText', label: { en: 'SSID', de: 'WLAN-Name' }, newLine: false },
				Uptime: { type: 'staticText', label: { en: 'Uptime', de: 'Laufzeit' }, newLine: true },
				RestartReason: { type: 'staticText', label: { en: 'Restart Reason', de: 'Neustart-Grund' }, newLine: false },
			},
		};

		const data = {};
		const stateKeys = ['IPAddress', 'Hostname', 'Version', 'Module', 'RSSI', 'SSId', 'Uptime', 'RestartReason'];
		for (const key of stateKeys) {
			try {
				const state = await this._tasmota.getStateAsync(`${id}.${key}`);
				data[key] = state?.val ?? '';
			} catch {
				data[key] = '';
			}
		}

		return { id, schema, data };
	}
}

module.exports = { TasmotaDeviceManager };
