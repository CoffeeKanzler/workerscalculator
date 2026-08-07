# Stadtplanung: Werkstätten als eigene Kategorie

## Ziel

Werkstätten sollen in der Stadtplanung sichtbar und planbar sein. Für jede
Werkstatt sollen Anzahl und exakter Arbeiterbedarf in der Stadtbilanz erscheinen.
Die Stadtplanung darf dabei keine nicht belegten Einwohner-, Service-,
Versorgungs- oder Produktionswerte erfinden.

## Bestehende Grenzen

- `data/city_buildings.json` enthält Wohn- und Stadtgebäude mit den Feldern,
  die `evaluateCity` berechnen kann.
- `data/game/production_buildings.json` enthält Produktionsgebäude und bereits
  die Kategorie `Werkstätten`, darunter `dlc3/h_repair_station`.
- Der Produktionsplaner verwendet `prodBuildings()`, der Stadtplaner dagegen
  ausschließlich `DATA.cityBuildings`.

## Design

Die Stadtplanung erhält eine eigene, exakt abgegrenzte Werkstatt-Kategorie.
Werkstattzeilen verwenden die Produktionsdatenquelle und werden über einen
stabilen Datensatzverweis ausgewählt. Die Auswahl zeigt mindestens den
Gebäudenamen, die Kategorie und den belegten Arbeiterwert.

Werkstattzeilen tragen nur diese Stadtplanungswirkung:

- `count` multipliziert den exakten `workers`-Wert und erhöht den
  Arbeiterbedarf der Stadt.
- Einwohner, Wohnqualität, Servicekapazität, Strom, Wasser, Warmwasser,
  Abwasser, Baukosten und Produktions-/Verbrauchsraten bleiben für die
  Werkstattzeile neutral bzw. unavailable, sofern keine exakten Felddaten
  vorhanden sind.
- Die Zeile bleibt von normalen `city_buildings`-Zeilen getrennt, damit
  `evaluateCity` keine Produktionsgebäude als Stadtservices interpretiert.

Die vorhandenen Stadtgebäude bleiben unverändert. Die bisherigen generischen
„Werkstatt klein/mittel/groß“-Einträge im Stadtgebäude-Datensatz werden nicht
automatisch umklassifiziert; sie bleiben dort, wo ihre bestehenden Stadtwerte
berechnet werden.

## Datenfluss

1. Der Stadtplaner baut seine normale Stadtgebäudeauswahl wie bisher aus
   `DATA.cityBuildings`.
2. Eine zusätzliche Kategorie `Werkstätten` wird aus `prodBuildings()`
   abgeleitet, deren `group[state.lang]` exakt `Werkstätten` bzw. `Workshops`
   entspricht.
3. Eine Werkstattzeile speichert einen eindeutigen Produktions-Gebäudeverweis
   und ihre Anzahl. Sie wird nicht in die normale Gebäudetyp-/Servicekarte
   aufgenommen.
4. Die Stadtbilanz addiert den Werkstatt-Arbeiterbedarf zu den geplanten
   Arbeitern. Andere Stadtkennzahlen bleiben unverändert.
5. Export, Import und Save-Migration behalten bestehende Stadtzeilen und
   unbekannte Werkstattverweise sicher bei; ein nicht mehr auflösbarer Verweis
   wird als unavailable angezeigt und nicht geschätzt.

## UI

Die Stadtplanung erhält eine zusätzliche Werkstatt-Tabelle oder einen klar
getrennten Abschnitt mit den Spalten Gebäude, Anzahl und Arbeiter. Die
Werkstattzeile kennzeichnet ihre Datenquelle als Produktions-/Game-Fact und
zeigt für nicht berechnete Werte einen Gedankenstrich bzw. den bestehenden
Unavailable-Hinweis.

## Tests

- Stadtplanung listet die Pferdearzt-und-Tischlerei-Datenquelle als
  Werkstattoption.
- Zwei geplante Werkstätten mit zehn Arbeitern ergeben exakt 20 zusätzliche
  Arbeiterbedarfseinheiten.
- Werkstätten ändern weder Einwohner noch Service-, Strom-, Wasser- oder
  Produktionsbilanz.
- Normale Stadtgebäude und die vorhandene Produktionsplanung bleiben
  unverändert.
- Ein fehlender/ungültiger Werkstattverweis führt zu unavailable statt zu
  einem geratenen Gebäude oder Wert.
- Bestehende vollständige Tests, Cache-Marker und Browser-UI-Verträge bleiben
  grün.

## Bewusste Nicht-Ziele

- Keine automatische räumliche Platzierung oder Karten-Geometrie für neue
  Werkstattzeilen.
- Keine erfundenen Reparatur-, Tischlerei- oder Produktionsraten.
- Keine Umklassifizierung aller generischen Stadtgebäude mit „Werkstatt“ im
  Namen.
