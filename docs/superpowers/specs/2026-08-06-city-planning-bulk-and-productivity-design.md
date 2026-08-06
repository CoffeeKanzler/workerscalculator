# Stadtplanung: Kategorien-Schnellstart und Produktivitätsszenarien

## Ziel

Die Stadtplanung soll mit einem Klick eine Grundstruktur der gewünschten
Dienstleistungs- und Gemeindekategorien anlegen können. Der Klick erzeugt je
Kategorie genau eine Planzeile ohne konkretes Gebäude. Dadurch bleibt die
Gebäudeauswahl bewusst offen und kann später pro Zeile verfeinert werden.

Zusätzlich soll die Planung dieselbe Stadt mit einer normalen und einer
separat einstellbaren Worst-Case-Produktivität auswerten. Für jede vorhandene
Dienstleistung werden die Kapazität, die Auslastung beider Szenarien und die
Produktivitätsschwelle für 100 % Auslastung angezeigt. So ist direkt sichtbar,
bei welchem Produktivitätswert eine Dienstleistung nicht mehr ausreicht.

## Umfang

Der Schnellstart deckt diese exakten Gebäudetyp-Kategorien aus den
Gebäudedaten ab:

`Rathaus`, `Einkaufzentrum`, `Alkohol`, `Kindergarten`, `Schule`,
`Universität`, `Polizei`, `Krankenhaus`, `Feuerwehr`, `Kino`, `Sport`,
`Kultur`.

Die Aktion ist idempotent: bereits vorhandene Zeilen desselben Typs bleiben
unverändert, beim erneuten Klick entstehen keine Duplikate. Eine
Kategorie-Platzhalterzeile hat keinen Gebäudenamen und wird deshalb nicht als
konkrete Kapazität in die Rechnung aufgenommen. Wird später ein Gebäude
ausgewählt, wird die Zeile zu einer normalen Planzeile.

Die Produktivitätseingaben sind ein normales Szenario und ein Worst-Case-
Szenario. Für alte Pläne ohne gespeicherten Worst-Case-Wert wird konservativ
`0,50` verwendet; dieser Wert ist eine editierbare Planannahme und keine
behauptete Spielkonstante. Die bestehende normale Produktivität bleibt
unverändert.

## Berechnung

Die bestehende `evaluateCity`-Berechnung bleibt die Quelle für das normale
Szenario. Ein neuer reiner Szenario-Wrapper wertet sie ein zweites Mal mit dem
Worst-Case-Faktor aus. Für einen Dienst `s` gilt weiterhin:

`bereitgestellt = bekannte Kapazität × Produktivität × s.ratio`

und

`Auslastung = Einwohner / bereitgestellt`.

Die für 100 % Auslastung nötige Produktivität wird aus der bekannten Kapazität
abgeleitet:

`Schwelle = Einwohner / (Kapazität × s.ratio)`.

Ohne bekannte Kapazität bleibt die Zeile „nicht ausgewertet“. Das verhindert,
dass Kategorie-Platzhalter, unbekannte Mod-Gebäude oder fehlende
Dienstleistungsdaten als falsche Kapazität erscheinen. Heizung bleibt gemäß
der bestehenden Modellierung produktivitätsunabhängig; bestehende
Geheimpolizei- und Heizwerkzeilen bleiben sichtbar.

## UI

Neben „Gebäude hinzufügen“ erscheint ein Button „Grundkategorien hinzufügen“.
Die ergänzten Zeilen zeigen den Typ, aber weiterhin den normalen
Gebäude-Auswahldialog, damit der Nutzer eine konkrete Variante auswählen kann.

Die Stadt-Einstellungen enthalten beide Produktivitätsfelder. Die
Dienstleistungstabelle erhält Spalten für normale Auslastung, Worst-Case-
Auslastung und die 100-%-Schwelle. Eine Auslastung über 100 % wird als nicht
ausreichend markiert; eine nicht auswertbare Zeile bleibt neutral und wird
nicht mit einem Defizit verwechselt.

## Erhaltung und Grenzen

- Bestehende gespeicherte Stadtzeilen und manuelle Reihenfolge bleiben
  erhalten.
- Der Button löscht oder ersetzt keine alten Einträge.
- Kategorien ohne vorhandenes Nachfrage-Ratio werden nur als Platzhalter
  angelegt; die Funktion erfindet dafür keine Versorgungskapazität.
- Die bestehende normale Stadt-, Versorgungs- und Kostenrechnung wird nicht
  durch Worst-Case-Werte überschrieben.

## Tests

- Reine Helfertests prüfen die zwölf Kategorien, Erhaltung vorhandener Zeilen
  und Idempotenz.
- Reine Berechnungstests prüfen normale/Worst-Case-Auslastung, die korrekte
  Schwelle und den neutralen Zustand ohne Kapazität.
- UI-Vertragstests prüfen beide Eingaben, den Sammelbutton und die neuen
  Szenariospalten.
- Die vollständige Node-Suite sowie ein Browser-Sanity-Check der Stadtplanung
  laufen vor dem Push.
