# Requirements – Trainingsspiele, Version 1.1

Stand: 2026-10-07. Status: Anforderungen definiert; Implementierung und Abnahme ausstehend.

Dieses Dokument definiert die Erweiterung **Trainingsspiele für Produktversion 1.1**.
Es ergänzt [requirements_archery_training_planner.md](requirements_archery_training_planner.md)
und baut auf den Export- und PDF-Funktionen der Version 1 auf.
Diese Erweiterung ist Produktversion 1.1 zugeordnet. Die nativen Release-Prüfungen
und Abnahmeprotokolle stehen in [EXPLORATORY_TESTING.md](EXPLORATORY_TESTING.md).
Produktversion, Datenbankschema und Austausch-/Backupformat haben voneinander
unabhängige Versionen. Dieses Dokument ändert keine Anwendungsversion und führt
keine Implementierung ein.

## 1. Ziel und Umfang

Trainer können eine lokale Sammlung von Trainingsspielen anlegen und bearbeiten,
Spiele mit PDF-Anhängen austauschen und als Inhalt gemeinsamer Trainingseinheiten
auswählen. Eine eigenständige PDF-Spielanleitung unterstützt die Vorbereitung
und Durchführung des Trainings.

Alle Funktionen müssen offline unter Windows, macOS und Linux nutzbar sein.
„Einzelspiel“ bezeichnet die Spielform innerhalb des Trainings, keine Verwaltung
oder Bewertung einzelner Athleten. Die Kennzahlen beschreiben das Spiel aus
Trainersicht; sie sind keine erfassten Ergebnisse oder Messwerte.
Individuelle Leistungsbewertung, Ergebnisverwaltung, Ranglisten, Cloud-Synchronisation
und automatische Empfehlungen sind nicht Bestandteil dieser Erweiterung.

## 2. Bereich „Trainingsspiele“

**SPIEL-01:** Neben der Trainingsverwaltung gibt es einen eigenständig erreichbaren
Bereich **Trainingsspiele**. Die Sammlung ist nicht an einen Makrozyklus gebunden
und kann auch ohne ausgewählten oder vorhandenen Makrozyklus benutzt werden.

**SPIEL-02:** Eine Übersicht zeigt die gespeicherten Spiele mindestens mit Name und
Art. Von dort lassen sich neue Spiele anlegen und vorhandene Spiele bearbeiten.
Ein leerer Bestand bietet unmittelbar das Anlegen und Importieren an.

**SPIEL-03:** Die Spielbearbeitung enthält die Stammdaten, die PDF-Anhänge und die
Aktion **Spielanleitung als PDF**. Speicherung folgt dem bestehenden lokalen
Speicherverhalten mit sichtbaren Zuständen für ausstehende, erfolgreiche und
fehlgeschlagene Speicherung. Fehler dürfen nicht als erfolgreiche Speicherung
erscheinen; eingegebene Änderungen bleiben zur Korrektur oder Wiederholung erhalten.

## 3. Spieldaten und Validierung

**SPIEL-04:** Ein Spiel hat eine stabile, eindeutige Kennung und folgende fachliche Daten:

| Feld          | Pflicht | Bedeutung und gültige Werte                                     |
| ------------- | ------- | --------------------------------------------------------------- |
| Name          | Ja      | Nach Entfernen äußerer Leerzeichen nicht leer                   |
| Art           | Ja      | Checkboxen Einzelspiel und Teamspiel; mindestens eine aktiviert |
| Aufwand       | Ja      | Ganze Zahl von 1 bis 5; 1 = geringer, 5 = hoher Aufwand         |
| Spaß          | Ja      | Ganze Zahl von 1 bis 5; 1 = geringer, 5 = hoher erwarteter Spaß |
| Dauer         | Ja      | Ganze Zahl von 1 bis 5; 1 = kurz, 5 = lang                      |
| Wettkampfnähe | Ja      | Ganze Zahl von 1 bis 5; 1 = gering, 5 = hoch                    |
| Beschreibung  | Ja      | Nicht leerer, mehrzeiliger Freitext für Ablauf und Regeln       |
| PDF-Anhänge   | Nein    | Null bis beliebig viele zugeordnete PDF-Dateien                 |

**SPIEL-05:** Fehlende Pflichtwerte, fehlende, ungültige oder beide deaktivierte Spielformen, Dezimalzahlen und Kennzahlen
außerhalb von 1–5 verhindern das Speichern und Importieren mit verständlichen
Fehlermeldungen. Deutsche Sonderzeichen und mehrzeilige Beschreibungen bleiben
erhalten. Gleichnamige Spiele sind zulässig und werden über ihre Kennung unterschieden.

Bestehende Spiele mit dem bisherigen Typ werden ohne Datenbankmigration fest auf
Einzelspiel und Teamspiel gesetzt; der alte Typ entfällt. Neue Spiele starten mit
beiden aktivierten Checkboxen. Spätere Änderungen bleiben erhalten.

**SPIEL-06:** Die Kennzahl **Dauer** ist eine relative Einschätzung, keine Minutenangabe.
Sie wird nicht automatisch in eine Blockdauer umgerechnet. Auch die anderen
Kennzahlen ändern keine Belastungsprofile oder Trainingsplanung automatisch.

## 4. PDF-Anhänge

**SPIEL-07:** In der Spielbearbeitung können eine oder mehrere lokale PDF-Dateien
hinzugefügt werden. Pro Anhang werden mindestens eine eindeutige Kennung, der
ursprüngliche Dateiname und der vollständige PDF-Inhalt erhalten.
Die Anwendung übernimmt eine eigene lokale Kopie; Verschieben oder Löschen der
Ursprungsdatei darf den gespeicherten Anhang nicht unbrauchbar machen.

**SPIEL-08:** Die Anhänge erscheinen als Liste mit Dateinamen. Jeder Anhang kann
aus der Spielbearbeitung geöffnet und gedruckt werden. Das Öffnen verwendet den
integrierten PDF-Viewer mit **Drucken** und Strg+P beziehungsweise Cmd+P sowie
optionalem **Speichern unter …**. Alle Seiten und ihr ursprüngliches Seitenformat
müssen beim Drucken berücksichtigt werden; angehängte PDFs sind nicht auf A4 beschränkt.

**SPIEL-09:** Anhänge können aus dem Spiel entfernt werden. Dies verändert keine
Ursprungsdatei. Die Zuordnung und der zugehörige gespeicherte Inhalt dürfen erst
nach erfolgreicher Speicherung entfernt sein. Ein Abbruch der Dateiauswahl
verändert das Spiel nicht. Eine feste fachliche Obergrenze für die Anzahl gibt es nicht.

**SPIEL-10:** Nicht-PDF-Dateien und beschädigte oder nicht lesbare PDFs erzeugen
verständliche Fehler. Eine Dateiendung allein genügt nicht als Prüfung.
Eine Datei, die der Viewer nicht ohne zusätzliche Eingaben öffnen und drucken
kann, darf nicht als nutzbarer Anhang angenommen werden.
Technische Größen-/Ressourcengrenzen werden vor der Implementierung dokumentiert
und beim Hinzufügen und Importieren mit konkreter Fehlermeldung geprüft.
Die unveränderten Bytes eines akzeptierten Anhangs müssen erhalten bleiben.

## 5. Spielanleitung als PDF

**SPIEL-11:** Für ein erfolgreich gespeichertes Spiel kann eine eigenständige
Zusammenfassung als PDF-Spielanleitung erstellt werden. Sie enthält:

- den Namen als Titel,
- die aktivierten Spielformen Einzelspiel und/oder Teamspiel,
- Aufwand, Spaß, Dauer und Wettkampfnähe mit eindeutig beschrifteten Werten von 1–5,
- die vollständige Beschreibung mit erhaltenen Absätzen,
- eine Liste der Dateinamen vorhandener PDF-Anhänge, sofern vorhanden.

**SPIEL-12:** Die Spielanleitung verwendet A4 Hochformat, lesbare Schrift, Textumbruch,
Seitenumbrüche und Seitenzahlen. Lange Beschreibungen werden vollständig über
mehrere Seiten ausgegeben. Anhänge werden separat geöffnet und gedruckt;
ihre Seiten werden nicht automatisch in die Zusammenfassung eingefügt.

**SPIEL-13:** Die Erstellung wartet auf erfolgreiche Speicherung und verwendet
einen konsistenten Stand. Das PDF öffnet direkt im bestehenden PDF-Viewer und
kann dort gedruckt oder optional gespeichert werden. Abbruch oder Fehler beim
Speichern einer PDF-Datei verändert weder das Spiel noch seine Anhänge.
Die Spielanleitung ist ein lesbares Dokument und kein importierbares Spielpaket.

## 6. Export und Import

**SPIEL-14:** Aus dem Bereich Trainingsspiele lassen sich ein einzelnes Spiel oder
die gesamte Sammlung in ein eigenständiges, versioniertes Spielpaket exportieren.
Das Paket enthält alle Spieldaten und sämtliche zugehörigen PDF-Anhänge einschließlich
ihrer Dateinamen und vollständigen Inhalte. Es darf keine externe Ursprungsdatei
oder vorhandene Installation zum Öffnen der Anhänge voraussetzen.

**SPIEL-15:** Ein Spielpaket lässt sich ohne ausgewählten Makrozyklus importieren.
Vor dem Import erscheint eine Vorschau mit Namen, Arten und Anzahl der Spiele
und Anhänge. Gleichnamige vorhandene Spiele und Kennungskollisionen werden angezeigt.
Übernahme oder Abbruch erfolgen ausdrücklich durch den Nutzer.

**SPIEL-16:** Importierte Spiele und Anhänge erhalten neue Kennungen und werden
als unabhängige Kopien ergänzt. Vorhandene Spiele, deren Anhänge und bestehende
Trainingszuordnungen bleiben unverändert. Ein erneuter Import legt nach erneuter
Bestätigung weitere Kopien an; gleiche Namen lösen keine stille Ersetzung aus.

**SPIEL-17:** Vor einer Übernahme werden das gesamte Paket, seine Formatversion,
Pflichtwerte, Kennzahlen, eindeutigen Paketkennungen, Zuordnungen und PDF-Inhalte
validiert. Beschädigte, unvollständige oder nicht unterstützte Pakete werden
vollständig abgelehnt. Alle Spiele und Anhänge eines Imports werden gemeinsam
übernommen oder gar nicht. Veraltete Vorschauen und Speicherfehler erzeugen
keine Teilimporte; eine Wiederholung nach Fehler fügt nicht unbemerkt doppelte Kopien hinzu.

**SPIEL-18:** Dateidialog-Abbruch verändert keine Daten und erzeugt keine Datei.
Fehlgeschlagene Exporte dürfen eine vorhandene Zieldatei nicht beschädigen.
Exportformat, Versionsregeln und technische Grenzen sind vor Implementierung
festzulegen. Spielpaket, PDF-Spielanleitung und vollständiges Backup bleiben
unterschiedliche, klar benannte Aktionen.

## 7. Verwendung in Trainingseinheiten und Vorlagen

**SPIEL-19:** Der Typ eines Inhaltselements erhält die Auswahl **Spiel**.
Bei diesem Typ erscheint eine optionale Auswahl aus der gespeicherten Spielsammlung.
Ein Block darf ohne ausgewähltes Spiel gespeichert werden; er bleibt dann ein
frei beschreibbarer Spielblock. In einer leeren Sammlung ist dies weiterhin möglich.
Die Auswahl zeigt mindestens Name und Art zur Unterscheidung.

**SPIEL-20:** Die Auswahl referenziert das Spiel über seine Kennung. Sie ersetzt
keinen vorhandenen Freitext, kein Material und keine Blockdauer.
Beschreibung und Anhänge bleiben im Spiel bearbeitbar. Das Entfernen der Auswahl
oder der Wechsel zu einem anderen Blocktyp entfernt nur den Spielbezug,
nicht die Spielstammdaten oder die übrigen Blockdaten.

**SPIEL-21:** Umbenennungen eines Spiels werden bei seinen Verwendungen und in
anschließend erzeugten PDFs sichtbar. Eine Spielbearbeitung verändert keine
individuell eingegebenen Blocktexte oder Minutenangaben und keine bereits
erzeugte PDF-Datei. Ungültige Spielreferenzen dürfen nicht still verschwinden.

**SPIEL-22:** Spielblöcke nehmen wie andere Inhaltsblöcke am bestehenden Zeitmodell
teil. Kopieren von Einheiten und Blöcken, Übernahme vorheriger Inhalte sowie
Speichern und Anwenden von Vorlagen erhalten die optionale Spielauswahl.
Auch der Vorlageneditor unterstützt den Typ Spiel und die optionale Auswahl.
Kopierte Blöcke besitzen eigene Blockkennungen und verweisen innerhalb derselben
Sammlung auf dasselbe Spiel.

**SPIEL-23:** Im PDF einer Trainingseinheit und in Plan-PDFs sowie der zugehörigen
Druckansicht steht bei jedem Spielblock mit Auswahl der Name des Spiels
zusätzlich zu den bisherigen Blockangaben. Dies gilt auch, wenn der Freitext
des Blocks leer ist. Ohne Auswahl wird kein Spielname erfunden.
Spielbeschreibung und Anhänge müssen nicht in den Einheitenausdruck übernommen werden.

## 8. Speicherung, Kompatibilität und bestehender Austausch

**SPIEL-24:** Spiele, Anhänge und Spielbezüge werden dauerhaft lokal gespeichert
und bleiben nach Neustart verfügbar. Ein vollständiges Backup und die zugehörige
Wiederherstellung einschließlich Recovery bewahren die Sammlung, PDF-Inhalte
und alle Referenzen verlustfrei. Eine Sammlung ohne Makrozyklus wird mitgesichert.

**SPIEL-25:** Bestehende Daten und beide bisherigen Backup-Leser bleiben unterstützt.
Alte Daten ohne Spiele erhalten eine leere Sammlung und Blöcke ohne Spielbezug.
Migration und Wiederherstellung bewahren sämtliche vorhandenen Planungs- und
Kompatibilitätsdaten. Speicheränderungen, einschließlich Dateiablage und Recovery,
müssen bei Fehlern konsistent bleiben; fehlende Anhänge dürfen nicht als vollständig
wiederhergestellt gemeldet werden.

**SPIEL-26:** Verlustfreie Makrozyklus- und Vorlagenpakete enthalten künftig auch
alle referenzierten Spiele mit Anhängen. Beim Import werden Spiele und Anhänge
als unabhängige Kopien übernommen und sämtliche Spielbezüge auf ihre neuen
Kennungen umgebogen. Mehrfachverwendungen desselben Spiels innerhalb eines Pakets
bleiben Verweise auf eine gemeinsame importierte Kopie.
Bestehende Pakete ohne Spiele bleiben importierbar. Eine notwendige Erweiterung
der Formatversionen wird ausdrücklich dokumentiert; ältere Anwendungen dürfen
neue Daten nicht unbemerkt verwerfen.

## 9. Abnahmekriterien für Version 1.1

Die folgenden Szenarien sind mit der installierten Desktop-Anwendung offline
auf Windows, macOS und Linux zu prüfen. Browser-Demonstrationen ersetzen diese
Abnahme nicht. Die bestehende Kernplanung und die Version-1-Exportfunktionen
bleiben Regressionstests.

| ID   | Szenario                                                                                                                                 | Erwartetes Ergebnis                                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A-01 | Ohne Makrozyklus Spiele als Einzelspiel, Teamspiel und mit beiden Spielformen anlegen, bearbeiten und neu starten                        | Alle Stammdaten und Kennzahlen bleiben erhalten; Bereich ist unabhängig erreichbar                                           |
| A-02 | Pflichtfelder leeren, Kennzahlen 0, 6 oder 2,5 sowie ungültige oder beide deaktivierte Spielformen über Eingabe oder Import prüfen       | Verständliche Ablehnung; kein ungültiger oder teilweise gespeicherter Datensatz                                              |
| A-03 | Spiel mit null, einem und mehreren PDF-Anhängen speichern; Ursprungsdateien verschieben; neu starten                                     | Alle übernommenen PDFs bleiben vollständig verfügbar                                                                         |
| A-04 | Mehrseitige PDFs einschließlich abweichender Seitenformate öffnen und drucken; einen Anhang entfernen; Dateiauswahl abbrechen            | Vollständiger Druck im ursprünglichen Format; Entfernung bleibt nach Neustart erhalten; Abbruch unverändert                  |
| A-05 | Nicht-PDF, beschädigte, nicht nutzbare und zu große Datei hinzufügen oder importieren                                                    | Klare Fehler und dokumentierte Grenzen; vorhandene Spiele und Anhänge bleiben intakt                                         |
| A-06 | Spielanleitung mit langem Namen, Umlauten und mehrseitiger Beschreibung erstellen, drucken und speichern                                 | Name, Art, vier Kennzahlen, vollständige Beschreibung und Anhangliste lesbar; Abbruch/Fehler verändert keine Daten           |
| A-07 | Einzelspiel und gesamte Sammlung exportieren, in eine andere lokale Installation importieren und neu starten                             | Verlustfreier Austausch einschließlich identischer PDF-Bytes; neue Kennungen; bestehende Datensätze unverändert              |
| A-08 | Import abbrechen, Namen/Kennungen kollidieren lassen, ungültige Version und Speicherfehler prüfen                                        | Vorschau nachvollziehbar; kein stilles Überschreiben, kein Teilimport und keine unbeabsichtigten Duplikate bei Wiederholung  |
| A-09 | Spielblock ohne Auswahl und mit Auswahl speichern; Spiel wechseln, Auswahl leeren und Spiel umbenennen                                   | Optionale Auswahl funktioniert; Blocktext, Material und Minuten bleiben erhalten; neuer Name erscheint bei bestehendem Bezug |
| A-10 | Spielblöcke kopieren, als Vorlage speichern und anwenden; Einheit und Plan als PDF drucken                                               | Bezüge bleiben korrekt; ausgewählter Spielname erscheint auch bei leerem Blocktext; Zeitmodell unverändert                   |
| A-11 | Makrozyklus und Vorlagen mit mehrfach verwendetem Spiel austauschen                                                                      | Spiele und Anhänge vollständig enthalten; alle Bezüge auf dieselbe neue Spielkopie korrekt umgebogen                         |
| A-12 | Vollständiges Backup, Restore und Recovery mit Spielen durchführen; alte Daten, beide alten Backupformate und alte Austauschpakete laden | Neue Daten verlustfrei; bisherige Daten und Kompatibilitätsfelder erhalten; Fehler rollen zusammengehörige Änderungen zurück |

## 10. Umsetzungsvorgaben und Abschluss

Die Verantwortungsteilung aus [ARCHITECTURE.md](ARCHITECTURE.md) gilt weiter:
Angular übernimmt fachliche Validierung und Anwendungsabläufe, Rust lokale
Speicherung, Integrität, atomare Änderungen und privilegierte Dateioperationen.
Neue Abhängigkeiten oder native Fähigkeiten werden vor Einführung in
[TECHSTACK.md](TECHSTACK.md) begründet. Die Umsetzung legt Austauschformat,
Anhangspeicherung, Ressourcenlimits und gegebenenfalls Migrationen fest und
dokumentiert sie vor ihrer Einführung. Allgemeine Dateisystemrechte sind keine
fachliche Voraussetzung dieser Anforderungen.

Version 1.1 ist erst abgeschlossen, wenn alle Anforderungen umgesetzt und
die Abnahmeszenarien samt relevanten Domain-, Transport-, Speicher-, Migrations-
und PDF-Prüfungen belegt sind. Fehlende Plattformprüfungen bleiben offen.
Die native Version-1-Abnahme wird durch diese Erweiterung nicht als erledigt erklärt.
