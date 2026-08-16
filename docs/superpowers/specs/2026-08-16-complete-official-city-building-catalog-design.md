# Vollständiger offizieller Gebäudekatalog der Stadtplanung

**Datum:** 2026-08-16  
**Status:** zur Prüfung freigegeben

## Ziel

Die Stadtplanung soll jedes regulär im Baumenü platzierbare Gebäude aus dem
Basisspiel und den offiziellen DLC1–3 genau einmal anbieten. Bestehende
Stadtpläne, Spreadsheet-Ergänzungen und Mod-Einträge bleiben vollständig
erhalten. Wer bereits Städte geplant hat, darf durch die Erweiterung weder eine
Auswahl noch einen Berechnungswert verlieren oder verändert sehen.

Nicht Ziel ist, interne Spieldefinitionen, namenlose Testobjekte,
`CIVIL_BUILDING`-Kartenbebauung oder CWC-/Workshop-Inhalte automatisch als
offizielle Gebäude einzumischen.

## Belegte Ursache

Die Anwendung besitzt zwei voneinander getrennte Gebäudekataloge:

- `data/game/buildings_raw.json` wird aus den installierten Spieldateien
  extrahiert und enthält derzeit 994 Definitionen aus Basis, CWC und DLC1–3.
- `data/city_buildings.json` wurde ursprünglich aus dem Community-Spreadsheet
  erzeugt und danach nur punktuell mit Spiel-IDs, Wohngebäuden und einzelnen
  Wasserversorgern ergänzt.

Eine frische Extraktion aus `/home/nexx/soviet-game/media_soviet` und
`/home/nexx/media_soviet` stimmt objektgenau mit dem eingecheckten Rohkatalog
überein. Der Rohkatalog ist gegenüber diesen Installationen nicht veraltet.
Veraltet beziehungsweise unvollständig ist der separate Stadtkatalog und sein
Merge: `loadData()` ruft lediglich `mergeVanillaCityResidences()` auf. Andere
offizielle Dienstleistungen, Versorger, Industrien, Lager und
Transportgebäude gelangen deshalb nicht automatisch in `DATA.cityBuildings`.

`data/VERSION.json` nennt weiterhin eine Extraktion vom 2026-07-16 und keinen
Game-Build, obwohl `buildings_raw.json` am 2026-08-14 neu erzeugt wurde. Die
Metadaten müssen beim erneuten Extrahieren zusammen mit dem Katalog aktualisiert
werden; ohne belegten Build darf weiterhin kein Build erfunden werden.

## Aktuelle Bestandsaufnahme

Der eingecheckte Rohkatalog verteilt sich derzeit auf:

- 488 Basisdefinitionen,
- 12 DLC1-Definitionen,
- 52 DLC2-Definitionen,
- 265 DLC3-Definitionen,
- 177 CWC-Definitionen.

Nach Ausschluss von CWC, `CIVIL_BUILDING` und Definitionen ohne Namen bleiben
im aktuellen Snapshot 727 Kandidaten. Diese Zahl dokumentiert nur den heutigen
Snapshot. Vollständigkeitstests leiten die erwartete Menge aus den
Eligibility-Regeln ab und frieren nicht die Zahl 727 als dauerhafte Konstante
ein.

## Gewählte Architektur

Die Anwendung erhält einen allgemeinen, reinen Laufzeit-Merge für offizielle
Stadtgebäude. Er ersetzt den nur auf Wohngebäude begrenzten Merge als neue,
explizit schaltbare Katalogstrategie.

```text
Spreadsheet-Stadtkatalog ─┐
                          ├─ mergeOfficialCityCatalog() ─ Auswahlkatalog
Spiel-Rohkatalog ─────────┤
Spiel-Produktionsdaten ───┘
```

Der bestehende Stadtkatalog bleibt die unveränderte, geordnete Basis. Der Merge
mutiert keine Eingabe, verschiebt keine bestehende Zeile und hängt nur neue
offizielle Gebäude an. Ein explizites Feature-Flag wählt zwischen der bisherigen
Legacy-Auswahl und der vollständigen offiziellen Neuauswahl. Die neue Auswahl
ist nach bestandener Migration standardmäßig aktiv; die Legacy-Auswahl bleibt
als sofortiger Rollback erhalten. Die Auflösung bereits gespeicherter IDs bleibt
davon getrennt und immer verlustfrei verfügbar.

Als Legacy-Basis gilt der tatsächlich bisher zur Laufzeit erzeugte Katalog:
statischer Stadtkatalog plus der bestehende append-only-Wohngebäude-Merge. Nicht
nur die statische JSON-Datei, sondern dieses vollständige Ergebnis bleibt ein
identischer Präfix. Damit behalten auch bereits angehängte offizielle
Wohngebäude ihre bisherigen Indizes.

Eine komplette Offline-Neugenerierung von `city_buildings.json` wurde verworfen,
weil sie Spreadsheet- und Mod-Daten unnötig duplizieren und erneut einen
manuell zu aktualisierenden Parallelkatalog erzeugen würde. Das direkte
ungefilterte Anhängen aller Rohdefinitionen wurde verworfen, weil es interne
Objekte, Duplikate und falsche Nullwerte erzeugen würde.

## Zulässige offizielle Gebäude

Eine Rohdefinition ist automatisch zulässig, wenn alle folgenden Bedingungen
erfüllt sind:

1. Die ID gehört zum Basisspiel oder beginnt mit `dlc1/`, `dlc2/` oder `dlc3/`.
2. Die ID gehört weder zu `cwc/` noch zu einer numerischen Workshop-ID.
3. Ein deutscher, englischer oder literaler `$NAME_STR`-Name ist vorhanden.
4. Die Typflags enthalten nicht `CIVIL_BUILDING`.
5. Die Definition ist keine explizit belegte interne Test-/Hilfsdefinition.

Die zunächst belegte explizite Denylist enthält:

- `water_switch_test` (interner, namenloser Wasser-Switch-Test),
- `eletric_transformator_customout` (namenloser Border-Import-Hilfsstub).

Die Denylist bleibt auch dann wirksam, wenn eine spätere Spielversion diesen
Definitionen Namen gibt. Neue Ausnahmen benötigen jeweils ID, Quelldatei und
eine überprüfbare Begründung.

`$MENU_SFX` ist ein hilfreiches Klassifikationssignal, aber kein alleiniger
Eligibility-Schalter: regulär platzierbare Gebäude können es vermissen. Ein
Forschungs- oder Jahres-Lock schließt ein Gebäude nicht aus; es bleibt ein
reguläres Spielgebäude und wird lediglich im Spiel erst später verfügbar.

Die Eligibility-Logik lebt in einer kleinen reinen Funktion. Bewusste
Ausnahmen werden mit Spiel-ID und Begründung geführt, nicht über unscharfe
Namensmuster. Ein Test verlangt, dass jede neue nicht klassifizierbare
offizielle Definition den Build sichtbar fehlschlagen lässt, statt still zu
verschwinden.

Ökonomische Eigenschaften wie Personal, Produktion oder Verbrauch sind keine
Eligibility-Filter. Andernfalls würden regulär platzierbare Leitungs-, Schalt-,
Speicher- und sonstige Infrastrukturteile verloren gehen. Für offizielle
Spieldefinitionen ist die `gameId` die Identität; der Anzeigename ist niemals
allein ein Deduplizierungsschlüssel.

## Deduplizierung

Der Merge arbeitet als Multimengenabgleich; jede Legacy-Zeile und jede
Spieldefinition darf höchstens einmal verbraucht werden.

Priorität:

1. exakte vorhandene `gameId`,
2. eindeutiger lokalisierter Name plus semantische Gebäuderolle,
3. bei mehrfachen Namen eine strenge Signatur aus Rolle, Einwohnerzahl,
   Wohnqualität, Gesamtpersonal und Servicekapazität,
4. andernfalls keine geratene Zuordnung.

Vorhandene passende Zeilen behalten sämtliche Planungswerte und ihre Position.
Auch ihre Objekte werden nicht umgeschrieben. Die Zuordnung zu einer offiziellen
Definition und abgeleitete Darstellungsmetadaten liegen in einem separaten
Laufzeitindex. Nicht zuordenbare offizielle Definitionen werden als neue Zeilen
angehängt.

Eine mehrdeutige alte Vanilla-Zeile bleibt intern und für bestehende Pläne
erhalten, erscheint aber nicht zusätzlich in der normalen Neuauswahl, wenn
vollständige offizielle Varianten denselben Platz einnehmen. Verwendet ein
alter Plan diese Zeile bereits, wird sie in genau diesem Auswahlfeld weiterhin
als gültige ausgewählte Option angeboten.

Gleichnamige echte Spielvarianten sind keine Duplikate. Ihre Labels werden
durch DLC, Arbeiter, Einwohner oder Servicekapazität unterschieden. Bleibt ein
Label danach mehrdeutig, wird nur dann die kurze stabile Spiel-ID ergänzt.

## Datenmodell und Quellenrangfolge

Neue offizielle Zeilen tragen mindestens:

- `gameId`, lokalisierte Namen, `dlc` und `kind: "Vanilla"`,
- eine getrennte `catalogGroup` für Navigation und Darstellung,
- den bestehenden berechnungsrelevanten `type`,
- Einwohnerzahl und Wohnqualität, wenn durch die Spieldatei belegt,
- getrennte Felder für Arbeiter und Professoren sowie daraus abgeleitetes
  Gesamtpersonal,
- eine nur typgesteuert zugeordnete Servicekapazität und explizite Provenienz,
- alle Stadtplanungsfelder entweder als belegte Zahl oder als `null`.

Quellenrangfolge pro Feld:

1. vorhandene Legacy-Zeile mit bereits verwendeten Spreadsheet-/Messwerten,
2. exakte direkte Spielwerte aus `buildings_raw.json`,
3. bereits in `game/production_buildings.json` verwendete und gekennzeichnete
   Ergänzungen für exakt dieselbe `gameId`,
4. `null` mit Provenienz `unavailable`.

Der Rohkatalog ist nur für direkte Spielfakten maßgeblich: Identität,
Lokalisierung, DLC, Typflags, Arbeiter, Professoren, Wohnplätze,
Wohnqualität und `citizenAbleServe`. Der Produktionskatalog liefert nur exakt
ID-zugeordnete Planner-Zusatzfelder samt Provenienz, darunter Energie, Wasser,
Abfall pro Arbeiter, Arbeitstage und Baumaterialien. Ein dort numerisch als `0`
gespeicherter Wert mit Provenienz `unavailable` wird beim Mapping zwingend zu
`null`; er ist kein belegter Nullverbrauch.

Unbekannt ist nicht null im fachlichen Sinn: Ein fehlender Wert wird niemals
als kostenlose Bauleistung oder als verbrauchsfreies Gebäude summiert.
`evaluateCity()` behält seine Null-Propagation für unvollständige Versorgungs-
und Baukostensummen bei.

`WORKERS_NEEDED` und `PROFESORS_NEEDED` bleiben getrennt erhalten und werden für
den städtischen Gesamtpersonalbedarf addiert. Eine bestehende Legacy-Zeile wird
dabei niemals mit einem vermeintlich exakteren Rohwert überschrieben. Für neue
Zeilen folgt eine nominelle Servicekapazität nur bei den dafür explizit
unterstützten Servicetypen der validierten Spielsemantik
`WORKERS_NEEDED × CITIZEN_ABLE_SERVE`; Professoren erhöhen den Personalbedarf,
aber nicht ein zweites Mal diese Kapazität. Ein Rohwert `0` ersetzt insbesondere
keine belegte Legacy-Kapazität.

`wastePerWorker` wird entweder als getrenntes Quellenfeld erhalten oder
nachvollziehbar mit dem effektiven Gesamtpersonal in das City-Feld `waste`
umgerechnet. Es darf weder still fallengelassen noch ohne Einheitenbezug direkt
als Gesamtwert kopiert werden.

Produktionsmengen und Produktionsprofit bleiben in der Produktionsplanung.
Eine Fabrik in der Stadtplanung beeinflusst nur belegte Stadtwerte wie
Personal, Versorgung und Baukosten.

## Klassifikation

`catalogGroup` und berechnungsrelevanter `type` werden getrennt behandelt.
Damit verändert eine übersichtliche Gruppierung keine Serviceformel.

Hauptgruppen:

- Wohnen,
- Bürgerservice,
- Industrie,
- Versorgung,
- Transport,
- Lager,
- Sonstiges.

Bekannte Serviceflags werden explizit auf die bestehenden Stadtsemantiken
abgebildet, zum Beispiel `TYPE_SCHOOL → Schule`, `TYPE_KINDERGARTEN →
Kindergarten`, `TYPE_UNIVERSITY → Universität`, `TYPE_HOSPITAL → Krankenhaus`
und `TYPE_SHOP → Einkaufzentrum`. Nicht modellierte Typen zählen Personal und
andere belegte Summen, erzeugen aber keine erfundene Serviceabdeckung.

Die Zielspalte der Kapazität wird ebenfalls ausschließlich über diese
Typzuordnung gewählt: Krankenhaus, Schule, Universität, Kindergarten, Einkauf
und Attraktionen verwenden `visitors`; Gericht und Polizei verwenden `special`.
Secret Police und Heizwerke behalten ihre vorhandene Sonderlogik. Weder das
größere vorhandene Zahlenfeld noch die Produktionsgruppe darf über `visitors`
versus `special` entscheiden. Produktions-`group` ist nur Hilfsmetadatum und
überschreibt niemals den berechnungsrelevanten City-`type`.

## Persistenz und Abwärtskompatibilität

Die Erweiterung hat eine harte Zero-Loss-Garantie:

- Der Legacy-Katalog bleibt ein identischer Präfix des neuen Laufzeitkatalogs.
- Bestehende Objekte, Indizes, Namen und Berechnungswerte bleiben unverändert.
- Neue Gebäude werden ausschließlich angehängt.
- Alte Stadtpläne werden beim Laden nicht automatisch umgeschrieben.
- Alte Zeilen lösen weiterhin über `buildingIndex` und Name auf.
- Neue Auswahlen speichern zusätzlich optional `buildingGameId`.
- Ein zentraler Resolver ersetzt die heute dreifach vorhandene Logik in
  City-Ansicht, Workforce-Auswertung und Republic-Overview. Seine Reihenfolge
  lautet: `importedBuilding`, auflösbare `buildingGameId`, `buildingIndex`,
  Legacy-Name.
- Eine vorhandene, aber inzwischen unbekannte `buildingGameId` blockiert den
  Legacy-Fallback nicht. Der Resolver versucht weiterhin Index und Name; nur
  wenn auch diese scheitern, bleibt die unveränderte Auswahl ausdrücklich
  unavailable.
- Geteilte Links, Legacy-LocalStorage und IndexedDB-Planungen bleiben lesbar.
- Ein optionales neues Feld wird von älteren Datenformen ignoriert und von
  Share-/Autosave-Pfaden sicher erhalten, soweit diese Planung exportieren.

Beim Typwechsel, Leeren oder bewussten Wechsel einer Zeile werden
`buildingGameId`, `buildingIndex` und Name immer gemeinsam gepflegt. Ein
optionaler ID-Backfill alter Zeilen erfolgt nur bei einer eindeutigen Auflösung
aus dem bereits gültigen Index, niemals durch bloßes Namensraten.

Keine bestehende Stadt darf nach dem Update andere Einwohner-, Personal-,
Service-, Versorgungs- oder Baukostenergebnisse liefern. Die Garantie gilt
nicht nur für das Laden, sondern auch für erneutes Speichern, Teilen und das
Öffnen des Gebäudeauswahlfelds.

## Oberfläche

Die bestehende zweistufige Auswahl bleibt grundsätzlich erhalten. Der neue
Katalog ergänzt:

- die sieben Hauptgruppen,
- Suche über deutschen Namen, englischen Namen und Spiel-ID,
- `[DLC]` für offizielle DLC-Gebäude,
- evidenzbasierte Details zu Personal, Einwohnern und Kapazität,
- einen sichtbaren Hinweis bei unvollständigen Planungswerten.

Bestehende ausgewählte Legacy-Zeilen bleiben sichtbar. Die Oberfläche fordert
keine Migration und zeigt beim bloßen Öffnen einer bestehenden Stadt keine
neuen Warnungen. Erst die bewusste Auswahl eines neuen unvollständig belegten
Gebäudes kann betroffene Summen als nicht verfügbar kennzeichnen.

## Feature-Flag und Rollback

Ein explizites Konfigurationsflag `officialCityCatalog` kontrolliert nur die
Neuauswahlstrategie:

- `true`: Legacy-Präfix plus deduplizierte offizielle Ergänzungen,
- `false`: exakt die bisherige Legacy-Auswahl.

Das Flag verändert keine gespeicherten Daten. Der vollständige ID-Resolver
bleibt auch im Legacy-Auswahlmodus verfügbar, damit ein bereits bewusst
gewähltes neues Gebäude bei einem Rollback weiter berechnet und angezeigt wird.
Nur neue Auswahlangebote werden zurückgeschaltet. Ein Rollback benötigt daher
weder eine Migration noch das Löschen neuer Felder und biegt keine Auswahl auf
ein anderes Gebäude um.

## Fehlerfälle

- Unbekannte offizielle Definition: Completeness-Test schlägt fehl.
- Mehrdeutige Legacy-Zuordnung: nicht raten; offizielle Varianten ergänzen und
  die alte Zeile nur für bestehende Verweise bewahren.
- Fehlender Name: nicht in die reguläre Auswahl aufnehmen; ID im Audit melden.
- Fehlende Bau-/Versorgungswerte: `null`, Provenienz `unavailable`, Anzeige `—`.
- Nicht mehr bekannte `buildingGameId`: erst auf alten Index/Namen
  zurückfallen; Auswahl und gespeicherte Daten bei vollständigem Fehlschlag
  erhalten und ausdrücklich unavailable anzeigen.
- Feature-Flag aus: exakt den Legacy-Auswahlpfad verwenden, bereits gespeicherte
  neue IDs aber weiterhin über den vollständigen Resolver auflösen.

## Tests

### Daten- und Merge-Tests

1. Jede nach den Regeln zulässige offizielle ID erscheint nach dem Merge genau
   einmal.
2. CWC, Workshop, `CIVIL_BUILDING`, namenlose und belegte interne Definitionen
   werden nicht automatisch aufgenommen.
3. Der Test leitet die erwartete Menge aus der Quelle ab und verwendet keine
   dauerhaft festgeschriebene Gesamtzahl.
4. Der Merge mutiert keine Eingabe und bewahrt den Legacy-Präfix einschließlich
   Objektidentität und Reihenfolge.
5. Exakte und mehrdeutige Namensfälle beweisen den Multimengenabgleich.
6. Gleichnamige echte Varianten erhalten eindeutige Labels und Optionswerte.
7. Unbekannte Zahlen bleiben `null`; nur belegte echte Nullwerte bleiben `0`.
8. Personal, Professoren und Servicekapazität folgen der festgelegten Semantik.
9. Produktionswerte mit Provenienz `unavailable` werden zu `null`, niemals zu
   einer scheinbar exakten `0`.
10. Produktions-`group` verändert nie den City-`type`; `visitors` und `special`
    werden ausschließlich über die explizite Servicezuordnung gefüllt.
11. Die explizit denylisteten IDs bleiben ausgeschlossen; der Test prüft die
    abgeleitete ID-Menge statt nur eine leicht irreführende Gesamtzahl.

### Kompatibilitätstests

1. Repräsentative alte Planobjekte aus LocalStorage, IndexedDB und Share-Daten
   werden vor und nach Aktivierung des neuen Katalogs geladen.
2. Gebäudeauflösung und sämtliche `evaluateCity()`-Ergebnisse bleiben identisch.
3. Öffnen und erneutes Speichern verändert alte Zeilen nicht still.
4. Ein bestehender mehrdeutiger Legacy-Eintrag bleibt im eigenen Auswahlfeld
   erhalten, wird aber nicht als neue Dublette angeboten.
5. Neue Zeilen lösen nach einer Katalogerweiterung stabil über `buildingGameId`
   auf; eine veraltete ID fällt auf Index und Name zurück.
6. Typwechsel und Leeren entfernen ID, Index und Namen gemeinsam.
7. City-Ansicht, Workforce und Republic-Overview verwenden denselben Resolver.
8. Der Legacy-Flagpfad reproduziert den bisherigen Auswahlkatalog, kann aber
   bereits gespeicherte neue IDs weiterhin auflösen.

### Browser- und Release-Tests

1. Suche, Gruppen, DLC-Markierung und gleichnamige Varianten werden in Deutsch
   und Englisch mit echter Browserinteraktion geprüft.
2. Bestehende gespeicherte Städte werden im Browser geöffnet und mit einem
   Vorher-Snapshot der Ergebnisse verglichen.
3. Hell/Dunkel sowie ein schmales und ein breites Layout bleiben benutzbar.
4. Der vollständige Projekttest, Syntaxprüfung, Cache-Marker und ein frischer
   Browserlauf müssen grün sein.
5. Vor der Veröffentlichung wird auf das weitergelaufene `origin/main`
   rebased; fremde ungetrackte Dateien bleiben unangetastet.

## Rollout

1. Reine Eligibility-, Mapping- und Merge-Modelle mit TDD implementieren.
2. Persistenzauflösung und optionale stabile ID ergänzen.
3. Neuen Auswahlkatalog und Suche hinter dem Feature-Flag integrieren.
4. Legacy- und neue Browserpfade gegeneinander prüfen.
5. Aktuelle Wasserergänzungen in denselben Merge einordnen und Duplikate
   ausschließen.
6. Datenmetadaten korrigieren, ohne einen unbekannten Game-Build zu erfinden.
7. Erst nach vollständiger Verifikation und Review gemeinsam nach `main`
   veröffentlichen.

## Erfolgskriterien

- Jedes regulär baubare offizielle Basis-/DLC1–3-Gebäude ist genau einmal neu
  auswählbar.
- CWC, Workshop und Karten-/Testdefinitionen werden nicht versehentlich als
  offizielle Gebäude ausgegeben.
- Kein bestehender Stadtplan verliert oder verändert eine Gebäudeauswahl oder
  einen Berechnungswert.
- Gleichnamige Varianten sind unterscheidbar, ohne sichtbare Scheindubletten.
- Unbekannte Werte werden nie als Null oder als scheinbar exakte Teilsumme
  dargestellt.
- Der Legacy-Katalog bleibt ohne Datenmigration sofort aktivierbar.
