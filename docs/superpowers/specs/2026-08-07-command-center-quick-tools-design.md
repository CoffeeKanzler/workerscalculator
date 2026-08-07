# Command-Center-Schnellzugriff

## Ziel

Die vier bestehenden Leitstand-Bereiche — Beobachten, Diagnose, Planen und
Vergleichen — sollen als klare Hauptnavigation erkennbar bleiben. Darunter
kommt eine persönliche Schnellzugriff-Leiste, in der häufig verwendete
Werkzeuge direkt erreichbar sind.

## Produkt- und Designrichtung

Die Oberfläche ist eine lokale Betriebsleitstelle für eine Republik: Belege,
Diagnosen, Planannahmen, Karten, Produktionsketten und Stadtplanung sind die
zentralen Begriffe. Die optische Sprache bleibt deshalb bei Blueprint-Blau,
Papier-/Panelflächen, Graphittext und einem gezielten Amber-Akzent für
persönliche Schnellzugriffe.

Die Signatur ist eine zweistufige Werkzeugleiste: oben die vier stabilen
Arbeitsmodi, darunter ein schmaler persönlicher Werkzeugstreifen mit den
gleichen benannten Werkzeugen wie im vollständigen „Weitere Werkzeuge“-Katalog.
Die Schnellzugriffe verwenden keine neuen Parallelrouten, sondern navigieren
über die vorhandenen Tab-IDs.

## Verhalten

- Die bestehende Vierer-Navigation und das Menü „Weitere Werkzeuge“ bleiben
  erhalten.
- Die Schnellzugriffe starten mit `Karte`, `Städte`, `Kettenplan` und
  `LowTech Forschung`, sofern diese Werkzeuge im aktuellen Runtime-Modus
  verfügbar sind.
- Ein lokaler Browser-Schlüssel `wr-command-quick-tools-v1` speichert eine
  validierte, deduplizierte Liste von höchstens acht Tab-IDs.
- Nutzer können Werkzeuge über „Werkzeuge bearbeiten“ hinzufügen oder
  entfernen und die Reihenfolge mit Auf-/Ab-Schaltflächen ändern.
- Ungültige, veraltete oder doppelte gespeicherte IDs werden beim Laden
  verworfen. Eine absichtlich leere Liste bleibt leer.
- Der aktive Schnellzugriff erhält den bestehenden aktiven Navigationszustand;
  jede Navigation bleibt über die bestehende `state.tab`-Logik erreichbar.
- Wenn `localStorage` nicht verfügbar ist, funktioniert die Navigation mit
  den Standardwerten in der aktuellen Sitzung weiter.

## Umsetzung und Tests

- Die lokale Listenverwaltung bleibt als kleine, testbare Helferlogik in
  `js/ui/command_center.js`.
- `renderTabs()` rendert die zusätzliche Leiste und den Editor, ohne die
  vorhandene More-Tools-Positionierungslogik zu verändern.
- CSS setzt die vier Hauptmodi als Blueprint-Rail und die persönlichen Links
  als darunterliegende, amber markierte Ebene ab. Das Editor-Panel bleibt im
  Dokumentfluss, damit es auf kleinen Bildschirmen nicht aus dem Viewport
  läuft.
- Unit-Tests prüfen Defaults, Bereinigung, Deduplizierung, Limit und
  Reihenfolgeoperationen. Ein UI-Vertrag prüft beide Sprachpakete und die
  gerenderte Schnellzugriff-Struktur.

