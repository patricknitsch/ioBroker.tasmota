'use strict';

const { expect } = require('chai');
const { COMMAND_DEFINITIONS, detectDeviceCapabilities, getRequiredCommands } = require('./commands');

describe('lib/commands', () => {
	describe('COMMAND_DEFINITIONS', () => {
		it('exports an object', () => {
			expect(COMMAND_DEFINITIONS).to.be.an('object');
		});

		it('contains Power command with correct ioBroker common', () => {
			const p = COMMAND_DEFINITIONS.Power;
			expect(p).to.exist;
			expect(p.type).to.equal('boolean');
			expect(p.role).to.equal('switch.power');
			expect(p.read).to.equal(true);
			expect(p.write).to.equal(true);
		});

		it('contains Dimmer command with correct ioBroker common', () => {
			const d = COMMAND_DEFINITIONS.Dimmer;
			expect(d).to.exist;
			expect(d.type).to.equal('number');
			expect(d.role).to.equal('level.dimmer');
			expect(d.min).to.equal(0);
			expect(d.max).to.equal(100);
			expect(d.unit).to.equal('%');
		});

		it('contains CT command (color temperature)', () => {
			const ct = COMMAND_DEFINITIONS.CT;
			expect(ct).to.exist;
			expect(ct.type).to.equal('number');
			expect(ct.role).to.equal('level.color.temperature');
			expect(ct.min).to.equal(153);
			expect(ct.max).to.equal(500);
		});

		it('contains ShutterOpen1 command with button.open.blind role', () => {
			const s = COMMAND_DEFINITIONS.ShutterOpen1;
			expect(s).to.exist;
			expect(s.role).to.equal('button.open.blind');
			expect(s.write).to.equal(true);
			expect(s.read).to.equal(false);
		});

		it('contains ShutterClose1 command with button.close.blind role', () => {
			const s = COMMAND_DEFINITIONS.ShutterClose1;
			expect(s).to.exist;
			expect(s.role).to.equal('button.close.blind');
		});

		it('contains ShutterStop1 command with button.stop.blind role', () => {
			const s = COMMAND_DEFINITIONS.ShutterStop1;
			expect(s).to.exist;
			expect(s.role).to.equal('button.stop.blind');
		});

		it('contains ShutterPosition1 with value.blind role and 0–100 range', () => {
			const sp = COMMAND_DEFINITIONS.ShutterPosition1;
			expect(sp).to.exist;
			expect(sp.role).to.equal('value.blind');
			expect(sp.min).to.equal(0);
			expect(sp.max).to.equal(100);
		});

		it('contains ShutterTilt1 with value.tilt role and -90–90 range', () => {
			const st = COMMAND_DEFINITIONS.ShutterTilt1;
			expect(st).to.exist;
			expect(st.role).to.equal('value.tilt');
			expect(st.min).to.equal(-90);
			expect(st.max).to.equal(90);
		});

		it('contains FanSpeed command with value.speed.fan role', () => {
			const f = COMMAND_DEFINITIONS.FanSpeed;
			expect(f).to.exist;
			expect(f.role).to.equal('value.speed.fan');
			expect(f.min).to.equal(0);
			expect(f.max).to.equal(3);
		});

		it('contains commands for shutters 1–4', () => {
			for (let i = 1; i <= 4; i++) {
				expect(COMMAND_DEFINITIONS[`ShutterOpen${i}`], `ShutterOpen${i}`).to.exist;
				expect(COMMAND_DEFINITIONS[`ShutterClose${i}`], `ShutterClose${i}`).to.exist;
				expect(COMMAND_DEFINITIONS[`ShutterStop${i}`], `ShutterStop${i}`).to.exist;
				expect(COMMAND_DEFINITIONS[`ShutterPosition${i}`], `ShutterPosition${i}`).to.exist;
				expect(COMMAND_DEFINITIONS[`ShutterTilt${i}`], `ShutterTilt${i}`).to.exist;
			}
		});
	});

	// ─── detectDeviceCapabilities ────────────────────────────────────────────

	describe('detectDeviceCapabilities', () => {
		it('detects a single-relay power device', () => {
			const caps = detectDeviceCapabilities(['cmnd.POWER', 'stat.RESULT.POWER', 'tele.STATE.POWER']);
			expect(caps.power).to.equal(true);
			expect(caps.powerIndexes).to.deep.equal([]);
			expect(caps.shutters).to.equal(0);
		});

		it('detects multi-relay device (Power1, Power2)', () => {
			const caps = detectDeviceCapabilities(['tele.STATE.POWER1', 'tele.STATE.POWER2', 'stat.RESULT.POWER1']);
			expect(caps.power).to.equal(true);
			expect(caps.powerIndexes).to.include(1);
			expect(caps.powerIndexes).to.include(2);
		});

		it('detects dimmer (light) device', () => {
			const caps = detectDeviceCapabilities([
				'tele.STATE.POWER',
				'tele.STATE.Dimmer',
				'tele.STATE.Color',
				'tele.STATE.CT',
			]);
			expect(caps.dimmer).to.equal(true);
			expect(caps.color).to.equal(true);
			expect(caps.ct).to.equal(true);
		});

		it('detects shutter device with 2 shutters', () => {
			const caps = detectDeviceCapabilities([
				'tele.STATE.Shutter1.Position',
				'tele.STATE.Shutter1.Direction',
				'tele.STATE.Shutter2.Position',
				'tele.STATE.Shutter2.Direction',
			]);
			expect(caps.shutters).to.equal(2);
		});

		it('detects fan device', () => {
			const caps = detectDeviceCapabilities(['tele.STATE.FanSpeed']);
			expect(caps.fan).to.equal(true);
		});

		it('returns no capabilities for unknown states', () => {
			const caps = detectDeviceCapabilities(['tele.STATE.Time', 'tele.STATE.Uptime']);
			expect(caps.power).to.equal(false);
			expect(caps.dimmer).to.equal(false);
			expect(caps.shutters).to.equal(0);
			expect(caps.fan).to.equal(false);
		});
	});

	// ─── getRequiredCommands ─────────────────────────────────────────────────

	describe('getRequiredCommands', () => {
		it('returns Power for single-relay device', () => {
			const caps = detectDeviceCapabilities(['tele.STATE.POWER']);
			const cmds = getRequiredCommands(caps);
			expect(cmds).to.include('Power');
		});

		it('returns Power1/Power2 for multi-relay device', () => {
			const caps = detectDeviceCapabilities(['tele.STATE.POWER1', 'tele.STATE.POWER2']);
			const cmds = getRequiredCommands(caps);
			expect(cmds).to.include('Power1');
			expect(cmds).to.include('Power2');
			expect(cmds).to.not.include('Power');
		});

		it('returns Dimmer, Fade, Speed for dimmer device', () => {
			const caps = detectDeviceCapabilities(['tele.STATE.Dimmer']);
			const cmds = getRequiredCommands(caps);
			expect(cmds).to.include('Dimmer');
			expect(cmds).to.include('Fade');
			expect(cmds).to.include('Speed');
			// No per-channel dimmers when only generic Dimmer is detected
			expect(cmds).to.not.include('Dimmer1');
			expect(cmds).to.not.include('Dimmer2');
		});

		it('returns Dimmer1/Dimmer2 only when those channels are actually detected', () => {
			const caps = detectDeviceCapabilities(['tele.STATE.Dimmer1', 'tele.STATE.Dimmer2']);
			const cmds = getRequiredCommands(caps);
			expect(cmds).to.include('Dimmer1');
			expect(cmds).to.include('Dimmer2');
		});

		it('returns Color and CT for full light device', () => {
			const caps = detectDeviceCapabilities(['tele.STATE.Dimmer', 'tele.STATE.Color', 'tele.STATE.CT']);
			const cmds = getRequiredCommands(caps);
			expect(cmds).to.include('Color');
			expect(cmds).to.include('CT');
		});

		it('returns all 5 shutter commands for each detected shutter', () => {
			const caps = detectDeviceCapabilities(['tele.STATE.Shutter1.Position', 'tele.STATE.Shutter2.Position']);
			const cmds = getRequiredCommands(caps);
			for (let i = 1; i <= 2; i++) {
				expect(cmds, `ShutterOpen${i}`).to.include(`ShutterOpen${i}`);
				expect(cmds, `ShutterClose${i}`).to.include(`ShutterClose${i}`);
				expect(cmds, `ShutterStop${i}`).to.include(`ShutterStop${i}`);
				expect(cmds, `ShutterPosition${i}`).to.include(`ShutterPosition${i}`);
				expect(cmds, `ShutterTilt${i}`).to.include(`ShutterTilt${i}`);
			}
		});

		it('returns FanSpeed for fan device', () => {
			const caps = detectDeviceCapabilities(['tele.STATE.FanSpeed']);
			const cmds = getRequiredCommands(caps);
			expect(cmds).to.include('FanSpeed');
		});

		it('returns empty array when no capabilities detected', () => {
			const caps = detectDeviceCapabilities(['tele.STATE.Time']);
			const cmds = getRequiredCommands(caps);
			expect(cmds).to.have.lengthOf(0);
		});

		it('all returned command names exist in COMMAND_DEFINITIONS', () => {
			const caps = detectDeviceCapabilities([
				'tele.STATE.POWER',
				'tele.STATE.Dimmer',
				'tele.STATE.Color',
				'tele.STATE.CT',
				'tele.STATE.Shutter1.Position',
				'tele.STATE.FanSpeed',
			]);
			const cmds = getRequiredCommands(caps);
			for (const cmd of cmds) {
				expect(COMMAND_DEFINITIONS[cmd], `COMMAND_DEFINITIONS["${cmd}"]`).to.exist;
			}
		});
	});
});
