# Verschrottungsprofit über Ost- und Westgrenze

## Ziel

Die Verschrottungsprofit-Tabelle soll für jedes exakt aufgelöste Gebrauchtangebot sichtbar machen, ob sich der Kauf und die anschließende Verschrottung lohnt. Die Tabelle rechnet beide Verkaufswährungen gleichzeitig und zeigt die vier möglichen Grenzrichtungen, soweit die Herkunft des konkreten Angebots belegt ist: Ost → Ost, Ost → West, West → Ost und West → West.

Die bestehende Einzelwährungs-Tabelle wird nicht gelöscht. Sie bleibt als Legacy-Renderpfad erhalten und kann über den Feature-Flag `?scrapProfitTable=legacy` aktiviert werden. Die neue Tabelle ist der Standard.

## Daten- und Berechnungsmodell

`usedveh.bin` liefert einen gemeinsamen Pool von Angeboten. Die sichere Herkunft eines Angebots wird nicht aus dessen rohem Metadatenfeld oder aus einer Verkäuferannahme abgeleitet. Sie kommt aus der autoritativen Fahrzeugdefinition: `costRUB` bedeutet Ostgrenze, `costUSD` bedeutet Westgrenze. Angebote ohne exakte Fahrzeugdefinition oder ohne belegte Herkunft bleiben für die exakte Profitberechnung unverfügbar.

Für jede aufgelöste Offer-Zeile werden zwei Zielwährungen berechnet:

1. Der vorhandene Gebrauchtpreis wird für den tatsächlichen Herkunftsmarkt des Fahrzeugs ermittelt und in die Zielwährung umgerechnet.
2. Der Materialwert der Verschrottung wird an der Zielgrenze mit deren Verkaufspreisen bewertet.
3. Die Arbeits-Opportunitätskosten werden in derselben Zielwährung abgezogen.
4. `Gewinn = Materialwert nach Arbeit - umgerechneter Kaufpreis`.

Damit enthält ein Ost-Angebot die Routen Ost → Ost (RUB) und Ost → West (USD); ein West-Angebot enthält West → Ost (RUB) und West → West (USD). Positive Gewinne werden als kaufenswert markiert, negative oder null Gewinne als nicht rentabel. Die bestehende Rohstoff-, Recycling- und Arbeitskostenlogik bleibt die gemeinsame Grundlage beider Ansichten.

## UI

Die neue Ansicht ersetzt ausschließlich den bisherigen Verschrottungsprofit-Block innerhalb der Logistikoberfläche. Sie bleibt eine einzelne Tabelle ohne Währungs-Switch. Jede Zeile enthält Fahrzeug und Angebotsnummer, die Kaufgrenze sowie einen Zielgrenz-Routenwert mit Kaufpreis, Netto-Materialwert, Profit und Rentabilitätsstatus. Die Tabellenüberschrift nennt die Zielgrenze und Währung ausdrücklich (`Ostgrenze · ₽`, `Westgrenze · $`).

Die Summary zählt profitable Routen, nicht eine künstlich addierte Gesamtsumme, weil dieselbe Offer-Zeile in beiden Zielwährungen profitabel sein kann. Die Tabelle behält auch unrentable, exakt berechnete Angebote und sortiert profitable Routen zuerst; dadurch sind Marktbreite und konkrete Geldbringer gleichzeitig sichtbar. Eine kurze Erläuterung stellt klar, dass die Herkunftsgrenze aus der Fahrzeugdefinition stammt und keine Verkäuferidentität beweist.

Die alte Tabelle wird in eine klar benannte Legacy-Renderfunktion verschoben, ohne ihre bisherige Berechnung oder Spalten zu verändern. Der Runtime-Config-Parser akzeptiert nur `v2` beziehungsweise `legacy` und fällt bei fehlendem oder ungültigem Wert auf `v2` zurück.

## Fehler- und Evidenzgrenzen

- Unaufgelöste Modelle, harte Anhänge, fehlende Herkunftswährung oder fehlende Preis-/Arbeitsdaten erzeugen keine erfundene Route.
- Ein Angebot kann in einer Zielwährung exakt und in der anderen unverfügbar sein; die exakte Route bleibt einzeln sichtbar.
- Das bestehende Verhalten für eigene Fahrzeuge, Ersatzkandidaten und die Legacy-Ansicht wird nicht verändert.
- Die Tabelle zeigt Marktangebote aus dem importierten Save. Sie erzeugt keine zusätzlichen Fahrzeuge, falls `usedveh.bin` nur wenige Angebote enthält.

## Tests und Verifikation

- Unit-Tests prüfen die Border-Zuordnung, beide Zielwährungen, Cross-Border-Berechnungen, vier Route-Kombinationen über Ost-/West-Angebote sowie das Beibehalten unrentabler Angebote.
- UI-Contract-Tests prüfen, dass der Standard die neue Tabelle rendert, der Legacy-Flag den alten Renderpfad auswählt und beide Währungen in der neuen Tabelle vorhanden sind.
- Bestehende Node-Tests bleiben grün.
- Ein Browser-Check importiert einen Save mit Gebrauchtangeboten und verifiziert die sichtbaren Herkunfts-/Zielgrenzen, beide Währungen und die positive/negative Gewinnmarkierung.
