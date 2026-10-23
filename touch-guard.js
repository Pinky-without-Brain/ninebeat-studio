// Ninebeat Studio - Touch-Schutz (geraeteweit, themenunabhaengig).
//
// Unterdrueckt das Kontextmenue, wenn es per Touch (oder Stift) ausgeloest
// wurde: Windows oeffnet bei langem Druck auf dem Touchscreen das
// Rechtsklick-Menue und unterbricht damit gehaltene Pads, Fader und Steps.
// Maus-Rechtsklicks bleiben erlaubt (Entwickler-Werkzeuge, Desktop).
//
// Erkennung: Der letzte pointerdown entscheidet (pointerType touch/pen).
// Faellt der Browser kein pointerdown vor dem contextmenu-Ereignis (aeltere
// Touch-Implementierungen), greift `(pointer: coarse)` als Rueckfall.
// Bei Gamepad-Betrieb (data-gamepad=active am <html>) ebenfalls aus.
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var lastType = '';
  var lastAt = 0;
  document.addEventListener('pointerdown', function (e) {
    lastType = e.pointerType || '';
    lastAt = e.timeStamp;
  }, true);
  document.addEventListener('contextmenu', function (e) {
    var recentTouch = (lastType === 'touch' || lastType === 'pen') && (e.timeStamp - lastAt) < 2000;
    var coarseOnly = !lastType && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var gamepad = document.documentElement.getAttribute('data-gamepad') === 'active';
    if (recentTouch || coarseOnly || gamepad) e.preventDefault();
  }, true);
})();
