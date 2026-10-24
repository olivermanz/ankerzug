# Requirements – Desktop-App zur Trainingsperiodisierung im Bogensport

Die Erweiterung **Trainingsspiele für Version 1.1** ist in
[requirements_training_games_v1_1.md](requirements_training_games_v1_1.md)
mit Spielverwaltung, PDF-Anhängen, Import/Export, PDF-Spielanleitung und optionaler
Spielauswahl in Trainingsblöcken definiert. Sie ergänzt diese Anforderungen;
Implementierung und Abnahme stehen aus.

## 1. Ziel der Anwendung

Die Anwendung dient zur Planung eines vollständigen Trainings-Makrozyklus im Bogensport mit einem definierten Hauptwettkampf und optional weiteren Saisonhöhepunkten. Eine anschließende Übergangsphase kann zum Planungszeitraum gehören.

Die Anwendung plant gemeinsame Trainingseinheiten einer Trainingsgruppe. Belastungsprofile, Pfeilzahlen und Freitextbeschreibungen beschreiben Vorgaben des Plans, keine Messwerte einzelner Athleten. Individuelle Durchführung, Leistungsbewertung und Zielerreichung gehören nicht zum Funktionsumfang. Organisatorische Terminstatus und allgemeine Trainernotizen bleiben möglich.

Diese Fassung integriert die fachliche Verfeinerung der Trainingsplanung. Die neuen Phasen-, Belastungs- und Ferienregeln ersetzen die bisherigen abweichenden Festlegungen; sie beschreiben den Zielzustand, nicht den bereits implementierten Funktionsumfang. Die technischen Verträge und Kompatibilitätsregeln stehen in [ARCHITECTURE.md](ARCHITECTURE.md); wiederholbare Abnahmeschritte und offene native Release-Prüfungen stehen in [EXPLORATORY_TESTING.md](EXPLORATORY_TESTING.md).

Der Nutzer soll möglichst wenig repetitive Planungsarbeit manuell durchführen müssen. Die Anwendung soll deshalb:

- aus wenigen Eckdaten einen sinnvollen Grundaufbau vorschlagen,
- Mesozyklen fachlich sinnvoll vorbelegen,
- wiederkehrende Trainingsslots automatisch in konkrete Trainingseinheiten umwandeln,
- die Einheiten automatisch den passenden Mesozyklen zuordnen,
- Schulferien und andere trainingsrelevante Zeiträume berücksichtigen,
- Trainingseinheiten mit sinnvollen Standardinhalten vorbelegen,
- wiederkehrende Inhalte und Einheiten einfach kopierbar bzw. als Vorlage nutzbar machen.

Die Anwendung ist eine **Desktop-Anwendung** und arbeitet vollständig mit einer **lokalen Datenbank**.

Zielplattformen sind **Windows, macOS und Linux**. Der fachliche Funktionsumfang und die lokale Offline-Nutzung müssen auf allen unterstützten Plattformen verfügbar sein.

Technologie, Framework, Programmiersprache und konkretes Datenbanksystem sind **nicht Bestandteil dieser Requirements**.

---

# 2. Grundbegriffe

## 2.1 Makrozyklus

Ein Makrozyklus beschreibt den vollständigen Planungszeitraum vom Trainingsstart bis zu einem expliziten Enddatum. Dieses liegt am oder nach dem Hauptwettkampf und kann eine anschließende UEP einschließen. Ohne anschließende Planung entspricht es dem Hauptwettkampfdatum.

Ein Makrozyklus besteht aus:

- Stammdaten,
- einem Startdatum,
- einem Hauptwettkampf,
- optional weiteren Wettkämpfen,
- Ferien-/Sonderzeiträumen,
- mehreren Mesozyklen,
- Trainingsslots,
- daraus generierten Trainingseinheiten.

## 2.2 Mesozyklus

Ein Mesozyklus ist ein zusammenhängender Trainingsblock mit einem definierten Trainingsziel und einer definierten Belastungscharakteristik.

Beispiele:

- VP1 – Vorbereitungsphase 1
- VP2 – Vorbereitungsphase 2
- WP – Wettkampfphase
- UWV – Unmittelbare Wettkampfvorbereitung
- UEP – Übergangsphase

## 2.3 Trainingsslot

Ein Trainingsslot beschreibt einen regelmäßig wiederkehrenden Termin.

Beispiel:

- Dienstag, 18:00 Uhr
- Donnerstag, 18:30 Uhr
- Samstag, 10:00 Uhr

Aus Trainingsslots erzeugt die Anwendung konkrete, datierte Trainingseinheiten.

## 2.4 Trainingseinheit

Eine Trainingseinheit ist ein konkreter Termin an einem konkreten Datum.

Beispiel:

- Dienstag, 13.10.2026, 18:00 Uhr

Eine Trainingseinheit gehört genau zu einem Makrozyklus und in der Regel zu genau einem Mesozyklus.

## 2.5 Trainingsinhalt

Eine Trainingseinheit besteht aus mehreren zeitlich geordneten Trainingsinhalten.

Beispiel:

| Start | Dauer | Inhalt |
|---|---:|---|
| 00:00 | 30 min | Aufwärmen und Einschießen |
| 00:30 | 30 min | Techniktraining |
| 01:00 | 45 min | Wettkampfpassen |
| 01:45 | 15 min | Abschluss / Cool-down |

---

# 3. Hauptworkflow

Der typische Workflow muss folgende Reihenfolge unterstützen:

1. Makrozyklus erstellen
2. Startdatum definieren
3. Hauptwettkampf definieren
4. Schulferien bzw. Sonderzeiträume eintragen
5. Mesozyklen automatisch vorschlagen oder manuell festlegen
6. Mesozyklen bearbeiten
7. wiederkehrende Trainingsslots anlegen
8. konkrete Trainingseinheiten generieren
9. einzelne generierte Einheiten entfernen oder verändern
10. Trainingseinheiten mit Inhalten planen
11. Vorlagen auf weitere Einheiten übertragen
12. Gesamtplan in Kalender- und Tabellenansicht prüfen

---

# 4. Makrozyklus

## 4.1 Makrozyklus erstellen

Beim Erstellen eines Makrozyklus sind mindestens folgende Angaben erforderlich:

- Name
- Startdatum
- Datum des Hauptwettkampfs

Optionale Angaben:

- Sportler / Trainingsgruppe
- Wettkampfdisziplin
  - Halle
  - WA im Freien
  - Feld
  - 3D
  - andere
- Altersklasse
- Ziel oder Zielbeschreibung
- Enddatum (Default: Hauptwettkampfdatum; für eine anschließende UEP verlängerbar)
- erwartete Dauer einer Standardtrainingseinheit

Diese Zusatzinformationen dienen primär dazu, später sinnvollere Trainingsvorschläge generieren zu können.

## 4.2 Hauptwettkampf

Der Hauptwettkampf ist der zentrale Zieltermin des Makrozyklus.

Pflichtfelder:

- Datum
- Name

Optionale Felder:

- Ort
- Priorität

Der Hauptwettkampf besitzt automatisch die Priorität:

**A – Hauptwettkampf**

## 4.3 Weitere Wettkämpfe

Innerhalb des Makrozyklus sollen optional weitere Wettkämpfe angelegt werden können.

Prioritäten:

- A – Hauptwettkampf
- B – wichtiger Vorbereitungswettkampf
- C – Trainings-/Kontrollwettkampf

Weitere Wettkämpfe dürfen die automatische Trainingsplanung beeinflussen.

Beispiel:

Ein B-Wettkampf kann eine reduzierte Trainingsbelastung unmittelbar davor vorschlagen, ohne einen vollständigen Formaufbau zu erzwingen. Ein C-Wettkampf kann als Trainingseinheit innerhalb einer VP2 oder WP berücksichtigt werden.

Jeder Wettkampf besitzt eine eindeutige Kennung, Datum, Name und Priorität A/B/C; Disziplin und Ort sind optional. Der Hauptwettkampf verweist auf genau einen A-Wettkampf. Weitere A-Wettkämpfe können eigene UWV-Blöcke erhalten. Bei eng liegenden Saisonhöhepunkten darf nicht automatisch erneut eine vollständige VP1/VP2 erzeugt werden. Mehrere WP- und UWV-Blöcke sind zulässig (z. B. VP1 → VP2 → WP → UWV → WP → UWV → UEP).

---

# 5. Ferien und Sonderzeiträume

## 5.1 Zeiträume anlegen

Der Nutzer kann beliebig viele Zeiträume definieren.

Pflichtfelder:

- Bezeichnung
- Startdatum
- Enddatum
- Typ

Vordefinierte Typen:

- Schulferien
- Urlaub
- Trainingslager
- kein Training möglich
- reduziertes Training
- Sonderzeitraum

## 5.2 Verhalten

Für jeden Zeitraum kann festgelegt werden:

- Training normal durchführen
- Training reduzieren
- Training aussetzen
- Trainingslager / erhöhte Trainingsmöglichkeit
- keine automatische Änderung (bewusste Trainerentscheidung; entspricht normaler Terminerzeugung)

Schulferien sind nicht automatisch trainingsfrei. Die vier fachlichen Grundmodi sind `NORMAL`, `REDUCED`, `NO_TRAINING` und `TRAINING_CAMP`. Für Nachwuchsathleten wird bei Schulferien `REDUCED` vorgeschlagen; der Trainer kann den Modus ändern. Ohne Nachwuchsprofil wird die Entscheidung sichtbar angeboten, statt Trainingsausfall anzunehmen.

Bei `REDUCED` kann der Trainer zu verwendende Slots bzw. reduzierte Dauern festlegen; ohne diese Konfiguration bleiben Termine als reduzierte Vorschläge sichtbar. Es wird kein willkürlicher Anteil an Slots entfernt. Bei `NO_TRAINING` werden standardmäßig keine Einheiten übernommen; eine ausdrückliche Einzelentscheidung in der Vorschau bleibt möglich.

## 5.3 Darstellung

Ferien und Sonderzeiträume müssen:

- im Kalender farblich oder anderweitig deutlich erkennbar sein,
- in der Trainingstabelle markiert werden,
- bei der Generierung von Trainingseinheiten berücksichtigt werden.

## 5.4 Automatische Behandlung

Wenn ein Trainingsslot in einen Zeitraum mit „kein Training möglich“ fällt, soll die Anwendung standardmäßig vorschlagen, diese Einheit nicht anzulegen.

Die Entscheidung muss vom Nutzer überschrieben werden können.

Im ersten MVP werden bei überlappenden Sonderzeiträumen alle betroffenen
Zeiträume angezeigt. „Training aussetzen“ deaktiviert den Vorschlag zunächst;
„Training reduzieren“ bleibt zusätzlich als Kennzeichnung erhalten. Die Auswahl
ist pro Termin überschreibbar. Trainingslager erzeugen keine zusätzlichen Slots
von selbst; erhöhte Trainingsmöglichkeiten werden über weitere Slots geplant.

---

# 6. Mesozyklen

## 6.1 Datenmodell

Ein Mesozyklus besitzt Kennung, Name, Startdatum, Enddatum, `phaseType`, Beschreibung. Seine Farbe ist auswählbar: Grau (Standard), Hellgrün, Dunkelgrün, Blau, Orange oder Rot. Die Farbe markiert die Mesozykluskarte und wird lokal sowie in Backups gespeichert. Bestehende Daten ohne Farbangabe erhalten Grau. Für wiederkehrende WP-/UWV-Phasen verwaltet die Anwendung eine interne Reihenfolge; sie wird nicht bearbeitet. Optional sind `targetCompetitionId` sowie technische/physische/mentale Prioritäten.

Das Mesozyklusprofil besitzt die getrennten Dimensionen `volume` und `competitionSpecificity` (jeweils 1–5, bei nicht festgelegten Werten leer). Intensität wird im Mesozyklus nicht erfasst. Historisch gespeicherte Mesozyklus-Intensitäten bleiben ausschließlich kompatible Bestandsdaten und beeinflussen keine neuen Vorschläge für Einheiten. Der Phasentyp liefert editierbare Startwerte, keine verbindlichen Belastungsgrenzen. Optionale Zusatzdimensionen sind technische Anforderung, mentale Anforderung und Regenerationspriorität. Einheiten sollen ihr eigenes Belastungsprofil ebenfalls editierbar übernehmen können; die Phasenzuordnung bestimmt keinen unveränderlichen Einheitenwert.

## 6.2 Phasentypen und fachliche Profile

Genau fünf grundlegende Phasentypen werden verwendet: `VP1`, `VP2`, `WP`, `UWV`, `UEP`. Wiederkehrende WP- und UWV-Phasen werden intern chronologisch unterschieden, ohne zusätzliche Enum-Werte oder bearbeitbare Instanzbeschriftungen. VP1/VP2, WP/UWV oder UEP/VP1 bezeichnen Übergänge, keine eigenen Phasentypen. Übergangswochen dürfen visuell oder als Mischprofil dargestellt werden.

### VP1 – Vorbereitungsphase 1

Ziel: allgemeine Leistungsgrundlagen und saubere Schießtechnik aufbauen oder wiedererwerben. Bewegungsqualität und Wiederholungsqualität gehen vor Ergebnisdruck; individuelle Bewegungsvorstellung und Schussroutine werden entwickelt.

- Schießen: Blank-Scheibe, isolierte Technikschwerpunkte, Positions- und Bewegungsarbeit, Videoanalyse und kontrollierter Aufbau des Pfeilumfangs.
- Athletik: allgemeine Kraft, Rumpf-/Schulterstabilität, Mobilität, allgemeine Ausdauer und Koordination.
- Mental/Wettkampfmanagement: Prozessmerkmale und Konzentration, ohne übermäßige Ergebnisorientierung.
- Material: Neuanschaffungen, größere Setup-Änderungen, Grundtuning und Abstimmung von Bogen/Pfeilen.
- Qualitativer Default: Umfang mittel → hoch, Intensität niedrig → mittel, Spezifität niedrig, Technikanteil sehr hoch, Athletikanteil hoch, Regenerationsbedarf mittel.

### VP2 – Vorbereitungsphase 2

Ziel: Technik und Athletik in belastbare, wettkampfnähere Leistung überführen. Technik unter wechselnden Bedingungen, spezielle Kondition/Koordination und mentale Abläufe unter Belastung stabilisieren.

- Schießen: erhöhte Pfeilzahlen, Technik unter Ermüdung, Technik-/Ergebnisaufgaben, variable Entfernungen, Zeitdruck, Rhythmuswechsel und erste vollständige Simulationen.
- Athletik: spezielle Kraftausdauer, Haltearbeit, Schulter/Rücken, spezielle Koordination und Erhalt der allgemeinen Ausdauer.
- Mental/Wettkampfmanagement: Bewegungsvorstellung in Echtzeit, Routine unter Störung, kontrolliertes Absetzen, Fehlerreaktion und erste Wenn-Dann-Strategien.
- Material: Fein-/Gruppentuning, Visier/Button/Pfeile/Stabilisation abstimmen und Wettkampfsetup festlegen; größere Experimente gegen Ende reduzieren.
- Qualitativer Default: Umfang hoch → sehr hoch, Intensität mittel → hoch, Spezifität mittel, Technikanteil hoch, Athletikanteil mittel → hoch, Regenerationsbedarf hoch.

### WP – Wettkampfphase

Ziel: stabile Wettkampfleistung, Übertragung des Trainingsniveaus und Erhalt der technischen/athletischen Fähigkeiten.

- Schießen: wettkampfähnliche Passen/Serien, Runden, Qualifikations-, Final- und Matchplay-Simulationen soweit disziplinrelevant, Zeitregime, Scores und Drucksituationen.
- Mental/Wettkampfmanagement: Anhalten/Absetzen, Wind, Fehlerreaktion, Pausen, Aktivierung, Wenn-Dann-Strategien und individuelle Wettkampfroutine.
- Athletik: Erhalt; unmittelbar vor wichtigen Wettkämpfen keine automatisch vorgeschlagenen schweren Kraftreize.
- Material: Kontrolle, kleine Korrekturen, Verschleißkontrolle und Referenzwerte; größere Änderungen erzeugen Warnungen.
- Qualitativer Default: Umfang mittel, Intensität hoch, Spezifität hoch, Technikanteil mittel, Athletikanteil niedrig → mittel, Regenerationsbedarf bei Wettkampfblöcken hoch.

### UWV – Unmittelbare Wettkampfvorbereitung

Ziel: optimale Vorbereitung auf einen konkreten Zielwettkampf; jede fachlich vollständige UWV besitzt `targetCompetitionId`. Eine fehlende Zuordnung in einem bearbeitbaren Plan erzeugt eine Warnung; eine gesetzte Kennung muss auf einen vorhandenen Wettkampf zeigen.

- Qualität vor Menge: Zielwettkampfdistanz/-auflage, Rhythmus, Zeitregime, Finalsimulation, ggf. Mannschaftsrhythmus und Windtraining bei Freiluftdisziplinen.
- Kurze Qualitätseinheiten, individuelles Wettkampfmanagement, technisches Vertrauen und weniger Müdigkeit.
- Tapering: vorgeschlagener Umfang sinkt; Spezifität und technische Qualität bleiben hoch oder steigen; athletische Ermüdung soll sinken. Keine starre Prozentreduktion.
- Material stabil halten: Kontrolle, notwendige Verschleißteile und Rückkehr zu bekanntem Setup; grundlegende Änderungen erzeugen deutliche Warnungen.
- Qualitativer Default: Umfang mittel → niedrig, Intensität mittel → hoch, Spezifität sehr hoch, Technikanteil mittel, Athletikanteil niedrig, Regenerationsfokus sehr hoch.

### UEP – Übergangsphase

Ziel: physische/psychische Erholung nach einem Saisonhöhepunkt oder am Makrozyklusende; Abstand vom strukturierten Wettkampftraining, Beschwerden berücksichtigen und Saison reflektieren.

- Schießen optional: freies Schießen, alternative Disziplinen, spielerische Formen; vollständig ohne Bogentraining zulässig.
- Athletik: regenerative oder lockere allgemeine Bewegung.
- Qualitativer Default: Umfang, Intensität und Spezifität sehr niedrig; Regenerationsfokus maximal.

## 6.3 Individuelle Benennungen

Der Trainer darf Phasen frei benennen und Profile anpassen. Eigene Bezeichnungen erweitern die fünf fachlichen Phasentypen nicht. Wochenprofile und optionale Mischprofile bilden Übergänge ab (Abschnitt 34).

---

# 7. Belastungsmodell

## 7.1 Belastungsdimensionen

Für Mesozyklen werden `volume` (Trainingsumfang) und `competitionSpecificity` (Wettkampfspezifität) getrennt auf einer normierten Skala 1–5 erfasst. Ein leerer Wert bleibt unbekannt und wird nicht als 0 behandelt. Die Anwendung schlägt aus dem Phasentyp Startwerte vor; der Trainer kann sie unabhängig ändern. Einheiten und Vorlagen können zusätzlich `intensity` (Belastungsintensität) führen.

Dies ersetzt die frühere Festlegung, Intensität und Zielumfang nicht zu speichern. Das frühere Mesozyklusfeld `arrowCount` mit 0–100 ist keine absolute Pfeilzahl und darf weder als solche noch als Prozentwert des neuen Umfangs interpretiert werden. Es gehört nicht zum neuen fachlichen Belastungsmodell; Bestandswerte müssen bei einer Umstellung nachvollziehbar erhalten werden (Transformation dokumentieren), statt sie stillschweigend umzudeuten.

Optionale Dimensionen: `technicalDemand`, `mentalDemand`, `recoveryPriority`. Qualitative Phasenprofile (Abschnitt 6) werden in konfigurierbaren Vorlagen auf die Skalen abgebildet.

## 7.2 Pfeilumfang

Einheiten unterstützen `plannedArrowCount`: optionale nichtnegative ganze absolute Pfeilzahlen als Trainingsvorgabe, ohne die frühere Grenze 100. Inhaltsblöcke dürfen zusätzlich geplante Pfeilzahlen tragen. Null bedeutet nicht festgelegt; 0 bedeutet bewusst kein Pfeilumfang. Wochenwerte werden aus dem Plan aggregiert (Abschnitt 20). Diese Vorgaben gelten für den geplanten Trainingsablauf; sie werden weder als Gruppen-Gesamtpfeilzahl noch als tatsächlich geschossene Pfeile interpretiert.

Einheitenwerte und Blockwerte dürfen nicht doppelt gezählt werden. Fehlt ein Einheitenwert, kann eine vollständige Blocksumme als abgeleiteter Einheitenwert angezeigt werden; bei unvollständigen Angaben muss die Übersicht die fehlende Abdeckung zeigen.

Optionale Zielkorridore hängen von Alter, Leistungsniveau, Bogenart und Belastbarkeit ab. Keine universellen Pfeilzahlen gelten als DSB-Vorgabe.

## 7.3 Wettkampfspezifität und Tapering

1. unspezifisch
2. überwiegend Technik / Grundlagen
3. gemischt
4. wettkampfnah
5. nahezu vollständige Wettkampfsimulation

Beispiel UWV/Taper: Umfang sinkt, allgemeine Belastung niedrig bis mittel, Spezifität hoch, technische Qualitätsanforderung hoch. Eine geringere Pfeilzahl darf Spezifität nicht automatisch senken.

---

# 8. Automatische Erstellung eines Mesozyklus-Vorschlags

## 8.1 Editierbarer Vorschlag

Nach Eingabe von Startdatum und Hauptwettkampf erzeugt die Anwendung einen ersten bearbeitbaren Periodisierungsvorschlag. Weitere Wettkämpfe und bekannte Ferien/Abwesenheiten werden berücksichtigt. Die Übernahme bleibt eine bewusste Trainerentscheidung.

## 8.2 Rückwärtsplanung

Vom Hauptwettkampf rückwärts: Hauptwettkampf ← UWV ← WP ← VP2 ← VP1. Eine UEP liegt typischerweise danach oder zwischen Makrozyklen und erfordert entsprechende Planungsdaten.

Es gibt keine verbindlichen Phasenlängen oder festen Prozentanteile. Konfigurierbare Vorlagen berücksichtigen verfügbare Gesamtdauer, Trainingsalter, Leistungsniveau, Wettkampfdichte, Saisonhöhepunkte, Ferien/Abwesenheit und vorherige geplante Belastung. Fehlende individuelle Angaben werden als Annahmen sichtbar gemacht. Die bisherigen fest eingebauten 20/30/20/20/10- bzw. 50/30/20-Verteilungen und die feste 14-Tage-Tapergrenze sind keine Regeln des Zielzustands.

## 8.3 Kurze Zeiträume und mehrere Höhepunkte

Bei kurzer Vorbereitungszeit werden Phasen sinnvoll verkürzt oder ausgelassen; die Anwendung erklärt den Vorschlag, statt unmögliche Mindestdauern zu erzwingen. Bei mehreren A-Wettkämpfen sind mehrere WP/UWV-Blöcke zulässig. Bei eng liegenden A-Wettkämpfen kein automatischer vollständiger Neubeginn mit VP1/VP2. B-Wettkämpfe lösen standardmäßig keinen vollständigen Formaufbau aus; C-Wettkämpfe können als Training geplant werden.

## 8.4 Belastungs- und Inhaltsdefaults

Früh sind technische Anpassungen möglich; später nur kleine Korrekturen und unmittelbar vor dem Zielwettkampf keine automatisch vorgeschlagenen grundlegenden Änderungen. Umfang steigt typischerweise bis zum Aufbau und sinkt in der UWV; Spezifität steigt zum jeweiligen A-Wettkampf. Mentaltraining ist über den ganzen Makrozyklus möglich. Simulationen werden disziplin- und phasenabhängig dosiert.

## 8.5 Nachvollziehbarkeit und Trainerhoheit

Vorschläge können eine Begründung tragen, z. B. „TAPER: Zielwettkampf in 6 Tagen, Woche in UWV“ oder „Entlastung nach drei Belastungswochen“. Solche Zeitwerte sind Beispiele, keine starren Regeln. Grenzen, Reduktionsfaktoren und Warnschwellen sind konfigurierbare Empfehlungen, keine allgemein gültigen DSB-Vorgaben.

Manuell veränderte Phasen, Profile und Inhalte sind gültiger Planstand. Öffnen, Speichern oder erneute Vorschläge dürfen die frühere Empfehlung nicht stillschweigend wiederherstellen. Ablehnungen werden bei unverändertem Kontext respektiert.

## 8.6 Datumsregeln

Datumsintervalle enthalten beide Endtage. Gleiche Eingaben und gleiche Vorlage liefern fachlich denselben Vorschlag ohne Lücken oder Überschneidungen; Kennungen können neu sein. Der bisherige Berechnungshorizont von 3660 Tagen bleibt eine technische Grenze, keine sportfachliche Phasendauer.

---

# 9. Mesozyklus-Editor

Mesozyklen sollen in einer Timeline bearbeitet werden können.

Erforderliche Funktionen:

- Start verschieben
- Ende verschieben
- Typ ändern
- Umfang und Spezifität unabhängig ändern
- UWV-Zielwettkampf bearbeiten
- Beschreibung bearbeiten
- Mesozyklus teilen
- zwei Mesozyklen zusammenführen
- Mesozyklus löschen
- neuen Mesozyklus zwischen bestehende einfügen

## 9.1 Validierung

Standardmäßig sollten Mesozyklen:

- innerhalb des Makrozyklus liegen,
- sich nicht überlappen,
- möglichst keine ungeplanten Lücken enthalten.

Überlappungen oder Lücken müssen mindestens als Warnung angezeigt werden.

---

# 10. Trainingsslots

## 10.1 Trainingsslot anlegen

Ein Trainingsslot besitzt:

- Wochentag
- Startzeit

Optional:

- Standarddauer
- Bezeichnung
- Trainingsort
- gültig ab
- gültig bis

Beispiel:

```text
Dienstag
18:00 Uhr
Standarddauer: 120 Minuten
```

Die Slotdaten zeigen weder Einheitentyp noch „Nur im Trainingslager“. Bestehende
Werte bleiben als Kompatibilitätsdaten erhalten. Die Terminvorschau belegt den
Einheitentyp anhand des eindeutig zugeordneten Mesozyklus vor: VP1 → ET
(Elementetraining), VP2 → KNT (Spezifische Kondition), WP → BAT, UWV → ZPT.
Bei UEP oder ohne eindeutigen Mesozyklus bleibt die bisherige Slotvorgabe erhalten.
Vorschautypen bleiben editierbar. Unter der Vorschau steht: „Einheitentyp kann
später geändert werden.“ Bestehende Trainerentscheidungen bleiben geschützt.

## 10.2 Mehrere Trainingsslots

Es müssen beliebig viele Trainingsslots angelegt werden können.

Beispiel:

- Dienstag 18:00
- Donnerstag 18:00
- Samstag 10:00

## 10.3 Vorschau vor Generierung

Vor der endgültigen Generierung wird eine Tabelle aller daraus entstehenden Trainingseinheiten angezeigt.

Spalten mindestens:

- Datum
- Wochentag
- Uhrzeit
- Trainingsslot
- zugeordneter Mesozyklus
- Ferien-/Sonderzeitraum
- Status

Der Nutzer kann einzelne Termine bereits in dieser Vorschau deaktivieren.

---

# 11. Generierung der Trainingseinheiten

## 11.1 Generierungslogik

Für jeden Trainingsslot werden alle passenden Termine zwischen:

- Startdatum des Makrozyklus
- Hauptwettkampf bzw. Ende des Makrozyklus

ermittelt.

Jeder übernommene Termin erhält Datum/Uhrzeit, Mesozykluszuordnung, daraus ableitbaren Phasentyp, vorgeschlagenes Belastungsprofil, Trainingsschwerpunkte und Status „geplant“. Die Vorschläge können verändert werden. Bei mehrdeutiger Zuordnung bleibt eine ausdrückliche Auswahl bzw. unzugeordnete Einheit möglich.

## 11.2 Automatische Zuordnung zum Mesozyklus

Die Anwendung bestimmt anhand des Datums automatisch den Mesozyklus.

Beispiel:

```text
13.10.2026
→ liegt im Mesozyklus „VP2 – Vorbereitungsphase 2“
→ Trainingseinheit wird automatisch diesem Mesozyklus zugeordnet
```

## 11.3 Ferienlogik

Liegt der Termin in einem Ferien-/Sonderzeitraum, wird dies angezeigt.

Je nach Konfiguration kann die Einheit:

- normal erstellt,
- als reduziert markiert,
- zunächst deaktiviert,
- nicht erstellt

werden.

## 11.4 Einzelne Trainingseinheit entfernen

Jede automatisch generierte Trainingseinheit kann einzeln entfernt werden.

Das Entfernen einer Einheit darf:

- nicht den Trainingsslot löschen,
- nicht andere Trainingseinheiten verändern.

## 11.5 Regenerieren

**Implementierungsstand: umgesetzt (Inkrement 08).** Die native End-to-End-Abnahme
auf Windows, macOS und Linux bleibt ausstehend; dieser Status bezeichnet die
Implementierung, nicht die abgeschlossene Produktabnahme.

- [x] Änderungen an Slots, Mesozyklen, Makrozyklusdaten und Sonderzeiträumen neu berechnen.
- [x] Hinzufügen, Aktualisieren, Entfernen, Zuordnung, Ausschlüsse und Konflikte vorab anzeigen.
- [x] Überlebende Einheiten mit stabiler Identität erhalten; bewusst entfernte Termine nicht wieder erzeugen.
- [x] Trainerinhalte, verschobene Einheiten und geplante Ziele schützen; Konflikte ausdrücklich entscheiden.
- [x] Akzeptierte Änderungen gemeinsam und revisionsgeprüft speichern; veraltete Vorschauen zurückweisen.

Neue Einheiten speichern einen unabhängigen Generierungsstand. Bestandseinheiten
ohne diesen Stand werden konservativ behandelt; frühere Trainerentscheidungen
werden nicht aus aktuellen Slotwerten rekonstruiert. Bei geschützten geplanten
Einheiten kann der Trainer ausdrücklich nur Termin und Zuordnung übernehmen;
Inhalte, Einheitentyp und fachliche Planung bleiben erhalten. Einheiten mit anderem organisatorischen Status als „geplant“ bleiben unverändert.
Automatisch entfallene Termine sind keine dauerhaften Lösch-Ausschlüsse.

Wenn Trainingsslots oder Mesozyklen später verändert werden, muss die Anwendung eine Regenerierung ermöglichen.

Bereits manuell bearbeitete Einheiten dürfen dabei **nicht unbemerkt überschrieben werden**.

Die Anwendung muss Änderungen unterscheiden zwischen:

- automatisch erzeugtem Zustand
- manueller Abweichung

Bei Konflikten ist eine Vorschau erforderlich.

---

# 12. Trainingseinheit

## 12.1 Grunddaten

Eine Trainingseinheit besitzt:

- Datum
- Startzeit
- geplante Dauer
- zugehörigen Makrozyklus
- zugehörigen Mesozyklus
- Status

Optionale Angaben:

- Name der Einheit
- Einheitentyp (`BAT` Bewegungsablauftraining, `ET` Elementetraining, `LK` Leistungskontrolle, `BAT-WE` Bewegungsablauftraining Wettkampfentfernung, `ZPT` Zielpunkttraining, `KNT` Spezifische Kondition, `KT` Koordinationstraining, `AT` Athletiktraining, `MT` Mentaltraining, `M-T` Material/Tuning, `GT` Grundlagentraining oder `KAT` Kraftausdauertraining)
- ein oder mehrere Trainingsbereiche
- Notiz

Der Name ist frei editierbar und wird bei der Generierung aus dem Trainingsslot
übernommen. Der Einheitentyp klassifiziert die Einheit und ist von den Trainingsbereichen getrennt; Notizen bleiben frei editierbar.

Der Einheiteneditor zeigt keine geplante Pfeilzahl sowie Umfang, Intensität oder Spezifität. Bereits gespeicherte Planungswerte bleiben erhalten. Überholte personenbezogene Bestandsfelder werden nur für verlustfreie Speicherung, Migration und Backupkompatibilität bewahrt; daraus entsteht keine Anforderung an Erfassung oder Auswertung.

## 12.2 Status

Mögliche Statuswerte:

- geplant
- durchgeführt
- ausgefallen
- verschoben

Diese Statuswerte beschreiben ausschließlich den gemeinsamen Termin. „Durchgeführt“ bedeutet, dass der Gruppentermin stattgefunden hat; es bestätigt weder die Teilnahme noch die Durchführung oder Zielerreichung einzelner Athleten. Für die erste Version ist mindestens „geplant“ erforderlich.

## 12.3 PDF-Export einer Trainingseinheit (vorgezogen aus 30.2)

Im Einheiteneditor lässt sich der aktuelle, erfolgreich gespeicherte Plan als
PDF im Format A4 Hochformat exportieren. Jeder PDF-Export (Trainingseinheit oder
Trainingsplan) öffnet direkt ein eigenes Ankerzug-Fenster mit einem integrierten
PDF-Viewer, ohne vorherigen Speicherdialog.
„Drucken“ sowie Strg+P (macOS: Cmd+P) öffnen direkt den Druckdialog für alle
PDF-Seiten. Die Druckfunktion ist erst verfügbar, wenn alle Seiten geladen sind.
„Speichern unter …“ im Viewer bietet optional einen nativen Speicherdialog mit
Datum und Einheitenname als vorgeschlagenem Dateinamen an. Abbruch erzeugt keine
Datei; Abbruch oder Speicherfehler lassen den Viewer weiterhin zum Drucken offen.
Bei Viewer-Fehlern erscheint eine verständliche Fehlermeldung.

Das PDF enthält Name, Datum, Startzeit, geplante Dauer, Makro-/Mesozyklus,
Notiz und Freitextbeschreibungen sowie die Inhaltsblöcke in ihrer Reihenfolge mit
Start-/Enduhrzeit, Dauer, Inhalt und Material.
Ab Version 1.1 erscheint bei Spielblöcken zusätzlich der Name des ausgewählten
Spiels gemäß [requirements_training_games_v1_1.md](requirements_training_games_v1_1.md).
Typ, Status und Trainingsbereiche werden im PDF nicht ausgegeben.
Eine hervorgehobene Übersicht zeigt Datum, Beginn und geplante Dauer. Jeder Block
besitzt eine abgesetzte Zeitspalte mit Start, Dauer und Ende; Inhaltsüberschriften,
Abstände und dezente druckfreundliche Farben gliedern den Ablauf.
Überlange Blöcke erhalten auf Folgeseiten eine Fortsetzungskennzeichnung.
Die Zeiten folgen lückenlos aus den Blockdauern; ein Tageswechsel ist markiert.
Abweichungen zwischen Inhaltsdauer und geplanter Dauer werden sichtbar ausgewiesen.
Lange Texte werden umgebrochen und auf weiteren A4-Seiten mit Seitenzahlen
fortgesetzt. Deutsche Sonderzeichen bleiben erhalten; nicht unterstützte Zeichen
führen zu einer verständlichen Fehlermeldung statt zu still ausgelassenem Text.
Der Export verändert keine Trainingsdaten und ersetzt kein wiederherstellbares Backup.
Native Dialog-/Druckabnahme auf Windows, macOS und Linux bleibt erforderlich.

---

# 13. Inhalte einer Trainingseinheit

## 13.1 Inhaltselement

Eine Trainingseinheit besteht aus beliebig vielen Inhaltselementen.

Jedes Inhaltselement besitzt:

- automatisch berechneter Start
- Dauer in Minuten
- Inhalte als großes, mehrzeiliges Freitextfeld

Optional:

- Material als Freitext
- weitere Trainingsbereiche
- Typ (einschließlich Pause; ab Version 1.1 auch Spiel mit optionaler Spielauswahl)

Die Inhaltseditoren für Einheiten und Vorlagen zeigen keine Unterkategorie, Übungsreferenz, geplanten Blockpfeilzahlen, geplante Blockbelastung oder Blocknotiz. Bestehende ausgeblendete Planungswerte und überholte personenbezogene Bestandsfelder bleiben ausschließlich zur Bestands- und Backupkompatibilität erhalten.
„Bereiche des Blocks“ wird im Einheiteneditor nicht angezeigt; vorhandene
Bereichszuordnungen bleiben gespeichert.

Mindestens ein fachlicher Trainingsbereich wird zugeordnet (Abschnitt 14);
Pausen benötigen keinen Trainingsbereich. Freitext bleibt verfügbar.

## 13.2 Zeitmodell

Die Inhalte sind lückenlos in ihrer Reihenfolge angeordnet: Der erste Inhalt
startet immer bei Minute 0, jeder weitere am Ende des vorherigen. Der Start ist
ein berechneter Offset relativ zum Beginn der Trainingseinheit und wird nicht
als „Start (Minuten)“ bearbeitet. Änderungen der Dauer, Einfügen, Entfernen und
Umordnen berechnen alle folgenden Startzeiten neu. Das gilt auch für Vorlagen
und eingelesene Bestandsdaten; die Reihenfolge und Dauer bleiben erhalten.
Pausen sind eigene Inhaltsblöcke mit Typ „Pause“ und einer positiven Dauer.
Links an jedem Inhaltsblock stehen untereinander Start, Dauer in Minuten
(in kleiner Schrift) und Ende. Das Ende ergibt sich aus Start plus Dauer.

Beispiel:

Training beginnt um 18:00 Uhr.

```text
Start 00:00 → 18:00 Uhr
Start 00:30 → 18:30 Uhr
Start 01:15 → 19:15 Uhr
```

Die Oberfläche darf zusätzlich die aus Startzeit und Blockdauern berechnete lokale Uhrzeit anzeigen.

## 13.3 Default beim Erstellen einer Einheit

Neue reguläre Bogentrainingseinheiten werden standardmäßig mit folgendem Inhalt vorbelegt. Reine Athletik-, Mental-, Material-, Regenerations- oder Diagnostikeinheiten erhalten keinen sachfremden Einschießblock:

```text
Start: 00:00
Dauer: 30 Minuten
Inhalt: Aufwärmen und Einschießen
```

Dieses Element:

- kann bearbeitet werden,
- kann verkürzt oder verlängert werden,
- kann vollständig entfernt werden.

Es ist **kein unveränderlicher Pflichtblock**.

## 13.4 Automatische Startzeit

Beim Hinzufügen eines neuen Inhaltselements wird dessen Start automatisch auf
das Ende des vorherigen Inhalts gesetzt. Das Zeitmodell bleibt nach jeder
Änderung lückenlos.

Beispiel:

```text
00:00 + 30 min → nächster Start 00:30
00:30 + 45 min → nächster Start 01:15
```

Der Start wird ausschließlich aus Reihenfolge und Dauer berechnet. Eine Pause
wird als eigener Block eingefügt.

## 13.5 Zeitvalidierung

Die Anwendung soll erkennen:

- Inhalte außerhalb der geplanten Trainingsdauer
- ungültige oder fehlende Blockdauer

Zeitliche Überschneidungen und Lücken werden durch die automatische Berechnung
vermieden.

Diese Situationen führen zu Warnungen, sollen aber nicht zwingend blockiert werden.

---

# 14. Trainingsbereiche und Inhaltskategorien

Einheiten und Inhaltsblöcke können einem oder mehreren Trainingsbereichen zugeordnet werden. Mindestens unterstützt werden:

- `SCHIESSTECHNIK`
- `ATHLETIK`
- `WETTKAMPFMANAGEMENT`
- `MENTAL`
- `MATERIAL`
- `REGENERATION`
- `DIAGNOSTIK`

Wettkampfmanagement und Mentaltraining dürfen gemeinsam dargestellt werden, bleiben im Datenmodell getrennt. Freitext beschreibt den konkreten Inhalt; Unterkategorien verfeinern die Bereiche.

Beispiele Schießtechnik: Position, Bewegungsablauf, Ankern, Lösen, Nachhalten, Rhythmus, Timing, Zielen, Technik unter Ermüdung. Beispiele Athletik: allgemeine/spezielle Kraft, Kraftausdauer, Rumpf, Schulterstabilität, Mobilität, Ausdauer, Koordination. Beispiele Wettkampfmanagement: Routine, Zeitmanagement, Absetzen, Wenn-Dann-/Windstrategie, Fehlerreaktion, Matchplay, Finalschießen, Mannschaftsrhythmus.

Die bisherigen Inhaltsbezeichnungen (Aufwärmen, Einschießen, Technik, Volumentraining, Kraft, Koordination, Scoring, Wettkampfsimulation, Matchplay, Mentaltraining, Blank-Scheibe, Material/Tuning, Cool-down, Regeneration, Sonstiges) bleiben als Unterkategorien bzw. beschreibende Bezeichnungen möglich. Sie ersetzen die fachlichen Bereiche nicht; mehrdeutige Bestandskategorien dürfen nicht ohne nachvollziehbare Zuordnung umgedeutet werden.

---

# 15. Fachlich intelligente Vorschläge für Trainingseinheiten

Beim Anlegen oder Öffnen einer Einheit werden passende Inhalte angeboten, ohne bestehende Trainerinhalte zu überschreiben. Die Vorschläge berücksichtigen Phase, Wochenprofil und Zielwettkampf; optional wird ihre Begründung angezeigt.

| Phase | Bevorzugte Vorschläge |
| --- | --- |
| VP1 | Technik, Bewegungsanalyse, Blank-Scheibe, allgemeine Athletik, Beweglichkeit, Grundtuning |
| VP2 | Umfangstraining, Technik unter Ermüdung, spezielle Kraftausdauer, Wettkampfelemente, Feintuning |
| WP | Scoretraining, Runden, Matchplay soweit relevant, Wenn-Dann-Situationen, Wettkampfroutine |
| UWV | kurze Qualitätseinheiten, Zielwettkampfsimulation, individuelles Wettkampfmanagement, Materialkontrolle, Regeneration |
| UEP | aktive Regeneration, alternative Bewegung, freies Schießen, Saisonreflexion; Bogentraining optional |

In VP1 werden häufige vollständige Simulationen und stark ergebnisorientiertes Training nicht bevorzugt. Vor wichtigen Wettkämpfen werden keine schweren Kraftreize automatisch vorgeschlagen. Inhalte, Belastungen und Reihenfolge bleiben editierbar; eine manuelle Abweichung löst keine automatische Rücksetzung aus.

---

# 16. Templates für Trainingseinheiten

## 16.1 Ziel

Der Nutzer soll häufig wiederkehrende Einheiten nicht immer neu eingeben müssen.

## 16.2 Vorlage speichern

Jede Trainingseinheit kann als Vorlage gespeichert werden.

Eine Vorlage enthält mindestens:

- Name
- geplante Dauer
- Inhaltselemente
- Start-Offsets
- Kategorien

## 16.3 Vorlage anwenden

Eine Vorlage kann angewendet werden auf:

- eine einzelne Einheit
- alle ausgewählten Einheiten
- alle Einheiten eines Trainingsslots
- alle Einheiten eines Mesozyklus
- alle noch ungeplanten Einheiten eines Mesozyklus

## 16.4 Schutz manueller Änderungen

Beim Anwenden auf mehrere Einheiten muss auswählbar sein:

- bestehende Inhalte ersetzen
- nur leere Einheiten befüllen
- Inhalte anhängen

Im ersten MVP bedeutet „nur leere Einheiten“: Einheiten ohne Inhaltsblöcke. Eine
Einheit mit ausschließlich unverändertem Standard-Aufwärmblock bleibt fachlich
ungeplant, wird bei diesem Modus aber übersprungen. Beim Anhängen beginnen die
Vorlageninhalte am Ende des letzten vorhandenen Blocks; die geplante Dauer wird
bei Bedarf verlängert. Eine Vorschau zeigt Ziele, Blockanzahl und Dauer vor und
nach der Anwendung. Ersetzen benötigt eine ausdrückliche Bestätigung.

---

# 17. Automatische Einheitentemplates

Die Anwendung soll einige interne Standardvorlagen mitliefern.

Beispiele:

## Technik – 90 Minuten

```text
00:00  30 min  Aufwärmen und Einschießen
00:30  45 min  Technikschwerpunkt
01:15  15 min  freie Anwendung / Abschluss
```

## Wettkampfspezifisch – 120 Minuten

```text
00:00  30 min  Aufwärmen und Einschießen
00:30  15 min  Probepfeile / Wettkampfroutine
00:45  60 min  Scoring / Wettkampfsimulation
01:45  15 min  Abschluss / kurze Auswertung
```

## Leichte Einheit / Taper – 60 Minuten

```text
00:00  20 min  Aufwärmen und Einschießen
00:20  30 min  qualitativ hochwertige Wettkampfpfeile
00:50  10 min  Abschluss / Materialcheck
```

Diese Vorlagen sind lediglich Defaults und vollständig editierbar.

---

# 18. Automatische Planungshilfen

## 18.1 Noch ungeplante Einheiten erkennen

Die Anwendung soll deutlich anzeigen, welche generierten Trainingseinheiten noch keine individuellen Inhalte oder Vorlage besitzen.

## 18.2 Massenbearbeitung

Mehrere Einheiten können gleichzeitig ausgewählt werden.

Mögliche Aktionen:

- Vorlage anwenden
- Name der Einheit setzen
- löschen
- deaktivieren
- Dauer ändern

## 18.3 Kopieren

Eine Einheit kann kopiert werden nach:

- nächste Einheit
- vorherige Einheit
- beliebiges Datum
- alle gleichen Wochentage
- ausgewählte Einheiten

## 18.4 Von vorheriger Einheit übernehmen

Beim Öffnen einer noch leeren Einheit soll optional angeboten werden:

> Inhalte der vorherigen Trainingseinheit übernehmen

## 18.5 Historische Mesozyklus-Standardvorlagen

Mesozyklus-Standardvorlagen werden nicht mehr erfasst oder auf Einheiten angewendet. Bereits gespeicherte Zuordnungen bleiben ausschließlich für die Kompatibilität von Bestandsdaten und Backups erhalten.

---

# 19. Ansichten

## 19.1 Makrozyklus-Übersicht

Die Übersicht zeigt Planungskennzahlen und die Einstellungen des Makrozyklus.
Die horizontale Makrozyklus-Timeline entfällt vollständig. Die zeitliche
Darstellung von Mesozyklen, Ferien, Wettkämpfen, Hauptwettkampf und
Trainingseinheiten erfolgt in der Kalenderansicht.
Pro Mesozyklus zeigt die Übersicht außerdem zwei statische Zeilen: Stammdaten
mit inklusiver Dauer und einen vollbreiten, nach aktuellen Einheitentypen
gewichteten Balken. Verschobene Einheiten zählen nicht; geplante, durchgeführte
und abgesagte Einheiten bleiben enthalten. Die Balken sind keine Timeline.

## 19.2 Kalenderansicht

Mindestens:

- Monatsansicht
- Wochenansicht

Einheiten sollen nach Mesozyklus unterscheidbar sein.

## 19.3 Tabellenansicht

Spalten mindestens:

- Datum
- Wochentag
- Uhrzeit
- Mesozyklus
- Name der Einheit
- Einheitentyp
- geplante Dauer
- Ferienhinweis
- Status
- Inhalt geplant ja/nein

Filter:

- Mesozyklus
- Trainingsslot
- Zeitraum
- Status
- geplant / ungeplant

Das Filterpanel ist standardmäßig eingeklappt und lässt sich über einen Button
ein- und ausklappen. Beim Einklappen bleiben eingestellte Filter aktiv.

## 19.4 Mesozyklus-Ansicht

Zeigt:

- Zeitraum
- Typ
- Umfang, Intensität und Spezifität
- Anzahl Trainingseinheiten
- geplante Trainingsminuten
- Ferien / Wettkämpfe
- Liste der Einheiten

---

# 20. Übersicht der Trainingsbelastung

Mesozyklusübersichten berechnen Einheitenzahl, geplante Trainingsminuten und Pfeilzahlen. Die Kalenderansicht unterstützt weiterhin Montagwochen; eine gesonderte Wochen- oder Soll/Ist-Auswertung gehört nicht zum Funktionsumfang.

Die Farben aller kanonischen Einheitentypen werden global unter Einstellungen
bearbeitet und zusammen mit dem Workspace gesichert. Sie sind von der
Mesozyklusfarbe getrennt und gelten auch für Backup und Wiederherstellung.

Geplante Pfeilzahlen und Dauer werden auf Einheiten- und Mesozyklusebene angezeigt. Fehlende Planungswerte bleiben unbekannt; Teilsummen zeigen ihre Abdeckung. Einheit und ihre Blöcke werden nicht doppelt gezählt (Abschnitt 7). Mehrfachzuordnungen zu Trainingsbereichen dürfen in der Darstellung nicht fälschlich als additive Gesamttrainingszeit erscheinen. Übersichten beschreiben den gemeinsamen Plan, keine tatsächlich geleistete oder über Athleten summierte Belastung.

Warnungen und Trends beziehen sich ausschließlich auf geplante Umfänge und Belastungsprofile. Sie erlauben keine Aussage über die individuelle Belastungsverträglichkeit.

---

# 21. Plausibilitätsprüfungen

Fachliche Prüfungen erzeugen standardmäßig ignorierbare Warnungen, keine Eingabesperren. Ungültige Datumswerte, negative Dauern/Pfeilzahlen, unbekannte Enum-Werte und Verweise auf nicht vorhandene Objekte bleiben strukturelle Fehler.

## Periodisierung und Zeit

- Überlappungen, Lücken, Phasen/Einheiten außerhalb des expliziten Makrozykluszeitraums.
- Inhaltsblöcke außerhalb der Dauer oder mit Lücken/Überlappungen.
- A-Wettkampf ohne UWV; UWV ohne zugeordneten Zielwettkampf.
- Fehlende UEP nach langer Saison bzw. fehlende VP1/VP2 trotz ausreichender Vorbereitung.

Eine Einheit nach dem Hauptwettkampf ist innerhalb einer bewusst verlängerten Planung mit UEP zulässig.

## Belastung

- Mehrere Wochen starker Belastungsanstieg ohne Entlastung.
- Spitzenbelastung unmittelbar vor A-Wettkampf.
- Steigender statt sinkender Umfang in der UWV.
- Viele harte Einheiten direkt aufeinander bzw. langer Zeitraum ohne Erholung.

## Material und Inhalte

- Grundlegende geplante Änderung gemeinsamer Trainingsausrüstung in UWV, kurz vor A-Wettkampf oder in WP.
- Nahezu ausschließlich Wettkampfsimulationen in VP1.
- Keine wettkampfspezifischen Einheiten in WP/UWV.
- Über längere Zeit keine Athletik oder Regeneration.

„Kurz“, „lang“, „stark“ und „hart“ werden durch sichtbare konfigurierbare Warnparameter konkretisiert. Fehlende Daten erlauben keine erfundene Belastungsbewertung. Warnungen geben Anlass und betroffene Daten an. Bestätigte Trainerentscheidungen werden bei unverändertem Kontext nicht ständig erneut eingefordert.

---

# 22. Speicherung

## 22.1 Lokale Datenhaltung

Alle Daten werden lokal gespeichert.

Die Anwendung muss ohne Internetverbindung vollständig funktionieren.

Es ist kein Benutzerkonto erforderlich.

## 22.2 Automatisches Speichern

Änderungen sollen automatisch gespeichert werden.

Der Benutzer soll nicht regelmäßig einen manuellen „Speichern“-Button betätigen müssen.

## 22.3 Datenintegrität

Beziehungen zwischen:

- Makrozyklus
- Mesozyklus
- Trainingsslot
- Trainingseinheit
- Trainingsinhalt
- Wettkampf
- Ferienzeitraum
- Template

müssen dauerhaft erhalten bleiben.

---

# 23. Backup und Datenaustausch

Die Anwendung soll mindestens ermöglichen:

- vollständiges Backup erzeugen
- Backup wiederherstellen

Wünschenswert:

- Makrozyklus exportieren
- Makrozyklus importieren
- Trainingseinheit-Vorlagen einzeln oder gemeinsam exportieren
- Trainingseinheit-Vorlagen mit Vorschau als unabhängige Kopien importieren

Der Export soll alle für die Wiederherstellung notwendigen Daten enthalten. Vorlagen-Pakete enthalten sämtliche Vorlagenfelder und geordneten Trainingsblöcke. Beim Import erhalten Vorlagen und Blöcke neue Kennungen; bestehende Vorlagen und deren Zuordnungen bleiben erhalten. Abbruch verändert keine Daten, zusammengehörige Änderungen werden atomar gespeichert.

Ein menschenlesbarer zusätzlicher Export, z. B. als Markdown, CSV oder PDF, kann später ergänzt werden.

---

# 24. Datenmodell auf fachlicher Ebene

Die konkreten Persistenzstrukturen sind nicht vorgegeben. Kennungen sind eindeutige Strings; Datumswerte sind `YYYY-MM-DD`, Uhrzeiten davon getrennt. Optional nicht erfasste Zahlen bleiben leer. Beziehungen können durch Aggregateigentum statt redundanter Fremdschlüssel abgebildet werden.

| Entität | Fachliche Daten |
| --- | --- |
| MacroCycle | id, name, startDate, endDate, mainCompetitionId, Sportler-/Gruppenbezug, discipline, ageClass, goal |
| Competition | id, Makrozyklusbezug, name, date, priority A/B/C, discipline, location, notes; optional Zielwettkampfdistanz/-auflage/-zeitregime |
| SpecialPeriod | id, Makrozyklusbezug, name, startDate, endDate, type, trainingPolicy; optionale konfigurierte Reduktion |
| MesoCycle | id, Makrozyklusbezug, name, startDate, endDate, phaseType, interne Reihenfolge wiederkehrender Phasen, targetCompetitionId, volume, competitionSpecificity, description, Prioritäten |
| TrainingWeek | id, Makrozyklusbezug, weekStartDate, profile, optionale Belastungsziele; Randwochen können mehrere Phasen berühren |
| TrainingSlot | id, Makrozyklusbezug, weekday, startTime, defaultDuration, validFrom, validUntil, name, location |
| TrainingSession | id, Makrozyklusbezug, mesoCycleId, sourceTrainingSlotId, Generierungsursprung, date, startTime, name, sessionType, Trainingsbereiche, plannedDuration, plannedArrowCount, geplantes Belastungsprofil, status, manuallyModified, individuallyPlanned, notes |
| SessionContent / Trainingsblock | id, Einheitenbezug, Reihenfolge, startOffsetMinutes, durationMinutes, Trainingsbereiche, Unterkategorie, content, material, plannedArrowCount, plannedLoad, exerciseId, notes |
| SessionTemplate | id, name, description, defaultDuration, empfohlener Phasentyp/Einheitentyp, geordnete unabhängige Inhaltskopien |

Strukturierte Trainingsziele sind aus dem Funktionsumfang entfernt (Abschnitt 36). Freitextbeschreibungen bleiben möglich. Überholte Bestandsfelder gehören nicht zum fachlichen Zielmodell; verlustfreie Migration und beide Backupreader bleiben erforderlich. Phasentyp und Wochen-/Mesozyklussummen werden aus Beziehungen abgeleitet; bei gespeicherten Vorschlagsprofilen bleiben manuelle Änderungen geschützt. Die Anwendung unterscheidet vorgegebenen Default, generierten Vorschlag und Trainerentscheidung.

---

# 25. Lösch- und Änderungsverhalten

## Makrozyklus löschen

Löscht nach Bestätigung alle zugehörigen Daten.

## Mesozyklus löschen

Die enthaltenen Trainingseinheiten dürfen nicht automatisch gelöscht werden.

Stattdessen müssen sie:

- neu zugeordnet werden oder
- als „ohne Mesozyklus“ markiert werden.

## Trainingsslot löschen

Bereits generierte Trainingseinheiten sollen standardmäßig erhalten bleiben.

Die Anwendung fragt:

- nur Trainingsslot löschen
- Trainingsslot und alle noch unveränderten daraus erzeugten Einheiten löschen

**Regenerierungsschutz implementiert (Inkrement 08):** Beim Beibehalten entfallender
Einheiten wird die Trainerentscheidung geschützt. Bereits vom Slot gelöste,
erhaltene Einheiten werden durch eine spätere Regenerierung nicht entfernt.

## Trainingseinheit löschen

Löscht nur diesen Termin.

Der ursprüngliche Trainingsslot bleibt bestehen. In der Einheitenübersicht löscht
„Ausgewählte Einheiten löschen“ nach gemeinsamer Bestätigung alle ausgewählten
Einheiten. Abbrechen erhält Daten und Auswahl. Bewusst gelöschte Termine bleiben
von erneuter Generierung ausgeschlossen.

---

# 26. Undo / Änderbarkeit

Für zentrale Planungsaktionen ist Undo sehr wünschenswert.

Insbesondere:

- Mesozyklus verschoben
- Mesozyklus gelöscht
- Einheiten massenhaft generiert
- Einheiten massenhaft gelöscht
- Vorlage auf viele Einheiten angewendet

Mindestens vor destruktiven Massenaktionen ist eine Bestätigung erforderlich.

**Implementiert für Inkrement 08:** Vor dem Entfernen unveränderter Einheiten
durch Regenerierung ist eine Bestätigung erforderlich. Abbrechen verändert keine
Einheit. Umfassendes Undo bleibt ein späterer Ausbau (Inkrement 12).

---

# 27. Desktop-Bedienkonzept

Die Anwendung ist primär für große Bildschirme ausgelegt.

Bevorzugte Struktur:

```text
Makrozyklus
├── Übersicht
├── Mesozyklen
├── Kalender
├── Trainingseinheiten
├── Wettkämpfe
├── Ferien / Sonderzeiträume
├── Vorlagen
└── Einstellungen
```

## 27.1 Einheit bearbeiten

Beim Öffnen einer Einheit sollte eine klare Timeline erscheinen.

Beispiel:

```text
Dienstag, 13.10.2026
18:00–20:00
Mesozyklus: VP2 – Vorbereitungsphase 2

00:00 ─ 00:30
Aufwärmen und Einschießen

00:30 ─ 01:15
Technik unter Belastung

01:15 ─ 01:45
Scoring

01:45 ─ 02:00
Abschluss
```

Inhalte müssen einfach:

- hinzugefügt
- gelöscht
- verschoben
- verlängert
- verkürzt

werden können.

Drag-and-drop ist wünschenswert, aber keine zwingende fachliche Voraussetzung.

---

# 28. Fachliche Grundprinzipien der eingebauten Planungslogik

Die Anwendung soll folgende Prinzipien berücksichtigen:

1. Ein Hauptwettkampf wird rückwärts geplant.
2. Größere technische Änderungen gehören eher an den Beginn eines Makrozyklus.
3. Trainingsumfang und Trainingsintensität sind unterschiedliche Größen.
4. Wettkampfspezifität steigt in Richtung Hauptwettkampf.
5. Schussabläufe sollen zunehmend unter Ermüdung und später unter wettkampfähnlichem Druck stabil reproduzierbar sein.
6. Die letzte Phase vor dem Hauptwettkampf dient primär der Realisation vorhandener Leistung und nicht dem Aufbau neuer Fähigkeiten.
7. Im Taper wird vor allem der Umfang reduziert; qualitativ hochwertige und wettkampfspezifische Inhalte bleiben erhalten.
8. Mentale Vorbereitung ist Teil des Trainingsprozesses und nicht ausschließlich Bestandteil der Wettkampfwoche.
9. Erholung, Ferien und organisatorisch trainingsfreie Zeiträume müssen Teil der Planung sein.
10. Automatische Vorschläge sind Hilfen. Der Trainer bzw. Nutzer hat immer die letzte Entscheidung.

---

# 29. MVP – Muss-Funktionen

Für die überarbeitete Kernplanung sind die folgenden Funktionen zwingend erforderlich. Diese Liste ersetzt die frühere MVP-Feldvereinfachung; vorhandene Implementierung und historische Prüfung gelten dadurch nicht automatisch als aktualisiert:

- Makrozyklus erstellen
- Startdatum und Hauptwettkampf verwalten
- Ferien-/Sonderzeiträume erfassen
- Mesozyklen erstellen und bearbeiten
- fünf fachliche Phasentypen VP1/VP2/WP/UWV/UEP
- unabhängig editierbare Mesozyklusprofile für Umfang und Spezifität
- explizites Planungsende und Zielwettkampfzuordnung für UWV
- Schulferienmodus bewusst wählen, bei Nachwuchs REDUCED als Default
- automatische Mesozyklus-Vorschläge
- Trainingsslots definieren
- Trainingseinheiten aus Slots generieren
- automatische Zuordnung zu Mesozyklen
- einzelne generierte Termine löschen
- Tabellenansicht aller Termine
- Trainingseinheiten bearbeiten
- Standardblock „30 min Aufwärmen und Einschießen“
- Trainingsinhalte mit Start, Dauer und Freitext
- Inhalte hinzufügen und entfernen
- automatische Startzeit des nächsten Blocks
- lokale Speicherung
- automatische Speicherung
- Basis-Templates
- Vorlage kopieren / auf mehrere Einheiten anwenden

---

# 30. Funktionen für eine zweite Ausbaustufe

## 30.1 Fachliche Erweiterung

Zusätzlich zur Kernplanung gehören zur fachlichen Erweiterungsabnahme (Abschnitt 32.2):

- mehrere A-/B-/C-Wettkämpfe mit mehreren WP/UWV-Blöcken
- phaseabhängige Inhaltsvorschläge mit nachvollziehbaren Gründen
- konfigurierbares Tapering
- geplante absolute Pfeilzahlen und Planungsübersichten
- organisatorischer Status des Gruppentermins

## 30.2 Weiterführender Ausbau

Nicht zwingend für Kernplanung bzw. erste fachliche Erweiterung:

- phasenspezifische geplante Pfeilzahl-Zielkorridore für den Gruppenplan
- Krafttraining
- Athletenverwaltung
- mehrere Athleten pro Trainingsgruppe
- Statistiken über geplante Gruppenaktivitäten
- Trends der geplanten Umfänge und Belastungsprofile
- Wettkampfkalender
- detaillierte Wettkampfkalenderansichten
- Export als PDF (Einzeleinheiten vorgezogen umgesetzt; Gesamtpläne bleiben späterer Ausbau)
- Druckansicht
- Kalenderexport
- wiederkehrende Trainingslager
- vollständige Mikrozyklen als eigene Domänenebene
- Recurve-/Compound-/Blankbogen- und Alters-/Nachwuchsvorlagen

---

# 31. Beispiel für die automatische Ersteinrichtung

Eingabe: „Hallensaison 2026“, Start 28.09.2026, A-Hauptwettkampf 06.12.2026, Disziplin Halle. Ohne anschließende UEP endet der Makrozyklus am 06.12.; für UEP legt der Trainer ein späteres Ende fest.

Ein möglicher **editierbarer Vorlagenvorschlag**, keine verbindliche Dauerregel:

| Zeitraum | Phase | Umfang / Spezifität (1–5) |
| --- | --- | --- |
| 28.09.–11.10. | VP1 | 3 / 1 |
| 12.10.–01.11. | VP2 | 5 / 3 |
| 02.11.–22.11. | WP | 3 / 4 |
| 23.11.–06.12. | UWV, Ziel: Hauptwettkampf | Umfang 3 → 2, Spezifität 5 |

Die konkreten Werte stammen aus einer gewählten Vorlage, sind unabhängig editierbar und keine DSB-Norm. Die Intensität einer Einheit wird getrennt von ihrem Mesozyklusprofil geplant. Absolute Pfeilzahlen bleiben ohne individuelle Zielwerte offen.

Trainingsslots: Dienstag 18:00, Donnerstag 18:00, Samstag 10:00. Die Anwendung zeigt alle Vorkommen im Planungszeitraum, berücksichtigt die gewählten Ferienmodi und ordnet Einheiten zeitlich passenden Mesozyklen zu. Reguläre Bogentrainingseinheiten enthalten zunächst einen entfernbaren Block „30 Minuten Aufwärmen und Einschießen“. Weitere Inhalte werden manuell, über Vorschläge oder Vorlagen ergänzt.

---

# 32. Akzeptanzkriterien

## 32.1 Kernplanung

Die Kernplanung gilt fachlich als funktionsfähig, wenn folgender End-to-End-Ablauf ohne manuelle Datenmanipulation möglich ist:

1. Nutzer erstellt einen Makrozyklus vom 28.09. bis 06.12.
2. Nutzer trägt zwei Wochen Schulferien ein.
3. Anwendung erzeugt einen editierbaren VP1/VP2/WP/UWV-Vorschlag mit getrennten Belastungsdimensionen und UWV-Zielwettkampf.
4. Nutzer verändert Start/Ende eines Mesozyklus.
5. Nutzer legt drei wöchentliche Trainingsslots an.
6. Anwendung zeigt alle daraus resultierenden Termine in einer Vorschau.
7. Ferien werden in der Vorschau mit gewähltem Modus erkannt; Nachwuchsferien sind standardmäßig reduziert und nicht automatisch trainingsfrei.
8. Nutzer entfernt einzelne Termine.
9. Restliche Termine werden erzeugt.
10. Jede Einheit ist automatisch dem korrekten Mesozyklus zugeordnet.
11. Nutzer öffnet eine Einheit.
12. Die Einheit enthält standardmäßig „30 Minuten Aufwärmen und Einschießen“.
13. Nutzer löscht diesen Block.
14. Nutzer fügt mehrere neue Inhalte mit Start, Dauer und Freitext hinzu.
15. Startzeiten nachfolgender Blöcke werden automatisch vorgeschlagen.
16. Nutzer speichert die Einheit als Vorlage.
17. Nutzer wendet diese Vorlage auf mehrere andere Einheiten an.
18. Alle Daten stehen nach Neustart der Desktop-Anwendung unverändert zur Verfügung.

Dieser Ablauf muss auf Windows, macOS und den unterstützten Linux-Distributionen mit der jeweils installierten Desktop-Anwendung erfolgreich geprüft werden.

## 32.2 Fachliche Erweiterung

1. Einfacher Zyklus: Start, Hauptwettkampf, Slots und Ferien liefern einen editierbaren VP1 → VP2 → WP → UWV-Vorschlag; optional anschließende UEP innerhalb verlängerten Enddatums.
2. Zwei A-Höhepunkte: VP1 → VP2 → WP → UWV → WP → UWV → UEP ist planbar; keine erzwungene erneute VP1/VP2 zwischen nahen Wettkämpfen. Jede UWV zeigt ihren Zielwettkampf.
3. Automatische Termine: Slots erzeugen korrekt datierte und zugeordnete Einheiten; erneute unveränderte Erzeugung dupliziert keine Termine und stellt gelöschte Termine nicht wieder her.
4. Inhalte: Für dieselbe reguläre Einheit in VP1 werden Technik/Grundlagen, in UWV Zielwettkampfsimulation/Qualität/Regeneration angeboten. Öffnen überschreibt keinen bestehenden Inhalt.
5. Wettkampfnähe: Im gewählten Vorschlagsprofil ist die Spezifität zum A-Wettkampf hoch bzw. steigt; eine manuelle Änderung bleibt nach erneutem Öffnen und Neustart erhalten.
6. Tapering: Bei einer konfigurierten UWV-Vorlage sinkt der vorgeschlagene Umfang, während Spezifität hoch bleibt; andere Reduktionswerte können eingegeben und gespeichert werden.
7. Material: Eine als grundlegend markierte geplante Änderung gemeinsamer Trainingsausrüstung innerhalb des konfigurierten Warnzeitraums vor A-Wettkampf oder innerhalb UWV erzeugt eine Warnung und kann trotzdem gespeichert werden.
8. Planungsübersichten: Geplante Dauer und Pfeilzahlen werden auf Einheiten- und Mesoebene ohne Doppelzählung angezeigt. Fehlende Vorgaben bleiben unbekannt; die Übersicht ist keine Summe über Teilnehmer. Änderungen am Plan aktualisieren die Übersichten.
9. Ferienmodi: NORMAL erzeugt reguläre Termine, REDUCED beachtet eine konfigurierte Slot-/Dauerreduktion, NO_TRAINING übernimmt standardmäßig keine Termine und TRAINING_CAMP nutzt explizite Slots. Alle Modi sind sichtbar editierbar.
10. Entfernte Bereiche: „Wochen & Soll/Ist“ und „Trainingsziele“ sowie strukturierte Zielanzeigen sind nicht verfügbar. Bestehende Wochen- und Zieldaten bleiben bei Speichern, Backup/Wiederherstellung und Neustart als Kompatibilitätsdaten erhalten. Kalenderwochen, geplante Einheitenwerte und Freitextbeschreibungen bleiben verfügbar.
11. Warnungen: Fehlender UWV-Zielwettkampf ist speicherbar mit Warnung; ein gesetzter, nicht existierender Verweis wird abgewiesen. Sportfachliche Warnungen blockieren keine bewusste Trainerentscheidung.

Alle Erweiterungsszenarien schließen lokale Speicherung, Backup/Wiederherstellung und Neustart ein. Fehlende Zahlen werden als unbekannt bzw. unvollständige Abdeckung angezeigt. Tests mit 0 und Pfeilzahlen über 100 unterscheiden absolute Zahlen vom alten Mesozyklusfeld. Native Abnahme ist auf allen drei Zielplattformen erforderlich; historische MVP-Testergebnisse ersetzen diese Prüfung nicht.


---

# 33. Leitprinzip für die Produktentwicklung

Die Anwendung soll kein leerer Kalender mit Textfeldern sein.

Der Mehrwert besteht darin, dass sie die fachliche Struktur einer Trainingsperiodisierung bereits kennt und aus wenigen Eingaben einen belastbaren Ausgangsplan erzeugt.

Der Nutzer soll insbesondere nicht manuell:

- jeden einzelnen Trainingstermin anlegen,
- jede Einheit einem Mesozyklus zuordnen,
- immer wieder dieselben Standardblöcke erfassen,
- die Periodisierung komplett von Null aufbauen,
- Ferien bei jedem Termin einzeln prüfen

müssen.

**Automatisieren, was aus vorhandenen Daten eindeutig ableitbar ist.  
Vorschlagen, was fachlich sinnvoll, aber nicht eindeutig ist.  
Niemals eine Trainerentscheidung stillschweigend überschreiben.**


---

# 34. Wochenprofile – nur Bestandskompatibilität

Der Bereich „Wochen & Soll/Ist“ einschließlich Wochenprofileditor und Soll/Ist-Auswertung ist entfernt. Bestehende Wochenprofile bleiben in lokalen Daten, Wiederherstellungsständen und beiden Backupformaten erhalten. Vorhandene Profile werden weiterhin von bestehenden Inhaltsvorschlägen und Planungswarnungen berücksichtigt; es gibt keinen neuen Bearbeitungsablauf. Kalenderwochen und geplante Mesozykluswerte bleiben verfügbar.

# 35. Organisatorischer Terminstatus

Status „geplant“, „durchgeführt“, „ausgefallen“ und „verschoben“ beziehen sich auf den gemeinsamen Gruppentermin (Abschnitt 12.2). Allgemeine Trainernotizen sind möglich. Der Status verändert die geplanten Werte nicht und erfasst keine individuellen Teilnehmerdaten.

Mesozyklussichten zeigen ausschließlich Planungswerte. Verschobene Ursprungstermine werden nicht zusätzlich zum Ersatztermin gezählt; ausgefallene Termine bleiben als solche im Plan erkennbar.

# 36. Strukturierte Trainingsziele – entfernt

Der Bereich „Trainingsziele“, seine Erstellungs-/Bearbeitungs-/Löschabläufe und strukturierte Zielanzeigen in Mesozyklusdetails und Timeline-Vorschauen sind entfernt. Es gibt keine strukturierte Zielverwaltung auf Makrozyklus-, Mesozyklus-, Wochen- oder Einheitenebene.

Bestehende Zielobjekte einschließlich überholter Statusfelder bleiben als Kompatibilitätsdaten erhalten. Bestehende Referenzbehandlung bei Phasen- und Einheitenoperationen sowie verlustfreie Speicherung, Wiederherstellung und beide Backupreader bleiben erforderlich. Freitextbeschreibungen von Makrozyklen, Mesozyklen, Einheiten und Übungen bleiben möglich.

# 37. Material an Trainingsinhalten

Gemeinsame Materialänderungen und Materialwarnungen sind nicht Teil des Produkts. Material bleibt als Freitext an einzelnen Trainingsinhalten erhalten; individuelle Bogen-Setups und deren Änderungshistorien werden nicht verwaltet.

Grundlegende geplante Änderungen werden als solche gekennzeichnet. Eine solche Änderung in UWV oder kurz vor A-Wettkampf erzeugt eine ignorierbare Planungswarnung (Abschnitt 21). Kontrollen, notwendiger Verschleißersatz und Rückkehr zum bekannten Setup bleiben unterscheidbar; die Anwendung blockiert keine Trainerentscheidung.

# 38. Fachliche Regeln, Defaults und Quellenbasis

Die Anwendung unterscheidet feste ableitbare Regeln (z. B. Termindatum), editierbare fachliche Defaults (z. B. Phasenprofil), bewusste Trainerentscheidungen und ignorierbare Plausibilitätswarnungen. Fachwissen soll nachvollziehbar unterstützen; individuelle Annahmen dürfen nicht als zwingende Vorgaben erscheinen.

Die fachliche Verfeinerung nennt als Orientierung den DSB-Strukturplan Leistungssport 2025–2028, DSB-Trainerportal/Lehrmaterial Bogensport und den Rahmentrainingsplan Landeskader Bogen 2026 des Hessischen Schützenverbands (VP1, VP2, WP, UWV und ÜP). Diese Quellenangaben wurden aus der Änderung übernommen; Softwaredefaults und Datenmodelle sind abgeleitete Modellierungen, keine wörtlichen DSB-Vorgaben. Die App verwendet `UEP` für die Übergangsphase.

Exakte Phasenlängen, universelle Wochenpfeilzahlen, Anzahl der Einheiten, Tapering-Prozentwerte, Kraftumfänge, Ringzahlziele und starre Belastungswechsel sind keine allgemein verbindlichen DSB-Regeln. Sie dürfen als konfigurierbare Empfehlungen/Vorlagen angeboten werden.
