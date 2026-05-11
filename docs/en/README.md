# ioBroker Tasmota Adapter — Documentation

## Overview

The adapter receives Tasmota MQTT messages, auto-discovers devices, and creates structured ioBroker states.

Device folders:

- `info`: hostname, ip, mac, uptime, version, online, MQTT counters
- `wifi`: RSSI, signal, SSID, BSSID, channel
- `sensors`: ENERGY and sensor values (temperature, humidity, voltage, current, power, CO2, etc.)
- `controls`: writable commands (POWER*, Dimmer*, Switch*, Shutter*, ...)
- `raw`: all unclassified values

## Discovery behavior

- New devices are discovered automatically from incoming topics.
- For each new device, the adapter actively requests data with Tasmota management commands:
  - `STATUS 0`
  - `STATE`
  - `SENSOR`
- After adapter restart, the adapter requests snapshots again for already known devices.
- New datapoints are accepted automatically and classified by best-match heuristics.

## Configuration pages

The JSON config is split into tabs:

1. **Connection**
   - server/client settings
   - TLS and authentication
2. **Topics**
   - topic prefix and topic structure
   - MQTT advanced client options
3. **Maintenance**
   - checkbox to clean all discovered device folders on next start

If required client config (broker host/topic prefix) is missing, adapter start is aborted with the one-time log message `Konfiguration fehlt.` (required wording from specification).

## MQTT topic structures

Supported FullTopic layouts:

- `device-first`: `{device}/{prefix}/{command}`
- `prefix-first`: `{prefix}/{device}/{command}`

## Command writeback

Writable states under `controls` are published back to `cmnd/<device>/<command>` (or `<device>/cmnd/<command>` in device-first mode).
