# RadNavi Rur-Eifel

Sichere Fahrrad-Navigation für Düren, die Eifel, Aachen und Köln, als iPhone-Web-App (PWA).

## Funktionen
- **Rennrad / Mountainbike**: zwei Routing-Profile (Rennrad nur befestigte Wege, MTB auch Wald- und Feldwege, Trails nur bis Schwierigkeit S2)
- **Radweg-Prüfung**: Jeder Abschnitt der Route wird anhand seiner OpenStreetMap-Merkmale eingeordnet. Als „ausgewiesener Radweg“ zählt nur, was eindeutig so eingetragen ist:
  - `highway=cycleway` (eigenständiger Radweg)
  - `bicycle=designated` (blaues Radweg-Schild: Zeichen 237 / 240 / 241)
  - `bicycle_road=yes` (Fahrradstraße)
  - `cycleway=track` (baulich getrennter Radweg neben der Fahrbahn)

  Gehwege mit „Radfahrer frei“, Wirtschaftswege und Radfahrstreifen werden getrennt ausgewiesen. Abschnitte auf Straßen mit Autoverkehr erscheinen als Warnung. Ein Antippen der Linie zeigt die OSM-Merkmale des Abschnitts.
- **Sicher, aber möglichst direkt**: Ein Regler in den Einstellungen gewichtet Sicherheit gegen Umweg (Standard: „ausgewogen“).
- **Live-Navigation mit GPS und Sprachansagen** auf Deutsch, Warnung vor Straßenabschnitten, automatische Neuberechnung beim Verlassen der Route
- **Höhenprofil**, farbig nach Wegtyp
- **GPX-Export** (z. B. für Garmin oder Wahoo)

## Auf GitHub Pages veröffentlichen (ohne Programmierkenntnisse)
1. Auf https://github.com kostenlos registrieren bzw. anmelden.
2. Oben rechts **„+“ → „New repository“**, Name z. B. `radnavi`, **Public** wählen und **„Create repository“** klicken.
3. Auf der neuen Seite **„uploading an existing file“** anklicken.
4. Den **gesamten Inhalt** des Ordners `radnavi` (alle Dateien **und** die Ordner `icons` und `vendor`) in das Browserfenster ziehen und **„Commit changes“** klicken.
5. Im Repository **Settings → Pages**: unter „Branch“ `main` und `/ (root)` wählen und **Save** klicken.
6. Nach 1–2 Minuten ist die App erreichbar unter `https://<dein-name>.github.io/radnavi/`.

## Auf dem iPhone installieren
1. Die Adresse in **Safari** öffnen.
2. **Teilen-Symbol → „Zum Home-Bildschirm“**.
3. RadNavi vom Home-Bildschirm starten und die Ortung erlauben.

## Wichtige Hinweise
- Während der Navigation muss die App im Vordergrund und das Display an bleiben. Web-Apps können unter iOS im Hintergrund kein GPS nutzen. Die App verhindert das automatische Abschalten des Displays.
- Routing und Suche brauchen eine Internetverbindung. Bereits angesehene Kartenausschnitte werden zwischengespeichert.
- Die Radweg-Prüfung beruht auf den Daten von OpenStreetMap. Diese sind in der Region sehr gut gepflegt, ersetzen aber nicht den Blick auf die Beschilderung vor Ort.
- Dienste: Routing über BRouter (brouter.de), Suche über Photon (komoot), Karten von CyclOSM, OpenStreetMap und OpenTopoMap, alle kostenlos.
