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
