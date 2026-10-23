# Plan: Theme „HANDHELD" + Gamepad-Bedienung (ASUS ROG Xbox Ally X)

Stand: 23.10.2026 · Branch `claude/vibrant-ride-8ptr55` · baut auf
`theme-tactile/PLAN.md` auf (gleiche Mechanik, gleicher Generator).

## 1. Gerät und Rahmenbedingungen

- 7-Zoll-IPS, 1920×1080, Windows 11 mit üblicherweise 150 % Skalierung
  → **1280×720 CSS-Pixel**, 1 CSS-px ≈ 0,12 mm. Die App erkennt das als
  `tablet-landscape`/`desktop` (Breite ≥ 1024, Querformat).
- Fest verbauter Xbox-Controller (Standard-Mapping der Gamepad API:
  A/B/X/Y, LB/RB, LT/RT, Ansicht/Menü, L3/R3, D-Pad, zwei Sticks) plus
  Touchscreen. Edge/Chrome liefern den Controller nach der ersten Taste über
  `navigator.getGamepads()`.
- Windows-Besonderheit: langer Touch-Druck öffnet das Kontextmenü und
  unterbricht gehaltene Pads/Fader → geräteweit unterdrücken (`touch-guard.js`,
  nur bei Touch/Stift oder aktivem Gamepad, Maus-Rechtsklick bleibt).

## 2. Theme HANDHELD

| Prinzip | Umsetzung |
|---|---|
| Kleines Bild, hoher Kontrast | Fast-Schwarz (`#050607`) als Grund, Panels `#14171D`, Rahmen `#4A5363`, Text `#F7F9FB`. Kontrastbericht ohne Verstöße (Text/Panel 15:1). |
| Lesbarkeit | Mini-Schriften zwei Stufen hoch (8→10, 9→11, 10→11 px). Mehr geht bei 720 px Höhe nicht ohne Layoutbruch. |
| Trefferflächen | `--ctl` 48 px bei grobem Zeiger, Buttons mind. 44 px – wie Tablet, nicht größer (Höhe!). |
| Controller-Fokus | Theme setzt `--gp-focus` (Signal-Grün `#4DFF96`), `gamepad.css` zeichnet daraus Ring + Halo; Tastaturfokus gleichfarbig. |
| Akzente | Orange/Lime/Himmelblau/Magenta/Gelb, eine Stufe satter als TACTILE, da das Display klein und hell ist. |
| Bauteile | Flache Tasten mit harter Unterkante, Pads 12 px Radius, Fader-Kappen mit heller Kante (wie TACTILE). |

Dateien: `handheld.theme.js` (Definition), `touch.css` (Ergonomie), generiert
`handheld.css` via `node theme-tactile/build-css.mjs theme-handheld/handheld.theme.js`.

## 3. Gamepad-Bedienung (`gamepad/gamepad-nav.js`, themenunabhängig)

Eigenständige Schicht über dem gebauten DOM, ohne Eingriff ins Bundle.

| Eingabe | Wirkung |
|---|---|
| D-Pad / linker Stick | Fokus räumlich bewegen (nächstes sichtbares Bedienelement in Richtung; Dialoge begrenzen den Suchraum). Halten = Dauerlauf. |
| A | Auslösen: `pointerdown` beim Drücken, `pointerup`+`click` beim Loslassen → Pads und Tasten lassen sich halten. Checkbox/Radio: Klick, Select: nächste Option. |
| B | Dialog schließen (Close-Button oder `Escape`), sonst Fokus auf die Instrument-Leiste. |
| X / Y | REC / Einstellungen (SETUP). |
| LB / RB | Instrument-Ansicht zurück / vor (Seitenleiste bzw. Phone-Leiste). |
| LT / RT | Fokussierten Regler (`range`/`number`) grob verringern/erhöhen, Halten = Dauerlauf; Select: Option wechseln. |
| Rechter Stick | Waagerecht: Wert fein. Senkrecht: bei Fader/Knopf synthetisches Ziehen (pointerdown/move/up), sonst Liste scrollen. |
| Menü (≡) / Ansicht (⧉) | Master Play/Pause / Master Stop (über die `title`-Attribute der Transportleiste). |
| L3 / R3 | Legende an/aus / Fokus in den Hauptbereich. |

Anker im DOM: `title="Master Play/Pause"`, `title="Master Stop"`,
`title="Einstellungen …"`, Text `REC`, Instrument-Buttons (DRUMS/BASS/…),
`role=dialog`/`[data-ui-modal]`, `aria-label="Close"`. Diese Anker sind
Bundle-Inhalt; ändern sie sich im Quell-Repo, ist die Belegung dort über
`data-gp-*`-Attribute festzuzurren (Abschnitt 5).

Zustand: `html[data-gamepad=active]` solange zuletzt der Controller bedient
wurde (Cursor aus), `idle` nach echter Maus-/Touch-Eingabe. Fokus-Element
trägt `data-gp-focus`. Legende unten mittig, blendet nach 6 s aus, L3 pinnt sie.

## 4. Verifikation

- Playwright mit gefälschtem `navigator.getGamepads()` (Buttons/Achsen
  setzbar): Fokus wandert mit D-Pad, A klickt Buttons und spielt Pads,
  LB/RB wechseln Ansichten, B schließt Einstellungen, RT erhöht Range-Werte,
  Menü startet Play. Screenshots bei 1280×720.
- Kontextmenü: synthetischer Touch-`pointerdown` + `contextmenu` →
  `defaultPrevented`; Maus → nicht unterdrückt.
- Auf dem Gerät: Edge im Vollbild (F11) oder als installierte PWA, Controller
  im „Gamepad"-Modus von Armoury Crate (nicht Desktop-/Maus-Modus).

## 5. Portierung ins Quell-Repo

- Theme wie bei TACTILE in `src/theme/registry.ts` eintragen.
- `touch-guard.js` und `gamepad-nav.js` als Module in `src/input/`
  übernehmen; die DOM-Anker durch `data-gp-action="play|stop|rec|setup"` und
  `data-gp-nav` an den Komponenten ersetzen.
- Fader/Knöpfe sollten `role="slider"` + `aria-valuenow` bekommen, dann kann
  LT/RT statt synthetischem Ziehen direkt den Wert setzen.
- Smoke-Test [36] um `handheld` ergänzen; `index.html` `THEME_COLORS`.

## 6. Grenzen / Risiken

- Custom-Fader und -Knöpfe werden per synthetischem Ziehen bedient; das
  hängt davon ab, dass sie Pointer-Deltas auswerten (Mixer-Fader tun das).
- Nav-/Transport-Anker sind textbasiert; ein Umbau des Bundles kann sie
  brechen (Belegung fällt dann stumm aus, nichts anderes bricht).
- Bei mehreren Controllern wird der erste verbundene genommen.
