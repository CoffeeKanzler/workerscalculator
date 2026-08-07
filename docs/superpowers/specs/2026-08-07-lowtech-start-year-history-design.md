# LowTech-Startjahr aus der Historie

## Ziel

Der LowTech-Rechner soll das Startjahr automatisch aus der geladenen
`stats.ini`-Historie übernehmen, wenn diese als exakte Save-Daten vorliegt.
Damit entfällt die manuelle Eingabe für Spielstände, deren Historie verfügbar
ist.

## Verhalten

- `lowTechSaveValues()` liefert zusätzlich `startYear`, wenn
  `saveImport.sourceStatus.stats` den Wert `exact` hat und `statsRecords`
  mindestens ein ganzzahliges `year` enthält.
- Das kleinste gültige Jahr wird verwendet. Die Reihenfolge der Datensätze ist
  daher unerheblich.
- Bei fehlender, nicht-exakter oder unbrauchbarer Historie wird kein
  `startYear` erfunden. Der bisherige Planwert bleibt sichtbar.
- Der bestehende automatische/manuelle Modus bleibt unverändert: Im
  automatischen Modus wird der importierte Wert angezeigt, eine manuelle
  Änderung sperrt ihn, und die Rückkehr zu den Spielstandwerten entsperrt ihn.
- Der LowTech-Hinweis nennt das Startjahr als Historienwert, wenn es verfügbar
  ist; ohne diesen Wert bleibt der Hinweis beim manuellen Fallback.

## Datenfluss

`state.statsRecords` und `state.saveImport.sourceStatus.stats` werden an
`lowTechSaveValues()` übergeben. Die Funktion erzeugt nur bei exakter Quelle
den zusätzlichen Wert. `renderResearch()` verwendet ihn über die bestehende
`lowTechDisplayValues()`-Zusammenführung, ohne `state.lowtech.startYear` im
automatischen Modus zu überschreiben.

## Tests

- Frühestes Jahr wird aus einer unsortierten Historie gewählt.
- Fehlende oder nicht-exakte Historie liefert keinen Startjahrwert.
- Der bestehende manuelle Override bleibt gegenüber allen Save-Werten
  vorrangig.

