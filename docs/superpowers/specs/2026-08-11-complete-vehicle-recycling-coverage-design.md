# Vollständige Fahrzeug-Recyclingabdeckung

## Ziel

Die Ansicht „Fahrzeuge recyceln“ unter Logistik soll jedes im importierten
Spielstand gefundene eigene Fahrzeug enthalten. Dazu gehören Straßenfahrzeuge,
Schiffe, Lokomotiven, Waggons, fest gekoppelte Zugverbände und Trackbuilder,
Flugzeuge sowie Hubschrauber. Kein Fahrzeug darf allein deshalb still aus der
Liste verschwinden, weil seine exakte Berechnung noch nicht möglich ist.

Exakt berechenbare Fahrzeuge zeigen weiterhin Exporterlös, Recyclingwert,
Arbeitsaufwand und den besseren Auszahlungsweg. Nicht exakt berechenbare
Fahrzeuge bleiben als sichtbare Zeile erhalten und nennen den konkreten Grund,
beispielsweise ein unaufgelöstes Workshop-Modell oder einen unvollständig
aufgelösten festen Zugverband. Es werden keine fehlenden Werte geschätzt.

## Datenmodell und Berechnung

Der Modellresolver löst neben dem Hauptmodell auch die in `trainSet`
referenzierten festen Bestandteile anhand der vorhandenen Vanilla-, DLC- und
Workshop-Kataloge auf. Reihenfolge und Mehrfachvorkommen der Referenzen bleiben
erhalten. Verschachtelte Verbände werden vollständig, mit Zykluserkennung,
aufgelöst.

Für einen vollständigen festen Zugverband werden die vorhandenen
Produktionsrezepte des Hauptmodells und jedes gekoppelten Bestandteils
zusammengesetzt. Recyclingmaterialien und Arbeitstage entstehen anschließend
aus dieser vollständigen Rezeptur. Damit wird weder nur der sichtbare
Trackbuilder-Kopf berechnet noch ein angehängter Waggon unterschlagen. Die
bestehenden Rundungs- und Float32-Regeln bleiben erhalten und werden in der
Reihenfolge der zusammengesetzten Rezeptzeilen angewandt.

Normale Einzelfahrzeuge ohne feste Bestandteile verwenden unverändert den
bisherigen Berechnungspfad. Ladung bleibt beim normalen Fahrzeugrecycling wie
bisher ausgeschlossen. Container sind keine eigenen Fahrzeuge dieser Ansicht
und werden nicht als zusätzliche Flottenzeilen erfunden.

Kann ein Hauptmodell oder ein referenzierter Bestandteil nicht exakt aufgelöst
werden, erhält der Datensatz einen strukturierten Verfügbarkeitsgrund. Eine
teilweise Rezeptur wird nicht als vollständiger Recyclingwert ausgegeben.

## Logistikoberfläche

Die vollständige Ansicht wird aus allen Datensätzen in `ownedVehicles`
aufgebaut, nicht nur aus erfolgreichen Berechnungsergebnissen. Filter für
Fahrzeugart, empfohlene Aktion und Suche sowie Sortierung und Seitennavigation
bleiben erhalten. Nicht berechenbare Zeilen zeigen Fahrzeugname und Kategorie,
Striche in den Wertespalten und einen verständlichen Statusgrund. Der
Aktionsfilter bietet zusätzlich „Nicht berechenbar“, damit diese Fälle gezielt
geprüft werden können.

Die Zusammenfassung unterscheidet sichtbar zwischen Gesamtbestand,
berechenbaren Fahrzeugen und nicht berechenbaren Fahrzeugen. Dadurch ist direkt
prüfbar, dass die Tabelle den ganzen importierten Fahrzeugbestand abdeckt.

Der bisherige exakte-only Renderpfad bleibt als Legacy-Verhalten hinter
`?fleetRecyclingCoverage=legacy` verfügbar. Standard ist die vollständige
Ansicht. Der Flag akzeptiert nur `complete` und `legacy`; fehlende oder
ungültige Werte fallen auf `complete` zurück.

## Fehler- und Evidenzgrenzen

- Unaufgelöste Workshop-Modelle bleiben sichtbar, erhalten aber keine
  erfundenen Gewichte, Rezepte oder Geldwerte.
- Fehlende oder zyklische `trainSet`-Referenzen machen nur den betroffenen
  Verbund nicht berechenbar; andere Fahrzeuge bleiben verfügbar.
- Doppelte Referenzen in einem festen Zugverband werden doppelt eingerechnet.
- Fehlende Spielstandpreise oder Fahrzeugeinstellungen bleiben als eigener
  Verfügbarkeitsgrund sichtbar und leeren nicht die gesamte Tabelle.
- Schiffe, Straßen- und Luftfahrzeuge sowie normale Bahnfahrzeuge ändern ihre
  belegten Formeln nicht.

## Tests und Verifikation

- Resolver-Tests prüfen einen Trackbuilder mit einem Bestandteil, einen
  Verbund mit mehrfach referenziertem Waggon, eine verschachtelte Referenz,
  einen fehlenden Bestandteil und einen Zyklus.
- Berechnungstests beweisen, dass Hauptfahrzeug und feste Bestandteile genau
  einmal in Material- und Arbeitswerte eingehen, während normale Straße,
  Schiff, Bahn und Luft unverändert bleiben.
- Coverage-Tests verwenden einen gemischten eigenen Bestand und prüfen, dass
  die Anzahl sichtbarer/seitennavigierbarer Zeilen der Anzahl importierter
  Fahrzeuge entspricht, einschließlich nicht berechenbarer Modelle.
- UI-Contract-Tests prüfen Gesamt-, berechenbar- und nicht-berechenbar-Zähler,
  den neuen Statusfilter sowie den Legacy-Flag.
- `npm test` und `node --check js/app.js` müssen vollständig grün sein.
- Ein echter Browsercheck importiert einen Save, öffnet Logistik und prüft mit
  sichtbaren Labels mindestens Straße, Schiff, normalen Zug, Trackbuilder und
  Luftfahrzeug sowie den Abgleich Gesamtbestand gegen Tabellenabdeckung.
