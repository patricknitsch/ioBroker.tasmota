'use strict';

/**
 * @param {string} input
 * @returns {string}
 */
function sanitizeId(input) {
return String(input).replace(/[^A-Za-z0-9\-_]/g, '_');
}

/**
 * @param {unknown} value
 * @returns {boolean | number | string}
 */
function parseScalar(value) {
if (typeof value === 'boolean' || typeof value === 'number') {
return value;
}

if (value === null || value === undefined) {
return '';
}

const str = String(value);
const upper = str.trim().toUpperCase();

if (['ON', 'TRUE', 'ONLINE'].includes(upper)) {
return true;
}
if (['OFF', 'FALSE', 'OFFLINE'].includes(upper)) {
return false;
}

const num = Number(str);
if (!Number.isNaN(num) && str.trim() !== '') {
return num;
}

return str;
}

/**
 * @param {unknown} value
 * @returns {'boolean' | 'number' | 'string'}
 */
function inferType(value) {
if (typeof value === 'boolean') {
return 'boolean';
}
if (typeof value === 'number') {
return 'number';
}

const parsed = parseScalar(value);
if (typeof parsed === 'boolean') {
return 'boolean';
}
if (typeof parsed === 'number') {
return 'number';
}
return 'string';
}

/**
 * @param {string} input
 * @returns {string}
 */
function normalizeToken(input) {
return String(input)
.toLowerCase()
.replace(/[^a-z0-9]/g, '');
}

module.exports = {
sanitizeId,
parseScalar,
inferType,
normalizeToken,
};
