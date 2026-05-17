'use strict';

/**
 * @param {string} topic
 * @param {string[]} topicPrefixes
 * @param {string} structure
 * @returns {{deviceId: string; prefix: string | null; commandParts: string[]} | null}
 */
function parseIncomingTopic(topic, topicPrefixes, structure) {
	let effectiveTopic = topic;
	for (const topicPrefix of topicPrefixes) {
		if (topic.startsWith(`${topicPrefix}/`)) {
			effectiveTopic = topic.slice(topicPrefix.length + 1);
			break;
		}
	}

	const parts = effectiveTopic.split('/').filter(Boolean);
	if (parts.length < 2) {
		return null;
	}

	const knownPrefixes = ['tele', 'cmnd', 'stat'];
	let prefix = null;
	let deviceId = '';
	let commandParts = [];

	if (structure === 'device-first') {
		deviceId = parts[0];
		prefix = knownPrefixes.includes(parts[1]) ? parts[1] : null;
		commandParts = prefix ? parts.slice(2) : parts.slice(1);
	} else if (structure === 'prefix-first') {
		prefix = knownPrefixes.includes(parts[0]) ? parts[0] : null;
		deviceId = prefix ? parts[1] : parts[0];
		commandParts = prefix ? parts.slice(2) : parts.slice(1);
	} else if (knownPrefixes.includes(parts[0])) {
		prefix = parts[0];
		deviceId = parts[1];
		commandParts = parts.slice(2);
	} else if (parts.length >= 3 && knownPrefixes.includes(parts[1])) {
		deviceId = parts[0];
		prefix = parts[1];
		commandParts = parts.slice(2);
	} else {
		deviceId = parts[0];
		commandParts = parts.slice(1);
	}

	if (!deviceId) {
		return null;
	}

	return {
		deviceId,
		prefix,
		commandParts,
	};
}

module.exports = {
	parseIncomingTopic,
};
