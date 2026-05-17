'use strict';

// What Tasmota sends on restart (replicated via commands after adapter restart):
// STATUS 1 → Module, Version, Topic (≈ INFO1)
// STATUS 5 → IP address, MAC (≈ INFO2)
// STATE    → current relay/switch state (≈ STATE/RESULT on restart)
const DISCOVERY_COMMANDS = [
	{ command: 'STATUS', payload: '1' },
	{ command: 'STATUS', payload: '5' },
	{ command: 'STATE', payload: '' },
];

module.exports = {
	DISCOVERY_COMMANDS,
};
