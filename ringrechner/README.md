# Ringrechner

Ein einfacher, für Mobilgeräte optimierter Ringrechner für das Bogenschießen. Die App läuft ohne zusätzliche Bibliotheken oder Build-Schritt direkt im Browser.

## Wertung

- **Ganze Ringe:** Treffer für die Ringe 0 bis 10 mit den Plus- und Minustasten erfassen. Die App zeigt Trefferzahl, Gesamtpunktzahl und Durchschnitt pro Schuss.
- **Zehntel:** Einzelne Schusswerte von 0,0 bis 10,9 eingeben oder mit den Schritt-Tasten anpassen. Die Schüsse erscheinen in Eingabereihenfolge; der letzte Schuss kann rückgängig gemacht werden.
- Die Modi haben getrennte Wertungen. Über **Zurücksetzen** wird die Wertung des gerade geöffneten Modus gelöscht.
- Unter **Einstellungen** lässt sich haptisches Feedback aktivieren oder deaktivieren, sofern das Gerät es unterstützt.

Wertungen und die Einstellung für haptisches Feedback werden im lokalen Speicher des Browsers auf diesem Gerät gespeichert.

## Lokal starten

Die Dateien können über einen lokalen Webserver bereitgestellt werden. Starte zum Beispiel im Ordner `ringrechner`:

```sh
python -m http.server 8000
```

Öffne danach <http://localhost:8000> im Browser. Ein Webserver wird benötigt, damit der Service Worker für den Offlinebetrieb registriert werden kann. Nach dem ersten erfolgreichen Laden kann die App offline verwendet werden. Auf unterstützten Geräten kann sie außerdem über den Browser zum Startbildschirm hinzugefügt werden.

## Dateien

- `index.html` – App-Struktur und Dialoge
- `app.js` – Wertungslogik, lokale Speicherung und Interaktionen
- `styles.css` – Darstellung für Desktop und Mobilgeräte
- `manifest.webmanifest` – Metadaten für die installierbare Web-App
- `sw.js` – Cache für den Offlinebetrieb
- `icons/`, `favicon.svg`, `favicon.png` – App- und Browser-Symbole
