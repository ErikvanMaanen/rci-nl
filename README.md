# RCI NL PWA

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
