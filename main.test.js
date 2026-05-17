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
const { parseIncomingTopic } = require('./lib/topic-parser');
const { DATAPOINTS } = require('./lib/datapoints');

function makeStub() {
	const adapter = Object.create(Tasmota.prototype);
	adapter.ensuredObjects = new Set();
	adapter.setObjectNotExistsAsync = async () => {};
	adapter.setStateAsync = async () => {};
	return adapter;
}

// ---------------------------------------------------------------------------
// parseScalar / guessStateType
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// topic parser
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// datapoints
// ---------------------------------------------------------------------------
describe('datapoints', () => {
	it('POWER is writable boolean switch', () => {
		expect(DATAPOINTS.POWER).to.deep.include({ type: 'boolean', role: 'switch', write: true });
	});

	it('Temperature is read-only number with unit', () => {
		expect(DATAPOINTS.Temperature).to.deep.include({ type: 'number', role: 'value.temperature', unit: '°C', write: false });
	});

	it('Shutter1_Position is writable level.blind', () => {
		expect(DATAPOINTS.Shutter1_Position).to.deep.include({ type: 'number', role: 'level.blind', write: true, unit: '%' });
	});

	it('CT has correct min/max for color temperature', () => {
		expect(DATAPOINTS.CT.min).to.equal(153);
		expect(DATAPOINTS.CT.max).to.equal(500);
		expect(DATAPOINTS.CT.write).to.equal(true);
	});

	it('Dimmer is writable 0-100', () => {
		expect(DATAPOINTS.Dimmer).to.deep.include({ min: 0, max: 100, write: true });
	});
});

// ---------------------------------------------------------------------------
// isRedundantWrapper
// ---------------------------------------------------------------------------
describe('isRedundantWrapper', () => {
	const adapter = makeStub();

	it('flattens INFO1/Info1', () => {
		expect(adapter.isRedundantWrapper('INFO1', 'Info1')).to.equal(true);
	});

	it('flattens STATUS1/Status', () => {
		expect(adapter.isRedundantWrapper('STATUS1', 'Status')).to.equal(true);
	});

	it('flattens STATUS5/StatusNET (wrapper starts with command base)', () => {
		expect(adapter.isRedundantWrapper('STATUS5', 'StatusNET')).to.equal(true);
	});

	it('does not flatten STATE/POWER', () => {
		expect(adapter.isRedundantWrapper('STATE', 'POWER')).to.equal(false);
	});

	it('does not flatten SENSOR/DS18B20', () => {
		expect(adapter.isRedundantWrapper('SENSOR', 'DS18B20')).to.equal(false);
	});
});

// ---------------------------------------------------------------------------
// stateKeyToCommand
// ---------------------------------------------------------------------------
describe('stateKeyToCommand', () => {
	const adapter = makeStub();

	it('maps Shutter1.Position → ShutterPosition1', () => {
		expect(adapter.stateKeyToCommand('Shutter1', 'Position')).to.equal('ShutterPosition1');
	});

	it('maps Shutter2.Tilt → ShutterTilt2', () => {
		expect(adapter.stateKeyToCommand('Shutter2', 'Tilt')).to.equal('ShutterTilt2');
	});

	it('returns null for read-only Shutter sub-states', () => {
		expect(adapter.stateKeyToCommand('Shutter1', 'Direction')).to.equal(null);
		expect(adapter.stateKeyToCommand('Shutter1', 'Target')).to.equal(null);
	});

	it('returns state key as command for non-channel states', () => {
		expect(adapter.stateKeyToCommand(null, 'POWER')).to.equal('POWER');
		expect(adapter.stateKeyToCommand(null, 'Dimmer')).to.equal('Dimmer');
	});
});

// ---------------------------------------------------------------------------
// storeObjectPayload – wrapper flattening + state storage
// ---------------------------------------------------------------------------
describe('storeObjectPayload', () => {
	it('flattens INFO1 wrapper and stores leaf states directly', async () => {
		const adapter = makeStub();
		const stored = [];
		adapter.storeLeafState = async (deviceId, channelKey, stateKey, value) => {
			stored.push({ deviceId, channelKey, stateKey, value });
		};
		adapter.ensureChannel = async () => {};

		// INFO1 payload: {"Info1": {"Module": "Generic", "Version": "12.4.0"}}
		await adapter.storeObjectPayload('dev1', ['INFO1'], { Info1: { Module: 'Generic', Version: '12.4.0' } });

		expect(stored).to.have.length(2);
		expect(stored.find(s => s.stateKey === 'Module' && s.channelKey === null)).to.exist;
		expect(stored.find(s => s.stateKey === 'Version' && s.channelKey === null)).to.exist;
	});

	it('flattens STATUS5/StatusNET wrapper', async () => {
		const adapter = makeStub();
		const stored = [];
		adapter.storeLeafState = async (deviceId, channelKey, stateKey, value) => {
			stored.push({ channelKey, stateKey });
		};
		adapter.ensureChannel = async () => {};

		await adapter.storeObjectPayload('dev1', ['STATUS5'], { StatusNET: { Hostname: 'dev1', IPAddress: '192.168.1.1' } });

		expect(stored.find(s => s.stateKey === 'Hostname' && s.channelKey === null)).to.exist;
		expect(stored.find(s => s.stateKey === 'IPAddress' && s.channelKey === null)).to.exist;
	});

	it('creates channel for ENERGY sub-object', async () => {
		const adapter = makeStub();
		const stored = [];
		const channels = [];
		adapter.storeLeafState = async (deviceId, channelKey, stateKey, value) => {
			stored.push({ channelKey, stateKey, value });
		};
		adapter.ensureChannel = async (deviceId, key) => {
			channels.push(key);
		};

		await adapter.storeObjectPayload('dev1', ['SENSOR'], {
			Time: '2023-01-01',
			ENERGY: { Power: 1500, Voltage: 230 },
		});

		expect(channels).to.include('ENERGY');
		expect(stored.find(s => s.channelKey === 'ENERGY' && s.stateKey === 'Power')).to.exist;
		expect(stored.find(s => s.stateKey === 'Time' && s.channelKey === null)).to.exist;
	});

	it('creates channel for Shutter sub-object with compound key lookup', async () => {
		const adapter = makeStub();
		const stored = [];
		adapter.storeLeafState = async (deviceId, channelKey, stateKey, value) => {
			stored.push({ channelKey, stateKey, value });
		};
		adapter.ensureChannel = async () => {};

		await adapter.storeObjectPayload('dev1', ['STATE'], {
			Shutter1: { Position: 50, Direction: 0, Target: 50 },
		});

		const pos = stored.find(s => s.channelKey === 'Shutter1' && s.stateKey === 'Position');
		expect(pos).to.exist;
		expect(pos.value).to.equal(50);
	});
});
