#!/bin/bash
# Resend-Schlüssel für die Kündigungsbestätigungen geschützt im Cloudflare-Server speichern und den Server hochladen.
# Der Schlüssel landet in keiner Datei. Start: bash push/mail-einrichten.sh
set -e
cd "$(dirname "$0")"
echo
echo "Gebraucht wird der Resend-API-Schlüssel: beginnt mit re_."
echo "Einfügen mit Cmd + V (man sieht dabei nichts), dann Enter."
for i in 1 2 3; do
  read -r -s -p "Schlüssel: " KEY; echo
  KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
  h=$(( ${#KEY} / 2 )); if [ ${#KEY} -gt 30 ] && [ $(( ${#KEY} % 2 )) -eq 0 ] && [ "${KEY:0:$h}" = "${KEY:$h}" ]; then KEY="${KEY:0:$h}"; echo "(War doppelt eingefügt, ich nehme ihn einmal.)"; fi
  case "$KEY" in
    re_*) echo "Angekommen: ${#KEY} Zeichen."; break;;
    "") echo "Es kam nichts an. Erst in dieses Fenster klicken, Cmd + V, dann Enter.";;
    *) echo "Der eingefügte Text beginnt mit „${KEY:0:3}“, nicht mit re_.";;
  esac
  KEY=""
  [ "$i" -lt 3 ] && echo "Nochmal versuchen:"
done
[ -n "$KEY" ] || { echo "Abgebrochen, nichts geändert."; exit 1; }
echo "1/2 Schlüssel geschützt im Cloudflare-Server speichern …"
printf '%s' "$KEY" | npx wrangler secret put RESEND_KEY
unset KEY
echo "2/2 Server hochladen …"
npx wrangler deploy
echo
echo "FERTIG: Kündigungsbestätigungen gehen jetzt automatisch per E-Mail raus."
