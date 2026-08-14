# Vollständiger Vanilla-Wohngebäudekatalog

**Datum:** 2026-08-14  
**Status:** zur Prüfung freigegeben

## Ziel

Jedes durch die offiziellen Spieldateien als auswählbares Wohngebäude belegte
Vanilla- oder offizielle DLC-Gebäude soll im Stadtplaner auswählbar sein.
Workshop-Gebäude bleiben außerhalb dieses automatischen Pfads. Der gemeldete
Fall `dlc3/prefab2` muss als mittleres Wohnhaus mit 68 Einwohnern und 85 %
Wohnqualität erscheinen.

Die extrahierten Datensätze unter `data/game/` bleiben Bestandteil des
öffentlichen Projekts. Als lokale, autoritative Quelle dient die aktuellere
Installation unter `/home/nexx/soviet-game/media_soviet`.

## Belegte Ursache

`data/game/buildings_raw.json` enthält `dlc3/prefab2` bereits mit
`TYPE_LIVING`, 68 Plätzen und 0,85 Wohnqualität. Der getrennte, ursprünglich
aus der Planungstabelle erzeugte Katalog `data/city_buildings.json` enthält
keine entsprechende Zeile.

Die Gebäudedatei enthält zusätzlich
`$MENU_SFX building_residential_medium`. Der heutige Extraktor verwirft dieses
Merkmal. Deshalb kann die Anwendung nicht automatisch erkennen, dass der
Eintrag in die Auswahl für mittlere Wohnhäuser gehört. Derselbe Abgleich zeigt
im aktuellen DLC3-Datensatz 36 explizit über das Spielmenü ausgewiesene
Wohngebäude und 13 fehlende Repräsentationen im Stadtkatalog. Die Tests sollen
diese Zahlen aus den Daten ableiten und nicht als dauerhafte Konstanten
festschreiben.

## Quellen und Vertrauensgrenzen

Die Felder werden nach folgender Rangfolge behandelt:

1. **Spieldatei:** stabile ID, Typ-Flags, Menügruppe, Kapazität,
   Wohnqualität und lokalisierter Name beziehungsweise `NAME_STR`.
2. **Bestehender Stadtkatalog:** gemessene oder aus der Planungstabelle
   stammende Baukosten, Versorgungsverbräuche und weitere Planungswerte.
3. **Nicht verfügbar:** Ein Wert, der in keiner der beiden Quellen belegt ist,
   bleibt ausdrücklich unbekannt. Er wird weder geschätzt noch als null
   ausgegeben.

`COST_RESOURCE_AUTO` beschreibt eine geometrieabhängige Berechnung und liefert
ohne die Berechnungslogik des Spiels keine fertige Materialmenge. Diese Tokens
reichen daher nicht aus, um für neu ergänzte Gebäude belastbare Baukosten zu
behaupten.

## Extraktion

`tools/extract_from_gamefiles.py` übernimmt zusätzlich:

- `$MENU_SFX` als `menuSfx`,
- vorhandenes `$NAME_STR` als stabile Namensquelle, wenn keine numerische
  Lokalisierungs-ID existiert.

Die bestehende Namensauflösung über die BTF-Tabellen bleibt unverändert. Ein
`NAME_STR` wird nicht durch einen leeren Lokalisierungswert überschrieben.

## Zusammenführung im öffentlichen Katalog

Eine kleine, reine Zusammenführungsfunktion erhält den bestehenden
Stadtkatalog und `buildings_raw.json`. Sie arbeitet ohne Mutation der
Eingabedaten.

Automatisch relevant sind offizielle Rohdateneinträge, die alle folgenden
Bedingungen erfüllen:

- `TYPE_LIVING` ist gesetzt,
- `livingSpace` ist größer als null,
- `menuSfx` weist eine reguläre Wohngebäude- oder Wohnheimgruppe aus,
- die ID ist keine Workshop-ID.

Die Funktion gleicht zuerst eine vorhandene stabile `gameId` ab. Für ältere
Tabellenzeilen ohne ID verwendet sie anschließend einen Multimengenabgleich
aus normalisiertem Spielnamen, Kapazität und Wohnqualität. Ein vorhandener
Eintrag wird dabei höchstens einmal verbraucht. Dadurch gelten zwei im Spiel
getrennte Gebäude mit denselben Eckdaten nur dann als vollständig, wenn auch
zwei Kataloginstanzen vorhanden sind.

Vorhandene Katalogobjekte und ihre Planungswerte bleiben unverändert. Für jede
noch nicht repräsentierte Spieldefinition wird ein neuer Eintrag mit `gameId`
und Spiel-Provenienz erzeugt. Die Menügruppen werden zweisprachig abgebildet:

| `menuSfx` | Deutsch | Englisch |
|---|---|---|
| `building_residential_small` | Kleine Wohnhäuser | Small residential buildings |
| `building_residential_medium` | Mittlere Wohnhäuser | Medium residential buildings |
| `building_residential_big` | Große Wohnhäuser | Large residential buildings |
| `building_internat1` | Studentenwohnheim | University halls of residence |

Unbekannte Planungsfelder erhalten `null` und die Provenienz `unavailable`.
Null bleibt ausschließlich echten, belegten Nullwerten vorbehalten.

Der Merge wird einmal nach dem Laden der öffentlichen Datensätze ausgeführt,
bevor Planzeilen, Auswahlfelder oder Save-Importe auf `DATA.cityBuildings`
zugreifen. Der statische Tabellenkatalog bleibt damit als gemessene Quelle
erhalten; die Spielquelle schließt reproduzierbar seine Vanilla-Lücken.

## Berechnung und Darstellung unbekannter Werte

Ein ergänztes Gebäude darf bekannte Einwohnerzahl und Wohnqualität sofort in
die Stadtberechnung einbringen. Unbekannte Versorgungs- und Kostenfelder dürfen
dagegen keine scheinbar exakten Nullsummen erzeugen.

`evaluateCity` meldet deshalb für betroffene Aggregate zusätzlich fehlende
Felder. Eine Baukostensumme ist `null`, sobald mindestens eine ausgewählte
Gebäudeinstanz unbekannte Arbeitstage oder Materialmengen besitzt. Dasselbe
Prinzip gilt für unbekannte Strom-, Wasser-, Heizungs- oder Abfallwerte. Andere
vollständig belegte Kennzahlen bleiben nutzbar.

Die Oberfläche zeigt in der Gebäudeauswahl und den betroffenen Tabellenzellen
`—` beziehungsweise „nicht verfügbar“ sowie einen kurzen Quellenhinweis. Sie
zeigt weder `0` noch eine unmarkierte Teilsumme. Bestehende vollständig belegte
Gebäude behalten ihre heutige Darstellung.

## Tests

Die Änderung folgt Red-Green-Refactor und erhält mindestens folgende
Regressionstests:

1. Der Extraktor bewahrt `MENU_SFX` und `NAME_STR` an einer realistischen
   Gebäudedatei.
2. Der Merge mutiert keine Eingabe und lässt vorhandene Tabellenwerte
   unverändert.
3. Jede relevante offizielle Wohngebäudeinstanz ist nach dem Merge genau
   einmal repräsentiert; Workshop-Daten werden nicht eingemischt.
4. `dlc3/prefab2` erscheint unter „Mittlere Wohnhäuser“ mit 68 Einwohnern,
   85 % Wohnqualität und seiner stabilen ID.
5. Mehrfach vorhandene identische Eckdaten werden als Multimenge behandelt.
6. Unbekannte Bau- oder Versorgungswerte werden nicht als null summiert.
7. Browserprüfung: Der Eintrag ist im Stadtplaner auswählbar und zeigt die
   belegten sowie fehlenden Werte semantisch korrekt.
8. Vollständiger Projekttest, Syntaxprüfung und Cache-Versionstest bleiben
   grün.

## Nicht Bestandteil

- Workshop-Wohngebäude automatisch in den Vanilla-Katalog übernehmen.
- Geometrieabhängige `COST_RESOURCE_AUTO`-Werte schätzen.
- Kartenobjekte ohne belegte reguläre Menügruppe allein wegen `TYPE_LIVING`
  als planbare Wohnhäuser aufnehmen.
- Bestehende Tabellenwerte pauschal durch Rohdaten ohne gleichwertige
  Aussagekraft ersetzen.

## Erfolgskriterien

- Der gemeldete 68-Einwohner-Plattenbau ist sichtbar und auswählbar.
- Der gleiche Fehler kann bei weiteren expliziten Vanilla-Menüeinträgen nicht
  still auftreten.
- Keine unbekannte Kennzahl wird als kostenloser oder verbrauchsloser
  Nullwert dargestellt.
- `data/game/` bleibt öffentlich und aus der lokalen Spielinstallation
  reproduzierbar.
