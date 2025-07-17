# RCI NL PWA

Deze repository bevat een voorbeeldimplementatie van een Progressive Web App (PWA) waarmee ruwheidsmetingen van het fietspad worden gedaan. De app verzamelt sensordata en locatiegegevens, verwerkt deze lokaal en uploadt de resultaten naar een Node.js backend die gekoppeld kan worden aan Azure SQL.

## Structuur

- **frontend/** – PWA-bestanden (HTML, CSS, JavaScript, manifest, service worker)
- **backend/** – Node.js + Express API voor het ontvangen en opslaan van meetdata

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
