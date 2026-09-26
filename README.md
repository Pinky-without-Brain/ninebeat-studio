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
