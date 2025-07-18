# RIBS Tracker PWA

Deze repository bevat een voorbeeldimplementatie van een Progressive Web App (PWA) waarmee ruwheidsmetingen van het fietspad worden gedaan. De app verzamelt sensordata en locatiegegevens, verwerkt deze lokaal en uploadt de resultaten naar een Node.js backend die gekoppeld kan worden aan Azure SQL.

## Structuur

- **frontend/** – PWA-bestanden (HTML, CSS, JavaScript, manifest, service worker)
- **backend/** – Node.js + Express API voor het ontvangen en opslaan van meetdata

## Logging Systeem

Het systeem bevat een uitgebreid logging mechanisme:

- **Centralized Logging**: Alle logs worden opgeslagen in de `logs` tabel in de database
- **Multiple Sources**: Logs van server, API, database, frontend en errors worden allemaal vastgelegd
- **Log Levels**: INFO, WARN, ERROR, DEBUG
- **Frontend Integration**: Frontend errors en events worden automatisch naar de backend gestuurd
- **Real-time Display**: Logs worden real-time weergegeven in de frontend interface

### Log API Endpoints

- `GET /api/logs` - Haal logs op (met filtering op level, source, limit)
- `POST /api/logs` - Verstuur frontend logs naar database
- `GET /api/logs/stats` - Krijg statistieken over logs

### Database Schema

De `logs` tabel wordt automatisch aangemaakt bij startup en bevat:
- `id` (INT, auto-increment, primary key)
- `message` (NVARCHAR(MAX), het log bericht)
- `log_time` (DATETIME, timestamp)
- `level` (NVARCHAR(20), log level - INFO/WARN/ERROR/DEBUG)
- `source` (NVARCHAR(100), bron van de log)

Daarnaast wordt de tabel `RIBS_Data` gebruikt om meetgegevens op te slaan:

| kolom           | type           | info |
|-----------------|----------------|------|
| `id`            | INT IDENTITY(1,1) PRIMARY KEY | uniek id |
| `timestamp`     | NVARCHAR(50) NOT NULL | tijdstip van meting |
| `latitude`      | FLOAT NOT NULL | breedtegraad |
| `longitude`     | FLOAT NOT NULL | lengtegraad |
| `speed`         | FLOAT NOT NULL | snelheid |
| `direction`     | FLOAT NOT NULL | koers |
| `roughness`     | FLOAT NOT NULL | ruwheidswaarde |
| `distance_m`    | FLOAT NOT NULL | afgelegde afstand |
| `device_id`     | NVARCHAR(100) NOT NULL | id van het apparaat |
| `ip_address`    | NVARCHAR(45) NOT NULL | IP-adres |
| `z_values`      | NVARCHAR(MAX) NOT NULL | ruwe sensorwaarden |
| `avg_speed`     | FLOAT NOT NULL | gemiddelde snelheid |
| `interval_s`    | FLOAT NOT NULL | meetinterval in seconden |
| `algorithm_version` | NVARCHAR(50) NOT NULL | versie van algoritme |
| `vdv`           | FLOAT NULL | Vibration Dose Value (4e macht methode) |
| `crest_factor`  | FLOAT NULL | Piek-naar-RMS verhouding |

## Database Schema Management

Het systeem bevat automatisch schema-beheer en migratie ondersteuning:

- **Huidige Schema Versie**: 1.2.0
- **Automatische Migraties**: Schema wordt automatisch bijgewerkt bij opstarten
- **Versie Tracking**: `schema_version` tabel houdt alle wijzigingen bij
- **Backwards Compatibility**: Ondersteunt upgrades van oudere versies

### Schema Versie Geschiedenis

- **v1.0.0**: Basis tabellen (devices, logs, RIBS_Data)
- **v1.1.0**: Performance indexes toegevoegd
- **v1.2.0**: VDV en crest_factor metingen toegevoegd

Voor volledige schema documentatie, zie `backend/SCHEMA.md`.

## Installatie Backend

```bash
cd backend
npm install
cp .env.example .env # pas waardes aan
node index.js
```

## Capacitor

Om de PWA te bundelen in een Android-app kan Capacitor gebruikt worden:

```bash
npx cap init rci nl
npx cap add android
npx cap copy android
```

Dit is buiten de scope van deze repository maar de frontend is compatibel met Capacitor.
