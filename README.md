# Ninebeat Studio — Touch Workstation

Live: **https://pinky-without-brain.github.io/ninebeat-studio/**

Eine Groove-Workstation im Browser: Drum-Machine (NB-09), Bass-Synthesizer
(AL-03), 12-Pad-Sampler, sechsstimmiger Poly-Synthesizer (POLY-6), ein
15-Kanal-Mischpult mit Send-Effekten und eine Mastering-Kette.

Die Drum-Machine rendert in einer WebAssembly-Engine, die in einem
AudioWorklet laeuft; die uebrigen Instrumente sind reine WebAudio-Graphen.

## Was hier liegt

Ausschliesslich das **gebaute Ergebnis** — dieses Repository enthaelt keinen
Quelltext. Es existiert nur, damit GitHub Pages etwas ausliefern kann; die
Entwicklung findet in einem separaten, privaten Repository statt.

## Hinweise zur Benutzung

- **Ton muss einmal freigeschaltet werden.** Browser starten Audio nicht von
  selbst; beim ersten Laden erscheint dafuer eine Schaltflaeche.
- **Kopfhoerer empfohlen**, sobald das Mikrofon des Samplers mitgehoert wird —
  ueber Lautsprecher kann es rueckkoppeln.
- Auf dem iPad laesst sich die Seite ueber „Zum Home-Bildschirm" als
  Vollbild-App ablegen.

## Theme TACTILE (Touch-first)

Unter `theme-tactile/` liegt ein zusaetzliches, auf Fingerbedienung
ausgelegtes Theme samt Plan (`PLAN.md`), ThemeDefinition
(`tactile.theme.js`), Touch-Regeln (`touch.css`) und Generator
(`build-css.mjs`, erzeugt `tactile.css`). Es wird in `index.html` vor dem
Bundle geladen und ueber einen minimalen Patch der Theme-Registry im Bundle
angemeldet. Beim naechsten Build-Stand aus dem Quell-Repo muss es dort
eingepflegt werden (siehe `PLAN.md`, Abschnitt 5), sonst faellt die Auswahl
wieder auf ATELIER zurueck.
