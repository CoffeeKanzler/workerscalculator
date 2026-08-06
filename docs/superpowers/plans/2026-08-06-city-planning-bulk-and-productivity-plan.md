# Stadtplanung: Kategorien-Schnellstart und Produktivität – Implementierungsplan

> Umsetzung im bestehenden Feature-Branch; jede Aufgabe wird testgetrieben
> begonnen und nach der Implementierung separat geprüft.

## Ziel

Die Stadtplanung bekommt einen idempotenten Grundkategorien-Button sowie eine
normale/Worst-Case-Produktivitätsauswertung mit sichtbarer 100-%-Schwelle.

## Aufgabe 1: Pure Kategorie-Erweiterung

**Dateien:**

- Neu: `js/city_planning.js`
- Neu: `tests/city_planning.test.mjs`

- [ ] Exakte zwölf Kategorie-Typen als exportierte Konstante definieren.
- [ ] `addMissingCityCategoryRows(rows)` als pure Funktion implementieren:
      bestehende Zeilen kopieren, je fehlenden Typ `{ type, name: null,
      count: 1, categoryOnly: true }` anhängen und `addedTypes` zurückgeben.
- [ ] Red/Green-Tests für zwölf Einträge, Erhalt vorhandener Zeilen,
      Idempotenz und keine Duplikate schreiben und ausführen.

## Aufgabe 2: Produktivitätsszenarien im Domänenmodell

**Dateien:**

- Modify: `js/calc.js`
- Modify: `tests/calc.test.mjs`

- [ ] Failing tests für normale und Worst-Case-Produktivität mit einer
      synthetischen Schule ergänzen.
- [ ] `evaluateCityProductivityScenarios(city, eco, worstCase)` als reinen
      Wrapper implementieren, der `evaluateCity` zweimal auswertet.
- [ ] Pro Service `requiredProductivity`, `normalUtilization` und
      `worstCaseUtilization` liefern; ohne Kapazität `requiredProductivity:
      null` behalten.
- [ ] Heizungsmodell nicht fälschlich produktivitätsskalieren.

## Aufgabe 3: Stadtplanungs-UI anbinden

**Dateien:**

- Modify: `js/app.js`
- Modify: `js/i18n.js`
- Modify: `css/style.css` nur falls die Szenariospalten eine gezielte
      Kennzeichnung benötigen
- Neu: `tests/city_planning_ui.test.mjs`

- [ ] Neue Helfer und Szenarioauswertung importieren.
- [ ] Default-Stadt um `worstCaseProductivity: 0.5` ergänzen; alte Zustände beim
      Rendern mit demselben Fallback lesbar halten.
- [ ] Button neben „Gebäude hinzufügen“ einbauen; Aktion nur fehlende
      Kategorien ergänzen und danach einmal rendern.
- [ ] Kategorie-Platzhalter im Gebäude-Select als solche kenntlich halten und
      beim konkreten Gebäudewechsel `categoryOnly` entfernen.
- [ ] Normale und Worst-Case-Produktivität in den Einstellungen editierbar
      machen.
- [ ] Servicetabelle um beide Auslastungen, Schwelle und einen klaren
      Überlaststatus erweitern; vorhandene Secret-Police-/Heizwerkzeilen
      beibehalten.
- [ ] Bilinguale Strings und Contract-Tests hinzufügen.

## Aufgabe 4: Gesamtprüfung

- [ ] `node --test tests/city_planning.test.mjs tests/calc.test.mjs
      tests/city_planning_ui.test.mjs`
- [ ] `npm test`
- [ ] Statischen Server starten und die Stadtplanungsseite per Playwright bzw.
      vorhandener Browser-Infrastruktur öffnen; beide Produktivitätsfelder,
      Button und Szenariotabelle prüfen.
- [ ] `git diff --check` und eigenständigen Diff-Review durchführen:
      keine gelöschten alten Stadtzeilen, keine erfundenen Kategorien-
      Kapazitäten, keine Worst-Case-Werte in der normalen Summary.
- [ ] Cache-Marker/Release-Verträge über den Pre-Commit-Hook prüfen, gezielt
      committen und den Feature-Branch pushen.
