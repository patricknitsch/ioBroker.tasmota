# ioBroker.tasmota

[![NPM version](https://img.shields.io/npm/v/iobroker.tasmota.svg)](https://www.npmjs.com/package/iobroker.tasmota)
[![Downloads](https://img.shields.io/npm/dm/iobroker.tasmota.svg)](https://www.npmjs.com/package/iobroker.tasmota)
![Number of Installations](https://iobroker.live/badges/tasmota-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/tasmota-stable.svg)

## Overview

This adapter integrates Tasmota devices via MQTT and stores discovered data in structured ioBroker folders:

- `info` (device metadata, online state, version, IP, uptime, MQTT data)
- `wifi` (RSSI, SSID, BSSID, channel, signal)
- `sensors` (energy and sensor values)
- `controls` (writable commands like POWER, Dimmer, Switch, Shutter)
- `raw` (everything that cannot be classified)

The adapter discovers devices and datapoints automatically and actively requests management snapshots (`STATUS 0`, `STATE`, `SENSOR`) for new devices and once after adapter restart.

## Configuration highlights

- Client or server mode
- Multiple topic prefixes (comma separated)
- Topic structure (`device-first` / `prefix-first`)
- **Clean all folders** option in config (maintenance page)
- If required client configuration is missing, the adapter logs once: **"Konfiguration fehlt."**

## Documentation

- [English docs](docs/en/README.md)
- [Deutsche Doku](docs/de/README.md)

## Changelog

### 0.0.3 (2026-03-24)

- (patricknitsch) Add support for multiple comma-separated topic prefixes
- (patricknitsch) Add separate English and German documentation in docs/
- (patricknitsch) Update README with documentation links

### 0.0.2 (2026-03-24)

- (patricknitsch) Update README with device documentation
- (patricknitsch) Add admin/tab.html device overview panel

### 0.0.1 (2026-03-24)

- (patricknitsch) initial release

## License

MIT License
