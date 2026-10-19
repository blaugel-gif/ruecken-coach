# Rücken-Coach

Web-App für tägliches Rücken- und Hüfttraining bei Skoliose: Live-Haltungsprüfung über die Handykamera (MediaPipe Pose, läuft komplett im Browser), Sprachansagen, drei Trainingsdauern (10 / 5 / 3 Minuten), täglich wechselnde Übungen passend zu deinen Hilfsmitteln, Dashboard und Dev-Modus.

> Keine medizinische Beratung. Bei starker Skoliose Übungen und asymmetrische Korrekturen mit Physiotherapie abstimmen.

## Einrichtung (einmalig, ca. 15 Minuten)

### 1. Datenspeicher bei Supabase
1. Auf <https://supabase.com> kostenlos registrieren → **New project** (Region z. B. *Frankfurt*), ein Datenbank-Passwort vergeben.
2. Im Projekt links **SQL Editor** → **New query** → den Inhalt von `supabase/schema.sql` einfügen → **Run**.
3. **Project Settings → API**: *Project URL* und den *anon / publishable key* kopieren. Dieser Schlüssel ist für Browser-Apps gedacht; die Daten schützt der Login zusammen mit den Row-Level-Security-Regeln aus dem Schema.

### 2. App veröffentlichen (GitHub Pages)
1. Auf GitHub ein **öffentliches** Repository anlegen, z. B. `ruecken-coach`.
2. Alle Dateien dieses Ordners hochladen (*Add file → Upload files*).
3. **Settings → Pages** → Source: *Deploy from a branch*, Branch `main`, Ordner `/ (root)` → Save.
4. Nach 1–2 Minuten läuft die App unter `https://<dein-name>.github.io/ruecken-coach/`.

Im Repository liegen keine Zugangsdaten. URL und Key gibst du einmalig in der App ein, sie bleiben nur in deinem Browser.

### 3. In der App
1. App am Handy öffnen → Project URL + Key eintragen → **Konto anlegen** mit E-Mail und eigenem Passwort (mind. 10 Zeichen).
2. Bestätigungs-Mail von Supabase anklicken, dann anmelden.
3. **Wichtig:** Danach in Supabase unter **Authentication → Sign In / Providers → Email** die Option *Allow new users to sign up* ausschalten. Dann kann niemand sonst ein Konto in deiner Datenbank anlegen.
4. Im Browsermenü **Zum Startbildschirm hinzufügen**, dann startet sie wie eine App.

## Bedienung
- **Training**: Dauer wählen, einen der drei Tagesvorschläge antippen (Ablauf mit Kamerabildern erscheint darunter), *Training starten*.
- Vor jeder Übung zeigt die App, wo das Handy stehen soll (von oben + Höhe) und prüft, ob die Kamera frontal bzw. seitlich passt.
- Während der Übung: Skelett mit Ziel-Hilfslinien (gelb gestrichelt), roter Pfeil zeigt die Korrekturrichtung, Rahmen grün/gelb/rot, Sprachhinweise.
- **Haltungs-Check** zu Beginn misst deine Ausgangshaltung. Die erste Messung wird deine persönliche Referenz (Skoliose: Ziel ist eine schrittweise Verbesserung, nicht sofort Symmetrie; einstellbar über *Zielkorrektur*).
- Nach dem Training: Steifigkeit/Schmerz und Belastung angeben. „Zu leicht“/„Zu schwer“ passt die Intensität automatisch an.

## Daten
Tabellen in Supabase (alle nur für deinen Account sichtbar):
- `sessions` – eine Zeile pro Einheit inkl. Plan, Übungsergebnissen, Haltungs-Check, Check-in/-out (`schema_version` für spätere Auswertungen)
- `posture_samples` – Messwerte ca. 1× pro Sekunde (Schulter-/Beckenneigung, Rumpfverschiebung, Gelenkwinkel …)
- `dev_logs`, `dev_snapshots` – nur im Dev-Modus: Ereignisprotokoll, Landmarken alle 2 s, bis 40 Bilder pro Einheit
- `profiles` – Einstellungen und Kalibrierung

*Verlauf → Daten exportieren* lädt alles als JSON herunter.

## Dev-Modus & Zugriff für Claude
1. Beim Start *Dev-Modus* anhaken. Bei falscher Erkennung **Erkennung falsch** tippen (speichert Bild + Messwerte).
2. *Einstellungen → Zugang für Claude → Schlüssel erzeugen* und den Text in den Chat kopieren.
3. Claude ruft damit nur lesend ab: `rpc/dev_bundle`, `rpc/dev_image`, `rpc/history_export`. Schlüssel lassen sich jederzeit widerrufen und laufen nach 7 Tagen ab.

Damit Claude den Abruf aus seiner Arbeitsumgebung machen kann, muss in claude.ai unter *Einstellungen → Fähigkeiten* die Domain deines Projekts (`*.supabase.co`) für den Netzwerkzugriff freigegeben sein.

## Technik
Reines HTML/CSS/JavaScript ohne Build-Schritt. Bibliotheken von jsDelivr: `@mediapipe/tasks-vision@0.10.14`, `@supabase/supabase-js@2.49.4`. Pose-Modell: Google MediaPipe Pose Landmarker (lite/full).

Dateien: `js/exercises.js` (Übungsbibliothek), `js/planner.js` (Tagespläne), `js/pose.js` (Messwerte, Prüfungen, Overlay), `js/coach.js` (Ablauf, Sprache), `js/store.js` (Speicher), `js/dashboard.js`, `js/camera-svg.js`, `supabase/schema.sql`, `tools/fetch_dev.py` (Abruf für Claude).
