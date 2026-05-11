'use strict';

const { expect } = require('chai');
const { mapMessage, coerce } = require('./lib/mapper');
const { getDatapoint, buildCommon, isPowerKey } = require('./lib/datapoints');

// Mock @iobroker/adapter-core so this unit test can run without a
// js-controller installation.
const adapterCorePath = require.resolve('@iobroker/adapter-core');
if (!require.cache[adapterCorePath] || !require.cache[adapterCorePath].exports.Adapter) {
	/** @type {any} */
	const cache = require.cache;
	cache[adapterCorePath] = {
		id: adapterCorePath,
		filename: adapterCorePath,
		loaded: true,
		exports: {
			Adapter: class MockAdapter {
				constructor(_options) {}
			},
		},
	};
}

const { Tasmota } = require('./main');

// Helper: create a minimal Tasmota stub for unit testing prototype methods.
function makeStub() {
	const stub = Object.create(Tasmota.prototype);
	// Provide the ioBroker adapter primitives used by legacy helpers
	stub.setObjectNotExistsAsync = async () => {};
	stub.setStateAsync = async () => {};
	return stub;
}

// ============================================================
// lib/datapoints.js
// ============================================================

describe('lib/datapoints', () => {
	describe('isPowerKey', () => {
		it('matches POWER', () => expect(isPowerKey('POWER')).to.equal(true));
		it('matches POWER1', () => expect(isPowerKey('POWER1')).to.equal(true));
		it('matches POWER8', () => expect(isPowerKey('POWER8')).to.equal(true));
		it('is case-insensitive', () => expect(isPowerKey('power2')).to.equal(true));
		it('does not match arbitrary keys', () => expect(isPowerKey('voltage')).to.equal(false));
	});

	describe('getDatapoint', () => {
		it('returns voltage definition', () => {
			const dp = getDatapoint('Voltage');
			expect(dp).to.exist;
			expect(dp.channel).to.equal('energy');
			expect(dp.unit).to.equal('V');
			expect(dp.role).to.equal('value.voltage');
			expect(dp.write).to.equal(false);
		});
		it('returns temperature definition', () => {
			const dp = getDatapoint('Temperature');
			expect(dp).to.exist;
			expect(dp.channel).to.equal('sensors');
			expect(dp.unit).to.equal('\u00b0C');
		});
		it('returns POWER definition for POWER pattern', () => {
			const dp = getDatapoint('POWER');
			expect(dp).to.exist;
			expect(dp.channel).to.equal('controls');
			expect(dp.type).to.equal('boolean');
			expect(dp.write).to.equal(true);
		});
		it('returns POWER definition for POWER3 pattern', () => {
			const dp = getDatapoint('POWER3');
			expect(dp).to.exist;
			expect(dp.channel).to.equal('controls');
		});
		it('returns undefined for completely unknown key', () => {
			expect(getDatapoint('totallyrandom_xyz')).to.equal(undefined);
		});
	});

	describe('buildCommon', () => {
		it('returns correct common for known field', () => {
			const c = buildCommon('Voltage', 230);
			expect(c.role).to.equal('value.voltage');
			expect(c.unit).to.equal('V');
			expect(c.write).to.equal(false);
		});
		it('infers boolean type from ON/OFF value for unknown key', () => {
			const c = buildCommon('unknownKey', 'ON');
			expect(c.type).to.equal('boolean');
		});
		it('infers number type for numeric value for unknown key', () => {
			const c = buildCommon('unknownKey', 42);
			expect(c.type).to.equal('number');
		});
		it('writable override is applied', () => {
			const c = buildCommon('Voltage', 230, true);
			expect(c.write).to.equal(true);
		});
	});
});

// ============================================================
// lib/mapper.js
// ============================================================

describe('lib/mapper — mapMessage', () => {
	describe('tele/LWT', () => {
		it('maps "Online" to info.online = true', () => {
			const r = mapMessage('tele', 'LWT', 'Online');
			expect(r).to.have.length(1);
			expect(r[0].path).to.equal('info.online');
			expect(r[0].value).to.equal(true);
		});
		it('maps "Offline" to info.online = false', () => {
			const r = mapMessage('tele', 'LWT', 'Offline');
			expect(r[0].value).to.equal(false);
		});
	});

	describe('tele/STATE', () => {
		const STATE_JSON = JSON.stringify({
			Time: '2024-01-01T12:00:00',
			Uptime: '1T12:00:00',
			Heap: 26,
			LoadAvg: 19,
			MqttCount: 5,
			POWER: 'ON',
			POWER2: 'OFF',
			Dimmer: 75,
			Wifi: { RSSI: 88, Signal: -56, SSId: 'MyNet', LinkCount: 1, Channel: 6 },
		});

		let results;
		before(() => {
			results = mapMessage('tele', 'STATE', STATE_JSON);
		});

		it('maps POWER to controls.POWER (boolean true)', () => {
			const e = results.find(r => r.path === 'controls.POWER');
			expect(e).to.exist;
			expect(e.value).to.equal(true);
			expect(e.writable).to.equal(true);
		});
		it('maps POWER2 to controls.POWER2 (boolean false)', () => {
			const e = results.find(r => r.path === 'controls.POWER2');
			expect(e).to.exist;
			expect(e.value).to.equal(false);
		});
		it('maps Dimmer to controls.Dimmer', () => {
			const e = results.find(r => r.path === 'controls.Dimmer');
			expect(e).to.exist;
			expect(e.value).to.equal(75);
		});
		it('maps Wifi.RSSI to wifi.rssi', () => {
			const e = results.find(r => r.path === 'wifi.rssi');
			expect(e).to.exist;
			expect(e.value).to.equal(88);
		});
		it('maps Wifi.Signal to wifi.signal', () => {
			const e = results.find(r => r.path === 'wifi.signal');
			expect(e).to.exist;
		});
		it('maps Wifi.SSId to wifi.ssid', () => {
			const e = results.find(r => r.path === 'wifi.ssid');
			expect(e).to.exist;
			expect(e.value).to.equal('MyNet');
		});
		it('maps Uptime to info.uptime', () => {
			const e = results.find(r => r.path === 'info.uptime');
			expect(e).to.exist;
		});
		it('maps Heap to status.heap', () => {
			const e = results.find(r => r.path === 'status.heap');
			expect(e).to.exist;
			expect(e.value).to.equal(26);
		});
		it('skips Time field', () => {
			const e = results.find(r => r.path.includes('Time'));
			expect(e).to.not.exist;
		});
	});

	describe('tele/SENSOR', () => {
		const SENSOR_JSON = JSON.stringify({
			Time: '2024-01-01T12:00:00',
			DHT22: { Temperature: 25.1, Humidity: 60.0, DewPoint: 16.2 },
			TempUnit: 'C',
		});

		let results;
		before(() => {
			results = mapMessage('tele', 'SENSOR', SENSOR_JSON);
		});

		it('maps DHT22.Temperature to sensors.DHT22_Temperature', () => {
			const e = results.find(r => r.path === 'sensors.DHT22_Temperature');
			expect(e).to.exist;
			expect(e.value).to.equal(25.1);
			expect(e.writable).to.equal(false);
		});
		it('maps DHT22.Humidity to sensors.DHT22_Humidity', () => {
			const e = results.find(r => r.path === 'sensors.DHT22_Humidity');
			expect(e).to.exist;
			expect(e.value).to.equal(60.0);
		});
		it('skips Time and TempUnit', () => {
			const timeEntry = results.find(r => r.path.toLowerCase().includes('time'));
			expect(timeEntry).to.not.exist;
		});
	});

	describe('tele/ENERGY', () => {
		const ENERGY_JSON = JSON.stringify({
			Voltage: 231, Current: 0.291, Power: 65,
			ApparentPower: 67, ReactivePower: 15, Factor: 0.97,
			Today: 0.017, Yesterday: 0.002, Total: 0.217, Period: 0,
		});

		let results;
		before(() => {
			results = mapMessage('tele', 'ENERGY', ENERGY_JSON);
		});

		it('maps Voltage to energy.voltage', () => {
			const e = results.find(r => r.path === 'energy.voltage');
			expect(e).to.exist;
			expect(e.value).to.equal(231);
			expect(e.writable).to.equal(false);
		});
		it('maps Power to energy.power', () => {
			const e = results.find(r => r.path === 'energy.power');
			expect(e).to.exist;
			expect(e.value).to.equal(65);
		});
		it('maps Total to energy.total', () => {
			const e = results.find(r => r.path === 'energy.total');
			expect(e).to.exist;
			expect(e.value).to.equal(0.217);
		});
		it('maps Factor to energy.factor', () => {
			const e = results.find(r => r.path === 'energy.factor');
			expect(e).to.exist;
			expect(e.value).to.equal(0.97);
		});
	});

	describe('stat/RESULT', () => {
		it('maps POWER ON result', () => {
			const r = mapMessage('stat', 'RESULT', JSON.stringify({ POWER: 'ON' }));
			const e = r.find(x => x.path === 'controls.POWER');
			expect(e).to.exist;
			expect(e.value).to.equal(true);
		});
		it('maps Dimmer result', () => {
			const r = mapMessage('stat', 'RESULT', JSON.stringify({ Dimmer: 50 }));
			const e = r.find(x => x.path === 'controls.Dimmer');
			expect(e).to.exist;
			expect(e.value).to.equal(50);
		});
	});

	describe('stat/POWER', () => {
		it('maps stat/POWER ON to controls.POWER true', () => {
			const r = mapMessage('stat', 'POWER', 'ON');
			expect(r).to.have.length(1);
			expect(r[0].path).to.equal('controls.POWER');
			expect(r[0].value).to.equal(true);
		});
		it('maps stat/POWER1 OFF to controls.POWER1 false', () => {
			const r = mapMessage('stat', 'POWER1', 'OFF');
			expect(r[0].path).to.equal('controls.POWER1');
			expect(r[0].value).to.equal(false);
		});
	});

	describe('stat/STATUS (Status 1)', () => {
		const STATUS_JSON = JSON.stringify({
			Status: { Module: 1, FriendlyName: ['My Switch'], Power: 0 },
		});

		let results;
		before(() => {
			results = mapMessage('stat', 'STATUS', STATUS_JSON);
		});

		it('maps FriendlyName to info.friendlyName', () => {
			const e = results.find(r => r.path === 'info.friendlyName');
			expect(e).to.exist;
			expect(e.value).to.equal('My Switch');
		});
		it('maps Module to info.module', () => {
			const e = results.find(r => r.path === 'info.module');
			expect(e).to.exist;
		});
	});

	describe('stat/STATUS2 (Firmware)', () => {
		const STATUS2_JSON = JSON.stringify({
			StatusFWR: { Version: '13.4.0(tasmota)', Hardware: 'ESP8266EX', Core: '2_7_7', SDK: '2.2.2' },
		});

		let results;
		before(() => {
			results = mapMessage('stat', 'STATUS2', STATUS2_JSON);
		});

		it('maps Version to info.version', () => {
			const e = results.find(r => r.path === 'info.version');
			expect(e).to.exist;
			expect(e.value).to.equal('13.4.0(tasmota)');
		});
		it('maps Hardware to info.hardware', () => {
			const e = results.find(r => r.path === 'info.hardware');
			expect(e).to.exist;
			expect(e.value).to.equal('ESP8266EX');
		});
	});

	describe('stat/STATUS5 (Network)', () => {
		const STATUS5_JSON = JSON.stringify({
			StatusNET: { Hostname: 'tasmota-sw', IPAddress: '192.168.1.100', Mac: 'AB:CD:EF:01:23:45', Gateway: '192.168.1.1' },
		});

		let results;
		before(() => {
			results = mapMessage('stat', 'STATUS5', STATUS5_JSON);
		});

		it('maps Hostname to info.hostname', () => {
			const e = results.find(r => r.path === 'info.hostname');
			expect(e).to.exist;
			expect(e.value).to.equal('tasmota-sw');
		});
		it('maps IPAddress to info.ip', () => {
			const e = results.find(r => r.path === 'info.ip');
			expect(e).to.exist;
			expect(e.value).to.equal('192.168.1.100');
		});
		it('maps Mac to info.mac', () => {
			const e = results.find(r => r.path === 'info.mac');
			expect(e).to.exist;
		});
	});

	describe('stat/STATUS8 (Energy+Sensor)', () => {
		const STATUS8_JSON = JSON.stringify({
			StatusSNS: {
				Time: '2024-01-01T12:00:00',
				ENERGY: { Voltage: 230, Current: 0.5, Power: 100, Total: 1.0, Today: 0.5, Yesterday: 0.8 },
				DHT22: { Temperature: 22.0, Humidity: 55.0 },
			},
		});

		let results;
		before(() => {
			results = mapMessage('stat', 'STATUS8', STATUS8_JSON);
		});

		it('maps ENERGY.Voltage to energy.voltage', () => {
			const e = results.find(r => r.path === 'energy.voltage');
			expect(e).to.exist;
			expect(e.value).to.equal(230);
		});
		it('maps DHT22.Temperature to sensors channel', () => {
			const e = results.find(r => r.path.includes('Temperature'));
			expect(e).to.exist;
		});
	});

	describe('unknown messages', () => {
		it('returns empty array for cmnd messages', () => {
			const r = mapMessage('cmnd', 'POWER', 'ON');
			expect(r).to.be.an('array').with.length(0);
		});
		it('returns empty array for completely unknown command', () => {
			const r = mapMessage('tele', 'UNKNOWN_CMD_XYZ', 'payload');
			expect(r).to.be.an('array').with.length(0);
		});
	});

	describe('coerce', () => {
		it('converts "ON" to boolean true', () => expect(coerce('ON')).to.equal(true));
		it('converts "OFF" to boolean false', () => expect(coerce('OFF')).to.equal(false));
		it('converts "42" to number 42', () => expect(coerce('42')).to.equal(42));
		it('passes through native number unchanged', () => expect(coerce(42)).to.equal(42));
		it('passes through native boolean unchanged', () => expect(coerce(true)).to.equal(true));
		it('leaves unknown string unchanged', () => expect(coerce('hello')).to.equal('hello'));
	});
});

// ============================================================
// Tasmota adapter helper methods (legacy paths kept for compat)
// ============================================================

describe('Tasmota helper methods', () => {
	const adapter = makeStub();

	describe('parseScalar', () => {
		it('converts "ON" to boolean true', () => {
			expect(adapter.parseScalar('ON')).to.equal(true);
		});
		it('converts "OFF" to boolean false', () => {
			expect(adapter.parseScalar('OFF')).to.equal(false);
		});
		it('converts "true" to boolean true', () => {
			expect(adapter.parseScalar('true')).to.equal(true);
		});
		it('converts "false" to boolean false', () => {
			expect(adapter.parseScalar('false')).to.equal(false);
		});
		it('converts numeric strings to numbers', () => {
			expect(adapter.parseScalar('42')).to.equal(42);
			expect(adapter.parseScalar('3.14')).to.equal(3.14);
			expect(adapter.parseScalar('0')).to.equal(0);
		});
		it('leaves plain strings unchanged', () => {
			expect(adapter.parseScalar('hello')).to.equal('hello');
		});
	});

	describe('guessStateType', () => {
		it('returns "boolean" for ON/OFF/true/false', () => {
			expect(adapter.guessStateType('ON')).to.equal('boolean');
			expect(adapter.guessStateType('OFF')).to.equal('boolean');
			expect(adapter.guessStateType('true')).to.equal('boolean');
			expect(adapter.guessStateType('false')).to.equal('boolean');
		});
		it('returns "number" for numeric strings', () => {
			expect(adapter.guessStateType('42')).to.equal('number');
			expect(adapter.guessStateType('3.14')).to.equal('number');
		});
		it('returns "string" for plain text', () => {
			expect(adapter.guessStateType('hello')).to.equal('string');
		});
	});

	describe('processJsonObject — value type conversion', () => {
		function makeStubWithCapture() {
			const stub = makeStub();
			const stored = {};
			stub.setObjectNotExistsAsync = async () => {};
			stub.setStateAsync = async (id, stateObj) => {
				stored[id] = stateObj.val;
			};
			return { stub, stored };
		}

		it('stores boolean true for JSON "ON" and boolean false for "OFF"', async () => {
			const { stub, stored } = makeStubWithCapture();
			await stub.processJsonObject('dev.tele.STATE', 'dev.tele.STATE', { POWER: 'ON', POWER2: 'OFF' }, 'STATE');
			expect(stored['dev.tele.STATE.POWER']).to.equal(true);
			expect(stored['dev.tele.STATE.POWER2']).to.equal(false);
		});

		it('stores numeric value for JSON numeric string', async () => {
			const { stub, stored } = makeStubWithCapture();
			await stub.processJsonObject('dev.tele.STATE', 'dev.tele.STATE', { Dimmer: '75' }, 'STATE');
			expect(stored['dev.tele.STATE.Dimmer']).to.equal(75);
		});

		it('passes through native JSON boolean values unchanged', async () => {
			const { stub, stored } = makeStubWithCapture();
			await stub.processJsonObject('dev.tele.STATE', 'dev.tele.STATE', { active: true }, 'STATE');
			expect(stored['dev.tele.STATE.active']).to.equal(true);
		});

		it('passes through native JSON number values unchanged', async () => {
			const { stub, stored } = makeStubWithCapture();
			await stub.processJsonObject('dev.tele.STATE', 'dev.tele.STATE', { Temperature: 23.5 }, 'STATE');
			expect(stored['dev.tele.STATE.Temperature']).to.equal(23.5);
		});

		it('stores string value for non-convertible JSON strings', async () => {
			const { stub, stored } = makeStubWithCapture();
			await stub.processJsonObject('dev.tele.STATE', 'dev.tele.STATE', { Time: '2024-01-01T00:00:00' }, 'STATE');
			expect(stored['dev.tele.STATE.Time']).to.equal('2024-01-01T00:00:00');
		});
	});
});
