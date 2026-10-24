> **Ankerzug ist Beta**

# Ankerzug

Ankerzug hilft Trainerinnen und Trainern, das gemeinsame Bogensporttraining
vom Saisonstart bis zum Hauptwettkampf zu planen. Die Desktop-App arbeitet lokal
und offline auf Linux, macOS und Windows – ohne Benutzerkonto oder Cloud.

## Funktionen

- **Saison planen:** Makrozyklen, Wettkämpfe und Trainingsphasen (Mesozyklen)
  anlegen; editierbare Phasenvorschläge sowie Ferien und Erholungszeiträume einbeziehen.
- **Trainingstermine erstellen:** Wiederkehrende Trainingsslots in konkrete
  Einheiten umwandeln und Termine im Kalender oder in der Tabelle bearbeiten.
- **Einheiten vorbereiten:** Inhalte, Zeiten, geplante Pfeilzahlen, Belastungsprofile
  und Material festlegen; Vorlagen und Inhaltsvorschläge nutzen und anpassen.
- **Trainingsspiele sammeln:** Spiele mit Beschreibungen und PDF-Anhängen verwalten,
  in Einheiten einsetzen und als Spielpakete austauschen.
- **Pläne teilen und drucken:** Einzelne Einheiten und Gesamtpläne als PDF ausgeben;
  Pläne auch als Markdown, CSV oder Kalenderdatei (ICS) exportieren.
  Makrozyklen und Vorlagen lassen sich als Ankerzug-Pakete exportieren und importieren.
- **Lokal speichern:** Änderungen automatisch sichern sowie vollständige Backups
  erstellen und wiederherstellen.

## Installation

Öffne die [Downloads auf der Release-Seite](https://github.com/olivermanz/ankerzug/releases)
und wähle unter **Assets** das Paket für dein Betriebssystem und die passende
Prozessorarchitektur. `x64`, `x86_64` bzw. `amd64` stehen für Intel-/AMD-64-Bit;
`arm64` bzw. `aarch64` für ARM, zum Beispiel Apple Silicon. Verwende nur ein
passendes, tatsächlich angebotenes Paket. Die Archive **Source code** enthalten
Quellcode und sind keine Installationspakete.

Die Beta ist noch nicht auf allen Betriebssystemversionen und Linux-Distributionen
abschließend geprüft. Beachte die Hinweise beim jeweiligen Release. Für die
fertige App brauchst du keine Entwicklungswerkzeuge.

### Linux

Für Debian/Ubuntu-basierte Systeme gibt es ein **.deb**-Paket, für RPM-basierte
Systeme wie Fedora ein **.rpm**-Paket.

1. Lade das passende Paket herunter.
2. Öffne es mit der Paketverwaltung deiner Distribution und wähle **Installieren**.
   Falls das nicht angeboten wird, öffne im Downloadordner ein Terminal und nutze
   den passenden Befehl. Ersetze `DATEINAME` durch den heruntergeladenen Dateinamen:

   ```sh
   # Debian / Ubuntu
   sudo apt install ./DATEINAME.deb

   # Fedora
   sudo dnf install ./DATEINAME.rpm
   ```

3. Die Paketverwaltung installiert benötigte Systembibliotheken mit; dafür kann
   eine Internetverbindung nötig sein. Starte anschließend **Ankerzug** über das
   Anwendungsmenü.

### macOS

1. Lade das macOS-Archiv mit der Endung **.app.tar.gz** herunter.
2. Entpacke es per Doppelklick im Finder.
3. Ziehe **Ankerzug.app** in den Ordner **Programme** und öffne die App dort.

Die Beta ist noch nicht von Apple notarisiert. Falls macOS den Start wegen eines
nicht verifizierten Entwicklers verhindert, versuche zunächst, die App zu öffnen.
Gehe anschließend zu **Systemeinstellungen → Datenschutz & Sicherheit → Dennoch öffnen**
und bestätige das Öffnen – sofern du dem Download aus diesem Repository vertraust.
Siehe dazu [Apples Anleitung zum Öffnen solcher Apps](https://support.apple.com/de-de/102445).

### Windows

1. Lade den Windows-Installer mit der Endung **.exe** herunter.
2. Öffne ihn per Doppelklick und folge dem Installationsassistenten.
3. Starte **Ankerzug** über das Startmenü.

Der Installer ist noch nicht mit einem Windows-Zertifikat signiert. Deshalb kann
Windows SmartScreen eine Warnung anzeigen. Prüfe, dass die Datei aus den oben
verlinkten Releases stammt. Falls angeboten und du dem Download vertraust, kannst
du über **Weitere Informationen → Trotzdem ausführen** fortfahren.
[Microsoft erläutert die SmartScreen-Warnungen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).
Eine gegebenenfalls angebotene Installation von **Microsoft Edge WebView2** wird
für die Darstellung der App benötigt und kann eine Internetverbindung erfordern.

## Erste Schritte

1. Lege einen **Makrozyklus** mit Trainingsbeginn und Hauptwettkampf an.
2. Ergänze Ferien und Sonderzeiträume. Prüfe den Vorschlag für die Mesozyklen
   und passe ihn an deine Gruppe an.
3. Lege wiederkehrende **Trainingsslots** an und erzeuge nach Prüfung der Vorschau
   die Trainingseinheiten.
4. Öffne eine Einheit im Kalender oder in **Trainingseinheiten** und ergänze Inhalte
   oder übernimm eine Vorlage.
5. Warte auf **Lokal gespeichert**. Über **Export & Import** kannst du Pläne teilen
   und PDFs zum Drucken öffnen.

## Daten sichern

Deine Planung bleibt auf deinem Gerät. Erstelle regelmäßig über **Backup erstellen**
eine Sicherung und bewahre eine Kopie auf einem anderen Datenträger auf, besonders
vor einem Update der Beta. Automatisches Speichern ersetzt kein Backup.

Das Wiederherstellen eines Backups ersetzt den gesamten aktuellen Datenbestand
nach deiner Bestätigung. Mit **Stand vor Wiederherstellung** kannst du zum vorherigen
Stand zurückkehren. PDFs, CSV- und Kalenderdateien sind keine wiederherstellbaren
Backups.

## Weitere Informationen

- [Vorlagen aus Word-, PDF- oder Textbeschreibungen aufbereiten](TEMPLATE_IMPORT_FORMAT.md)
- [Anleitung für Entwicklung, Builds und Tests](README_DEV.md) (Englisch)
- [Fehler melden](https://github.com/olivermanz/ankerzug/issues): Beschreibe die Schritte
  zum Fehler und nenne Betriebssystem sowie Ankerzug-Version.
