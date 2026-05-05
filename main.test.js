'use strict';

const { expect } = require('chai');

// Mock @iobroker/adapter-core so this unit test can run without a
// js-controller installation.  The mock must be injected into the module
// cache *before* main.js is loaded for the first time.
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

// Helper: bind a Tasmota prototype method to a minimal stub so it can be
// called without a real ioBroker adapter instance.
function makeStub() {
	return Object.create(Tasmota.prototype);
}

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
		it('stores boolean true for JSON "ON" and boolean false for "OFF"', async () => {
			const stub = makeStub();
			const stored = {};

			stub.ensureObject = async () => {};
			stub.setStateAsAck = async (id, val) => {
				stored[id] = val;
			};

			await stub.processJsonObject('dev.tele.STATE', 'dev.tele.STATE', { POWER: 'ON', POWER2: 'OFF' }, 'STATE');

			expect(stored['dev.tele.STATE.POWER']).to.equal(true);
			expect(stored['dev.tele.STATE.POWER2']).to.equal(false);
		});

		it('stores numeric value for JSON numeric string', async () => {
			const stub = makeStub();
			const stored = {};

			stub.ensureObject = async () => {};
			stub.setStateAsAck = async (id, val) => {
				stored[id] = val;
			};

			await stub.processJsonObject('dev.tele.STATE', 'dev.tele.STATE', { Dimmer: '75' }, 'STATE');

			expect(stored['dev.tele.STATE.Dimmer']).to.equal(75);
		});

		it('passes through native JSON boolean values unchanged', async () => {
			const stub = makeStub();
			const stored = {};

			stub.ensureObject = async () => {};
			stub.setStateAsAck = async (id, val) => {
				stored[id] = val;
			};

			await stub.processJsonObject('dev.tele.STATE', 'dev.tele.STATE', { active: true }, 'STATE');

			expect(stored['dev.tele.STATE.active']).to.equal(true);
		});

		it('passes through native JSON number values unchanged', async () => {
			const stub = makeStub();
			const stored = {};

			stub.ensureObject = async () => {};
			stub.setStateAsAck = async (id, val) => {
				stored[id] = val;
			};

			await stub.processJsonObject('dev.tele.STATE', 'dev.tele.STATE', { Temperature: 23.5 }, 'STATE');

			expect(stored['dev.tele.STATE.Temperature']).to.equal(23.5);
		});

		it('stores string value for non-convertible JSON strings', async () => {
			const stub = makeStub();
			const stored = {};

			stub.ensureObject = async () => {};
			stub.setStateAsAck = async (id, val) => {
				stored[id] = val;
			};

			await stub.processJsonObject('dev.tele.STATE', 'dev.tele.STATE', { Time: '2024-01-01T00:00:00' }, 'STATE');

			expect(stored['dev.tele.STATE.Time']).to.equal('2024-01-01T00:00:00');
		});
	});
});

describe('processMqttMessage – tele filtering (raw mode)', () => {
	/**
	 * Build a minimal adapter stub that captures setObjectNotExists / setState
	 * calls and honours config settings.
	 *
	 * @param {object} config - adapter config overrides
	 */
	function makeProcessStub(config) {
		const stub = makeStub();
		// Default to raw mode for the tele-filtering tests (behaviour unchanged from v1)
		stub.config = { brokerTopicStructure: 'prefix-first', brokerTopicPrefix: '', rawTopicMode: true, ...config };
		stub.namespace = 'tasmota.0';
		stub.log = { debug: () => {}, info: () => {}, warn: () => {} };

		stub.createdObjects = [];
		stub.setStates = [];

		stub.setObjectNotExistsAsync = async id => { stub.createdObjects.push(id); };
		stub.setStateAsync = async (id, val) => { stub.setStates.push({ id, val }); };

		stub.getTopicPrefixes = () => {
			return (stub.config.brokerTopicPrefix || '').split(',').map(p => p.trim()).filter(Boolean);
		};
		stub.sanitizeId = input => input.replace(/[^A-Za-z0-9\-_]/g, '_');
		stub.parseScalar = Tasmota.prototype.parseScalar;
		stub.guessStateRole = Tasmota.prototype.guessStateRole;
		stub.guessStateType = Tasmota.prototype.guessStateType;

		stub.ensureObject = Tasmota.prototype.ensureObject.bind(stub);
		stub.setStateAsAck = Tasmota.prototype.setStateAsAck.bind(stub);
		stub.setStateValue = Tasmota.prototype.setStateValue.bind(stub);
		stub.processJsonObject = Tasmota.prototype.processJsonObject.bind(stub);

		return stub;
	}

	it('skips tele messages when storeTeleData is false (default)', async () => {
		const stub = makeProcessStub({ storeTeleData: false });
		await stub.processMqttMessage('tele/mydevice/STATE', '{"POWER":"ON"}');
		expect(stub.createdObjects).to.have.lengthOf(0);
		expect(stub.setStates).to.have.lengthOf(0);
	});

	it('processes tele messages when storeTeleData is true', async () => {
		const stub = makeProcessStub({ storeTeleData: true });
		await stub.processMqttMessage('tele/mydevice/STATE', '{"POWER":"ON"}');
		// At least one object should have been created (device + channel + state)
		expect(stub.createdObjects.length).to.be.greaterThan(0);
	});

	it('always processes cmnd messages regardless of storeTeleData', async () => {
		const stub = makeProcessStub({ storeTeleData: false });
		await stub.processMqttMessage('cmnd/mydevice/POWER', 'ON');
		expect(stub.createdObjects.length).to.be.greaterThan(0);
	});

	it('always processes stat messages regardless of storeTeleData', async () => {
		const stub = makeProcessStub({ storeTeleData: false });
		await stub.processMqttMessage('stat/mydevice/RESULT', '{"POWER":"ON"}');
		expect(stub.createdObjects.length).to.be.greaterThan(0);
	});

	it('skips tele messages in device-first topic structure', async () => {
		const stub = makeProcessStub({ storeTeleData: false, brokerTopicStructure: 'device-first' });
		await stub.processMqttMessage('mydevice/tele/STATE', '{"POWER":"ON"}');
		expect(stub.createdObjects).to.have.lengthOf(0);
	});
});

describe('processMqttMessage – structured mode', () => {
	/**
	 * Build a stub pre-configured for structured mode (rawTopicMode = false).
	 * Structured mode stores flat states directly under the device root.
	 *
	 * @param {object} [config] - optional config overrides
	 */
	function makeStructuredStub(config) {
		const stub = makeStub();
		stub.config = {
			brokerTopicStructure: 'prefix-first',
			brokerTopicPrefix: '',
			rawTopicMode: false,
			...config,
		};
		stub.namespace = 'tasmota.0';
		stub.log = { debug: () => {}, info: () => {}, warn: () => {} };

		stub.createdObjects = {};   // id → common block
		stub.setStates = {};        // id → val

		stub.setObjectNotExistsAsync = async (id, obj) => {
			if (!stub.createdObjects[id]) {
				stub.createdObjects[id] = obj.common || {};
			}
		};
		stub.setStateAsync = async (id, val) => { stub.setStates[id] = val; };

		stub.getTopicPrefixes = () => {
			return (stub.config.brokerTopicPrefix || '').split(',').map(p => p.trim()).filter(Boolean);
		};
		stub.sanitizeId = input => input.replace(/[^A-Za-z0-9\-_]/g, '_');
		stub.parseScalar = Tasmota.prototype.parseScalar;
		stub.guessStateRole = Tasmota.prototype.guessStateRole;
		stub.guessStateType = Tasmota.prototype.guessStateType;

		stub.ensureObject = Tasmota.prototype.ensureObject.bind(stub);
		stub.setStateAsAck = Tasmota.prototype.setStateAsAck.bind(stub);
		stub.flattenAndStore = Tasmota.prototype.flattenAndStore.bind(stub);
		stub.storeStructuredState = Tasmota.prototype.storeStructuredState.bind(stub);
		stub.processStructuredMessage = Tasmota.prototype.processStructuredMessage.bind(stub);
		// Suppress auto-query (no MQTT client in tests)
		stub._checkAndAutoQuery = async () => {};

		return stub;
	}

	it('creates a flat POWER state from tele/STATE in structured mode', async () => {
		const stub = makeStructuredStub();
		await stub.processMqttMessage('tele/mydevice/STATE', '{"POWER":"ON"}');
		expect(stub.setStates['mydevice.POWER']).to.exist;
		expect(stub.setStates['mydevice.POWER'].val).to.equal(true);
	});

	it('uses role switch.power and type boolean for POWER state', async () => {
		const stub = makeStructuredStub();
		await stub.processMqttMessage('tele/mydevice/STATE', '{"POWER":"ON"}');
		const common = stub.createdObjects['mydevice.POWER'];
		expect(common).to.exist;
		expect(common.role).to.equal('switch.power');
		expect(common.type).to.equal('boolean');
	});

	it('flattens nested Wifi object from tele/STATE', async () => {
		const stub = makeStructuredStub();
		const payload = JSON.stringify({ POWER: 'ON', Wifi: { RSSI: 75, SSId: 'TestNet' } });
		await stub.processMqttMessage('tele/mydevice/STATE', payload);
		expect(stub.setStates['mydevice.Wifi_RSSI']).to.exist;
		expect(stub.setStates['mydevice.Wifi_RSSI'].val).to.equal(75);
		expect(stub.setStates['mydevice.Wifi_SSId']).to.exist;
		expect(stub.setStates['mydevice.Wifi_SSId'].val).to.equal('TestNet');
	});

	it('assigns value.rssi role to Wifi_RSSI', async () => {
		const stub = makeStructuredStub();
		await stub.processMqttMessage('tele/mydevice/STATE', JSON.stringify({ Wifi: { RSSI: 90 } }));
		expect(stub.createdObjects['mydevice.Wifi_RSSI'].role).to.equal('value.rssi');
	});

	it('stores sensor sub-objects with sensor prefix from tele/SENSOR', async () => {
		const stub = makeStructuredStub();
		const payload = JSON.stringify({ DS18B20: { Temperature: 22.5, Id: 'ABCD' } });
		await stub.processMqttMessage('tele/mydevice/SENSOR', payload);
		expect(stub.setStates['mydevice.DS18B20_Temperature']).to.exist;
		expect(stub.setStates['mydevice.DS18B20_Temperature'].val).to.equal(22.5);
	});

	it('assigns value.temperature role to sensor Temperature', async () => {
		const stub = makeStructuredStub();
		await stub.processMqttMessage('tele/mydevice/SENSOR', JSON.stringify({ BME280: { Temperature: 20.0 } }));
		expect(stub.createdObjects['mydevice.BME280_Temperature'].role).to.equal('value.temperature');
	});

	it('stores ENERGY sub-object with ENERGY_ prefix from tele/SENSOR', async () => {
		const stub = makeStructuredStub();
		const payload = JSON.stringify({ ENERGY: { Voltage: 230, Current: 1.5, Power: 345, Today: 0.5 } });
		await stub.processMqttMessage('tele/mydevice/SENSOR', payload);
		expect(stub.setStates['mydevice.ENERGY_Voltage']).to.exist;
		expect(stub.setStates['mydevice.ENERGY_Voltage'].val).to.equal(230);
		expect(stub.setStates['mydevice.ENERGY_Power']).to.exist;
		expect(stub.setStates['mydevice.ENERGY_Power'].val).to.equal(345);
	});

	it('assigns value.voltage role and V unit to ENERGY_Voltage', async () => {
		const stub = makeStructuredStub();
		await stub.processMqttMessage('tele/mydevice/SENSOR', JSON.stringify({ ENERGY: { Voltage: 230 } }));
		const common = stub.createdObjects['mydevice.ENERGY_Voltage'];
		expect(common.role).to.equal('value.voltage');
		expect(common.unit).to.equal('V');
	});

	it('ignores cmnd messages in structured mode', async () => {
		const stub = makeStructuredStub();
		await stub.processMqttMessage('cmnd/mydevice/POWER', 'ON');
		expect(Object.keys(stub.setStates)).to.have.lengthOf(0);
	});

	it('processes tele STATE in structured mode even without storeTeleData', async () => {
		const stub = makeStructuredStub({ storeTeleData: false });
		await stub.processMqttMessage('tele/mydevice/STATE', '{"POWER":"OFF"}');
		expect(stub.setStates['mydevice.POWER']).to.exist;
	});

	it('unwraps StatusSTS wrapper and processes as STATE', async () => {
		const stub = makeStructuredStub();
		const payload = JSON.stringify({ StatusSTS: { POWER: 'ON', Dimmer: 50 } });
		await stub.processMqttMessage('stat/mydevice/STATUS11', payload);
		expect(stub.setStates['mydevice.POWER']).to.exist;
		expect(stub.setStates['mydevice.POWER'].val).to.equal(true);
		expect(stub.setStates['mydevice.Dimmer']).to.exist;
		expect(stub.setStates['mydevice.Dimmer'].val).to.equal(50);
	});

	it('stores StatusFWR wrapper flat under StatusFWR_ prefix', async () => {
		const stub = makeStructuredStub();
		const payload = JSON.stringify({ StatusFWR: { Version: '12.0.2', Hardware: 'ESP8266EX' } });
		await stub.processMqttMessage('stat/mydevice/STATUS2', payload);
		expect(stub.setStates['mydevice.StatusFWR_Version']).to.exist;
		expect(stub.setStates['mydevice.StatusFWR_Version'].val).to.equal('12.0.2');
	});
});
