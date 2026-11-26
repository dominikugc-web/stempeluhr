#!/bin/bash
# Dienstkonto für den Push-Dienst einrichten: prüft die heruntergeladene JSON-Schlüsseldatei, testet sie bei Google,
# speichert sie als Cloudflare-Geheimnis FB_SA und löscht danach auf Wunsch die Datei. Der Schlüssel wird nirgends angezeigt.
# Start: bash push/dienstkonto-einrichten.sh   (nimmt die neueste stempeluhr-6faae-*.json aus Downloads, sonst Datei ins Fenster ziehen)
set -e
cd "$(dirname "$0")"
echo
# Neueste Schlüsseldatei im Download-Ordner nehmen (Google nennt sie stempeluhr-6faae-<id>.json), sonst nach dem Pfad fragen
F="$(ls -t ~/Downloads/stempeluhr-6faae-*.json 2>/dev/null | head -1)"
if [ -n "$F" ]; then
  read -r -p "Gefunden: $(basename "$F"). Diese Datei nehmen? (j/n) " J
  [ "$J" = "j" ] || F=""
fi
if [ -z "$F" ]; then
  echo "Zieh die JSON-Datei (das Symbol, nicht den Inhalt) in dieses Fenster und drück Enter."
  read -r -p "Datei: " F
  if [ "${F:0:1}" = "{" ]; then   # Inhalt statt Pfad eingefügt: Rest schlucken, damit die Shell ihn nicht ausführt
    while read -r -t 1 _; do :; done
    echo "Das war der Inhalt der Datei, nicht der Pfad. Bitte die Datei im Finder anfassen und ins Fenster ziehen. Nichts geändert."; exit 1
  fi
  F="${F%\"}"; F="${F#\"}"; F="${F%\'}"; F="${F#\'}"; F="${F%% }"; F="${F//\\ / }"
fi
[ -f "$F" ] || { echo "Die Datei gibt es nicht: $F. Nichts geändert."; exit 1; }
# Prüfen: richtiges Projekt, Dienstkonto-Schlüssel, Token bei Google holen, eine Firma lesen (nur Statuscode)
node --input-type=module - "$F" <<'EOF'
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
const sa = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const fail = m => { console.log(m + ' Nichts geändert.'); process.exit(1); };
if (sa.type !== 'service_account' || !sa.private_key || !sa.client_email) fail('Das ist keine Schlüsseldatei eines Dienstkontos.');
if (sa.project_id !== 'stempeluhr-6faae') fail(`Der Schlüssel gehört zum Projekt „${sa.project_id}“, nicht zu stempeluhr-6faae.`);
if (sa.client_email.startsWith('firebase-adminsdk')) console.log('Hinweis: Das ist das Firebase-Admin-Konto mit sehr vielen Rechten. Besser ein eigenes Konto „dayliner-worker“ nur mit „Cloud Datastore-Nutzer“.');
const now = Math.floor(Date.now() / 1000), b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const msg = b({ alg: 'RS256', typ: 'JWT' }) + '.' + b({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 });
const jwt = msg + '.' + createSign('RSA-SHA256').update(msg).sign(sa.private_key, 'base64url');
const t = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) })).json();
if (!t.access_token) fail('Google lehnt den Schlüssel ab: ' + (t.error_description || t.error));
const r = await fetch('https://firestore.googleapis.com/v1/projects/stempeluhr-6faae/databases/(default)/documents/companies?pageSize=1&mask.fieldPaths=owner', { headers: { Authorization: 'Bearer ' + t.access_token } });
if (!r.ok) fail(`Das Dienstkonto darf die Datenbank nicht lesen (${r.status}). Rolle „Cloud Datastore-Nutzer“ vergeben?`);
console.log(`Schlüssel gültig: ${sa.client_email}, Zugriff auf die Datenbank klappt.`);
EOF
echo "Schlüssel geschützt im Cloudflare-Server speichern …"
npx wrangler secret put FB_SA < "$F"
echo
read -r -p "Die Datei enthält den privaten Schlüssel. Jetzt vom Mac löschen? (j/n) " J
if [ "$J" = "j" ]; then rm "$F"; echo "Datei gelöscht."; else echo "Datei bleibt liegen. Bitte nicht weitergeben und später löschen."; fi
echo
echo "FERTIG: Der Push-Dienst hat jetzt das Dienstkonto."
