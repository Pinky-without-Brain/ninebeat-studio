# Plan: Theme „TACTILE" – ein Theme für Finger statt Maus

Stand: 23.10.2026 · Branch `claude/vibrant-ride-8ptr55`

## 1. Ausgangslage

- Dieses Repository enthält nur den **gebauten** Vite-Output (siehe README).
  Der Quelltext (u. a. `src/theme/registry.ts`, `src/theme/runtime.ts`,
  Tailwind-Konfiguration, `tests/smoke.mjs`) liegt im privaten Repo.
- Ein Theme besteht aus zwei Hälften, die zusammenpassen müssen:
  1. **CSS-Variablen** im Stylesheet unter `[data-theme=<id>]`
     (ca. 1 300 Variablen: `--hw-*` Oberflächen, `--<instrument>-*` Akzente,
     `--led-*`, `--pal-*` Tailwind-Palette, `--tint-*`, `--crt-*`,
     `--shadow-*`, Dekor, `--glow-scale`).
  2. **ThemeDefinition** im JS-Bundle (`{id, name, tagline, scheme,
     metaThemeColor, tokens:{surface, text, overlay, led, accents, shadow,
     decor, glowScale, crt, palette, tint}}`). Komponenten lesen diese Tokens
     zur Laufzeit (Theme-Karte in den Einstellungen, CRT-Oszilloskop,
     LED-Farben, Kontrast-Absenkung `xx()` für helle Themes).
- Die Laufzeit (`applyTheme`) setzt nur `data-theme` plus die beiden
  Meta-Tags; die Variablen kommen statisch aus dem CSS. Die Theme-Liste
  (`THEME_IDS`) und das Registry-Objekt (`THEMES`) werden über
  `window.__theme` nach außen gereicht, die Einstellungs-Karten iterieren
  direkt darüber.
- Touch-Stand heute: `--ctl` 32 px, bei `pointer:coarse` 44 px; Buttons
  mind. 44 px bei grobem Zeiger; Range-Inputs bekommen 20 px unsichtbares
  Polster. Aber: **278× `text-[10px]`, 114× `text-[9px]`, 67× `text-[8px]`**
  im Bundle, Hover-Zustände ohne `@media (hover: hover)` (kleben auf Touch),
  Glow-/Schatten-Sprache, die auf Tablets im Hellen schlecht lesbar ist, und
  Zustände (aktiv/gedrückt), die überwiegend über Leuchten statt über Fläche
  kommuniziert werden.

## 2. Ziel und Gestaltungsprinzipien

Zielgeräte: iPad quer (Hauptfall, Home-Screen-App), Phone quer/hoch,
Touch-Monitore am Rechner. Der Finger verdeckt, was er drückt, hat keinen
Hover und trifft ±4 mm ungenau.

| Prinzip | Konsequenz im Theme |
|---|---|
| **Groß genug** | `--ctl` 52 px (grob) / 40 px (fein); Buttons, Selects, Checkbox-Labels mind. 48 px; Range-Polster 24 px. |
| **Zustand als Fläche** | Aktiv = volle Akzentfläche mit dunkler Schrift (`on`-Token), nicht Glow. `--glow-scale` 0.3, LEDs leuchten dezent. |
| **Sofortiges Druck-Feedback** | `:active` senkt den Button um 1 px, verstärkt Helligkeit; harte 2-px-Unterkante („Taste") statt weicher Schatten. |
| **Hoher Kontrast, matt** | Dunkles Graphit (kein reines Schwarz, keine Spiegelungen), Text ≥ 7:1, gedämpfter Text ≥ 4.5:1, Akzent auf Panel ≥ 3:1, Rahmen sichtbar (`--hw-border` deutlich heller als Fläche). |
| **Kein Hover nötig** | Alles, was heute nur per Hover auffällt, muss ohne auskommen; Fokusring 3 px Bernstein für Tastatur/Switch-Control. |
| **Kein System-Flackern** | `-webkit-tap-highlight-color: transparent`, `touch-action` bleibt wie in der App (`touch-none` am Body). |
| **Instrument-Farben bleiben erkennbar** | Drums Orange, Bass Lime, Sampler Himmelblau, Poly6 Magenta, Master Gelb – dieselben Hue-Familien wie bisher, aber satter und auf dunklem Graphit kontraststärker. |
| **Größere Radien, dickere Linien** | Pads 14 px Radius, 2-px-Rahmen; Fader-Kappen 8 px Radius mit heller Kante; CRT-Strahlen 2.2 px breit. |
| **Mini-Schriften anheben** | 8 px → 9 px, 9 px → 10 px (nur in diesem Theme, per Screenshot auf Überlauf prüfen). |

Name/ID: `tactile` · Anzeigename **TACTILE** · Tagline „Groß, griffig,
kontrastreich – gebaut für Finger statt Maus." · Schema: dunkel ·
`metaThemeColor` `#0F1115`.

## 3. Farbwelt

Oberflächen (dunkel → hell): `darkest #0F1115`, `groove #0B0D10`,
`dark #161A20`, `panel #1E232B`, `elevated #2A313B`, `accent #3D4756`,
`border #46515F`, `key #222831`, `keySelected #2E3844`.
Text: `text #F2F5F8`, `muted #A5B0BE`, `strong #FFFFFF`.
LEDs: Rot `#FF4D5E`, Bernstein `#FFB020`, Grün `#3DF28A`, Cyan `#2ED3F5`,
aus `#333B47`.

| Instrument | primary | bright | dim | on |
|---|---|---|---|---|
| Drums | `#FF7A1A` | `#FFA04D` | `#7A3A0A` | `#0B0E13` |
| Bass | `#8CF23C` | `#B3FF70` | `#3E7318` | `#0B0E13` |
| Sampler | `#3DB8FF` | `#7DD1FF` | `#145C85` | `#0B0E13` |
| Poly6 | `#FF4FA3` | `#FF8AC4` | `#80204F` | `#0B0E13` |
| Master | `#FFD23F` | `#FFE27A` | `#7A6418` | `#0B0E13` |

Kontrastziele werden im Build geprüft (`build-css.mjs` druckt eine
Kontrasttabelle; Mindestwerte: Text/Panel 7:1, Muted/Panel 4.5:1,
Akzent/Panel 3:1, `on`/Akzent 4.5:1).

## 4. Umsetzung in diesem Repository

Alles liegt in `theme-tactile/`, damit der nächste Build-Stand aus dem
privaten Repo es nicht überschreibt und es 1:1 portierbar bleibt:

1. `tactile.theme.js` – die ThemeDefinition als klassisches Skript, das
   `window.__NINEBEAT_EXTRA_THEMES.tactile` setzt (gleiche Struktur wie
   NEON NOIR, identische Palette, da dunkles Schema).
2. `build-css.mjs` – liest den NEON-NOIR-Variablenblock aus dem gebauten
   Stylesheet als Vorlage, ersetzt alle Oberflächen-, Akzent-, LED-, Tint-,
   CRT-, Schatten- und Dekor-Variablen aus der Definition (Tint-Mischung wie
   im Original: `base·(1−a) + ink·a`), hängt die Touch-Regeln aus
   `touch.css` an und schreibt `tactile.css`. Druckt die Kontrasttabelle und
   die Liste unverändert übernommener Variablen (darf nur `--pal-*` sein).
3. `touch.css` – handgeschriebene Ergonomie-Regeln unter
   `[data-theme=tactile]` (Abschnitt 2).
4. `index.html` – Stylesheet + Skript einbinden (vor dem Modul-Bundle),
   `THEME_COLORS` im Inline-Skript ergänzen.
5. Minimal-Patch im Bundle (`assets/index-*.js`): Registry um
   `...window.__NINEBEAT_EXTRA_THEMES` erweitern, `THEME_IDS` aus
   `Object.keys(THEMES)` ableiten. Damit erscheint die Karte in den
   Einstellungen, die Auswahl wird gespeichert und beim Laden validiert.
6. `service-worker.js` – neue Dateien in die Precache-Liste, Cache-Name
   erhöhen, damit Offline-Nutzer den neuen Stand bekommen.

## 5. Portierung ins private Quell-Repo (To-do für den nächsten Build)

- `src/theme/registry.ts`: `tactile` aus `tactile.theme.js` übernehmen,
  in `THEMES`/`THEME_IDS` eintragen.
- Tailwind/CSS-Generator erzeugt den Variablenblock dann selbst; die
  Touch-Regeln aus `touch.css` als `@layer components` übernehmen, idealer-
  weise als Theme-Flag `touchFirst: true` in der ThemeDefinition statt
  Selektor-Präfix.
- `index.html`-Inline-Skript: `THEME_COLORS.tactile = '#0F1115'`.
- `tests/smoke.mjs` Abschnitt [36] erweitern (scheme, metaThemeColor).
- Hover-Klassen app-weit in `@media (hover: hover)` kapseln
  (Tailwind `future.hoverOnlyWhenSupported`), unabhängig vom Theme.
- Mittelfristig: Mini-Schriften (`text-[8px]`/`text-[9px]`) in Touch-
  Layouts durch Token (`text-label`) ersetzen, das pro Theme skaliert.

## 6. Verifikation

- Build-Skript: Kontrasttabelle ohne Verstöße, keine unbekannten Variablen.
- Playwright (Chromium ist vorinstalliert): App lokal ausliefern, Theme über
  `localStorage` vorwählen, Screenshots für iPad quer (1180×820), iPad hoch
  (820×1180) und Phone (390×844) aller Hauptansichten; Konsole frei von
  Fehlern; Theme-Karte „TACTILE" erscheint und ist anwählbar.
- Manuell auf dem Gerät: Trefferflächen mit Daumen, keine klebenden Hover-
  Zustände, Fader/Knobs greifbar, Lesbarkeit bei Tageslicht.

## 7. Risiken

- Der Bundle-Patch ist bewusst minimal, geht aber beim nächsten „Neuer
  Stand" verloren → Abschnitt 5 ist Pflicht, sonst verschwindet das Theme
  nach dem nächsten Deploy (die Einstellungen fallen dann sauber auf ATELIER
  zurück, nichts bricht).
- Schriftanhebung kann in engen Phone-Layouts überlaufen; deshalb nur eine
  Stufe und Screenshot-Kontrolle.
- Größere Mindesthöhen verschieben Layouts in Listen (Mixer, Pattern-
  Editor); wo nötig per Screenshot nachjustieren.
