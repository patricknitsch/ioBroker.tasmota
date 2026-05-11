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
});
