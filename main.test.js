'use strict';

const { expect } = require('chai');

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
const { classifyState } = require('./lib/classifier');
const { parseIncomingTopic } = require('./lib/topic-parser');

function makeStub() {
	return Object.create(Tasmota.prototype);
}

describe('Tasmota helper methods', () => {
	const adapter = makeStub();

	describe('parseScalar', () => {
		it('converts ON/ONLINE to boolean true', () => {
			expect(adapter.parseScalar('ON')).to.equal(true);
			expect(adapter.parseScalar('Online')).to.equal(true);
		});

		it('converts OFF/OFFLINE to boolean false', () => {
			expect(adapter.parseScalar('OFF')).to.equal(false);
			expect(adapter.parseScalar('offline')).to.equal(false);
		});

		it('converts numeric strings to numbers', () => {
			expect(adapter.parseScalar('42')).to.equal(42);
			expect(adapter.parseScalar('3.14')).to.equal(3.14);
		});
	});

	describe('guessStateType', () => {
		it('returns boolean for ON/OFF', () => {
			expect(adapter.guessStateType('ON')).to.equal('boolean');
			expect(adapter.guessStateType('OFF')).to.equal('boolean');
		});

		it('returns number for numeric strings', () => {
			expect(adapter.guessStateType('42')).to.equal('number');
		});

		it('returns string for plain text', () => {
			expect(adapter.guessStateType('hello')).to.equal('string');
		});
	});

	describe('getConfigurationErrors', () => {
		it('returns errors when required client fields are missing', () => {
			adapter.config = {
				mode: 'client',
				brokerUrl: '',
				brokerPort: 0,
				brokerTopicPrefix: '',
				brokerUseTls: false,
				brokerUser: '',
				brokerPassword: '',
			};
			const errors = adapter.getConfigurationErrors();
			expect(errors).to.include('Broker Host fehlt.');
			expect(errors).to.include('Broker Port ist ungültig.');
			expect(errors).to.include('Topic-Präfix fehlt.');
		});

		it('returns no errors for complete basic client config', () => {
			adapter.config = {
				mode: 'client',
				brokerUrl: 'localhost',
				brokerPort: 1883,
				brokerTopicPrefix: 'tasmota',
				brokerUseTls: false,
				brokerUser: '',
				brokerPassword: '',
			};
			expect(adapter.getConfigurationErrors()).to.deep.equal([]);
		});

		it('validates username/password and tls keypair completeness', () => {
			adapter.config = {
				mode: 'client',
				brokerUrl: 'localhost',
				brokerPort: 1883,
				brokerTopicPrefix: 'tasmota',
				brokerUseTls: true,
				brokerUser: 'user',
				brokerPassword: '',
				brokerCertPath: '/tmp/cert.pem',
				brokerKeyPath: '',
			};
			const errors = adapter.getConfigurationErrors();
			expect(errors).to.include('Broker Benutzername und Passwort müssen gemeinsam gesetzt werden.');
			expect(errors).to.include('TLS-Zertifikat und TLS-Schlüssel müssen gemeinsam gesetzt werden.');
		});
	});
});

describe('classifier', () => {
	it('classifies wifi values into wifi folder', () => {
		const result = classifyState({ prefix: 'tele', sourceParts: ['tele', 'STATE', 'Wifi', 'RSSI'], value: 88 });
		expect(result.folder).to.equal('wifi');
		expect(result.unit).to.equal('%');
	});

	it('classifies power commands into controls folder', () => {
		const result = classifyState({ prefix: 'cmnd', sourceParts: ['cmnd', 'POWER1'], value: 'ON' });
		expect(result.folder).to.equal('controls');
		expect(result.write).to.equal(true);
	});

	it('classifies light controls (Dimmer, Color, CT, Hue) into controls folder', () => {
		expect(classifyState({ prefix: 'stat', sourceParts: ['stat', 'RESULT', 'Dimmer'], value: 50 }).folder).to.equal('controls');
		expect(classifyState({ prefix: 'stat', sourceParts: ['stat', 'RESULT', 'CT'], value: 300 }).folder).to.equal('controls');
		expect(classifyState({ prefix: 'stat', sourceParts: ['stat', 'RESULT', 'Color'], value: 'FF0000' }).folder).to.equal('controls');
		expect(classifyState({ prefix: 'stat', sourceParts: ['stat', 'RESULT', 'Hue'], value: 120 }).folder).to.equal('controls');
	});

	it('classifies shutter controls into controls folder', () => {
		expect(classifyState({ prefix: 'stat', sourceParts: ['stat', 'RESULT', 'ShutterPosition1'], value: 50 }).folder).to.equal('controls');
		expect(classifyState({ prefix: 'stat', sourceParts: ['stat', 'RESULT', 'ShutterOpen1'], value: true }).folder).to.equal('controls');
	});

	it('classifies fan speed into controls folder', () => {
		const result = classifyState({ prefix: 'stat', sourceParts: ['stat', 'RESULT', 'FanSpeed'], value: 2 });
		expect(result.folder).to.equal('controls');
		expect(result.write).to.equal(true);
	});

	it('classifies physical switch state into info folder (not controls)', () => {
		const result = classifyState({ prefix: 'stat', sourceParts: ['stat', 'RESULT', 'Switch1'], value: 'ON' });
		expect(result.folder).to.equal('info');
		expect(result.write).to.equal(false);
	});

	it('classifies button events into info folder (not controls)', () => {
		const result = classifyState({ prefix: 'stat', sourceParts: ['stat', 'RESULT', 'Button1'], value: 'SINGLE' });
		expect(result.folder).to.equal('info');
		expect(result.write).to.equal(false);
	});

	it('CT profile has correct metadata', () => {
		const result = classifyState({ prefix: 'stat', sourceParts: ['stat', 'RESULT', 'CT'], value: 300 });
		expect(result.type).to.equal('number');
		expect(result.role).to.equal('level.color.temperature');
		expect(result.unit).to.equal('mired');
	});

	it('ShutterPosition profile has correct metadata', () => {
		const result = classifyState({ prefix: 'stat', sourceParts: ['stat', 'RESULT', 'ShutterPosition1'], value: 75 });
		expect(result.type).to.equal('number');
		expect(result.role).to.equal('level.blind');
		expect(result.unit).to.equal('%');
	});
});

describe('topic parser', () => {
	it('parses prefix-first topics', () => {
		const parsed = parseIncomingTopic('tasmota/tele/device1/STATE', ['tasmota'], 'prefix-first');
		expect(parsed).to.deep.equal({ deviceId: 'device1', prefix: 'tele', commandParts: ['STATE'] });
	});

	it('parses device-first topics', () => {
		const parsed = parseIncomingTopic('tasmota/device1/tele/STATE', ['tasmota'], 'device-first');
		expect(parsed).to.deep.equal({ deviceId: 'device1', prefix: 'tele', commandParts: ['STATE'] });
	});

	it('parses LWT topics', () => {
		const parsed = parseIncomingTopic('tasmota/tele/device1/LWT', ['tasmota'], 'prefix-first');
		expect(parsed).to.deep.equal({ deviceId: 'device1', prefix: 'tele', commandParts: ['LWT'] });
	});
});

describe('storeObjectPayload wrapper flattening', () => {
	it('flattens single-key wrapper when key matches command name (INFO1 → Info1)', async () => {
		const adapter = makeStub();
		const stored = [];
		adapter.storeClassifiedState = async (deviceId, idPath, sourceParts, value) => {
			stored.push({ deviceId, idPath, value });
		};

		// Simulate INFO1 payload: {"Info1": {"Version": "12.4.0", "Module": "Generic"}}
		await adapter.storeObjectPayload('device1', 'tele', { Info1: { Version: '12.4.0', Module: 'Generic' } }, ['INFO1'], ['tele', 'INFO1']);

		expect(stored).to.have.length(2);
		// States should be at INFO1 level, not INFO1.Info1
		expect(stored.find(s => s.idPath.join('.') === 'INFO1.Version')).to.exist;
		expect(stored.find(s => s.idPath.join('.') === 'INFO1.Module')).to.exist;
	});

	it('does not flatten when key does not match command name', async () => {
		const adapter = makeStub();
		const stored = [];
		adapter.storeClassifiedState = async (deviceId, idPath, sourceParts, value) => {
			stored.push({ deviceId, idPath, value });
		};

		// Simulate STATUS5 payload: {"StatusNET": {"Hostname": "device1"}}
		await adapter.storeObjectPayload('device1', 'stat', { StatusNET: { Hostname: 'device1' } }, ['STATUS5'], ['stat', 'STATUS5']);

		expect(stored).to.have.length(1);
		// StatusNET wrapper should be kept → STATUS5.StatusNET.Hostname
		expect(stored[0].idPath.join('.')).to.equal('STATUS5.StatusNET.Hostname');
	});

	it('does not flatten objects with multiple top-level keys', async () => {
		const adapter = makeStub();
		const stored = [];
		adapter.storeClassifiedState = async (deviceId, idPath, sourceParts, value) => {
			stored.push({ deviceId, idPath, value });
		};

		// STATE payload has multiple top-level keys → no flattening
		await adapter.storeObjectPayload('device1', 'tele', { POWER: 'ON', Heap: 29 }, ['STATE'], ['tele', 'STATE']);

		expect(stored).to.have.length(2);
		expect(stored.find(s => s.idPath.join('.') === 'STATE.POWER')).to.exist;
		expect(stored.find(s => s.idPath.join('.') === 'STATE.Heap')).to.exist;
	});
});
