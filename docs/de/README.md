# ioBroker Tasmota Adapter — Dokumentation

## Überblick

Der Adapter verarbeitet Tasmota-MQTT-Nachrichten, erkennt Geräte automatisch und legt strukturierte ioBroker-Datenpunkte an.

Geräteordner:

- `info`: Hostname, IP, MAC, Uptime, Version, Online, MQTT-Zähler
- `wifi`: RSSI, Signal, SSID, BSSID, Kanal
- `sensors`: ENERGY- und Sensorwerte (Temperatur, Luftfeuchte, Spannung, Strom, Leistung, CO2, ...)
- `controls`: schreibbare Befehle (POWER*, Dimmer*, Switch*, Shutter*, ...)
- `raw`: alle nicht zuordenbaren Werte

## Discovery-Verhalten

- Neue Geräte werden automatisch aus eingehenden Topics erkannt.
- Für neue Geräte fordert der Adapter aktiv Daten über Tasmota-Management-Befehle an:
  - `STATUS 0`
  - `STATE`
  - `SENSOR`
- Nach Adapter-Neustart werden Snapshots für bereits bekannte Geräte erneut angefordert.
- Neue Datenpunkte werden automatisch übernommen und per Heuristik einem Ordner zugeordnet.

## Konfigurationsseiten

Die JSON-Konfiguration ist in Tabs aufgeteilt:

1. **Verbindung**
   - Server-/Client-Einstellungen
   - TLS und Authentifizierung
2. **Topics**
   - Topic-Präfix und Topic-Struktur
   - Erweiterte MQTT-Client-Optionen
3. **Wartung**
   - Checkbox zum Bereinigen aller erkannten Geräteordner beim nächsten Start

Fehlt die notwendige Client-Konfiguration (Broker-Host/Topic-Präfix), wird der Start abgebrochen und einmalig geloggt: `Konfiguration fehlt.`

## MQTT-Topic-Strukturen

Unterstützt werden:

- `device-first`: `{Gerät}/{Präfix}/{Befehl}`
- `prefix-first`: `{Präfix}/{Gerät}/{Befehl}`

## Rückkanal für Befehle

Schreibbare Zustände unter `controls` werden als `cmnd/<gerät>/<befehl>` veröffentlicht (oder `<gerät>/cmnd/<befehl>` bei device-first).
