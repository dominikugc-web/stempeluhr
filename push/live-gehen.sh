#!/bin/bash
# Dayliner Pro live schalten. Fragt den Stripe-Live-Geheimschlüssel unsichtbar ab, legt Produkt, Preise und die Seite
# „Abo verwalten“ in Stripe an, speichert den Schlüssel als Cloudflare-Geheimnis und lädt den Abo-Server hoch.
# Der Schlüssel landet in keiner Datei. Start: bash push/live-gehen.sh
set -e
cd "$(dirname "$0")"
echo
echo "Gebraucht wird der Stripe-Geheimschlüssel: lange Zeichenkette ohne Punkte, beginnt mit sk_live_."
echo "Einfügen mit Cmd + V (man sieht dabei nichts), dann Enter."
for i in 1 2 3; do
  read -r -s -p "Schlüssel: " KEY; echo
  KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
  # Doppelt eingefügt (man sieht beim Einfügen nichts)? Dann die Hälfte nehmen.
  h=$(( ${#KEY} / 2 )); if [ ${#KEY} -gt 60 ] && [ $(( ${#KEY} % 2 )) -eq 0 ] && [ "${KEY:0:$h}" = "${KEY:$h}" ]; then KEY="${KEY:0:$h}"; echo "(War doppelt eingefügt, ich nehme ihn einmal.)"; fi
  [ -n "$KEY" ] && echo "Angekommen: ${#KEY} Zeichen."
  case "$KEY" in
    *•*) echo "Das ist nur die verdeckte Anzeige mit Punkten. Den vollen Schlüssel zeigt Stripe nur direkt nach „Geheimschlüssel erstellen“.";;
    sk_live_*|rk_live_*) break;;
    pk_live_*) echo "Das ist der veröffentlichbare Schlüssel (pk_live_). Gebraucht wird der Geheimschlüssel (sk_live_).";;
    "") echo "Es kam nichts an. Erst in dieses Fenster klicken, Cmd + V, dann Enter.";;
    *) echo "Der eingefügte Text beginnt mit „${KEY:0:8}“, nicht mit sk_live_.";;
  esac
  KEY=""
  [ "$i" -lt 3 ] && echo "Nochmal versuchen:"
done
[ -n "$KEY" ] || { echo "Abgebrochen, nichts geändert."; exit 1; }
curl -s -o /dev/null -w '%{http_code}' -u "$KEY:" "https://api.stripe.com/v1/prices?limit=1" | grep -q 200 || { echo "Stripe sagt: Schlüssel ungültig. Bitte bei Stripe einen neuen Geheimschlüssel erstellen und genau einmal einfügen. Nichts geändert."; exit 1; }
echo "Schlüssel gültig."
echo "1/3 Produkt, Preise und Abo-Seite in Stripe anlegen …"
STRIPE_KEY="$KEY" node stripe-einrichten.mjs
echo "2/3 Schlüssel geschützt im Cloudflare-Server speichern …"
printf '%s' "$KEY" | npx wrangler secret put STRIPE_KEY
unset KEY
echo "3/3 Abo-Server hochladen …"
npx wrangler deploy
echo
echo "FERTIG: Dayliner Pro ist bei Stripe und Cloudflare live."
