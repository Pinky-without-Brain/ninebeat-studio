// Ninebeat Studio - Gamepad-Navigation (Xbox-Standardbelegung, Gamepad API).
//
// Eigenstaendige Schicht ueber dem gebauten DOM, kein Eingriff ins Bundle:
// sie sucht sichtbare Bedienelemente, bewegt einen Fokus raeumlich (D-Pad /
// linker Stick), loest sie mit A aus (Pointer-Ereignisse, damit Pads auch
// gehalten werden koennen) und aendert Werte von Reglern (LT/RT, rechter
// Stick). Dialoge schliesst B per Escape.
//
// Belegung (Standard-Mapping, ROG Xbox Ally X):
//   D-Pad / linker Stick  Fokus bewegen
//   A                      Auswaehlen / Pad spielen (halten moeglich)
//   B                      Zurueck: Dialog schliessen, sonst zur Instrument-Leiste
//   X                      REC
//   Y                      Einstellungen (SETUP)
//   LB / RB                Instrument-Ansicht zurueck / vor
//   LT / RT                fokussierten Wert verringern / erhoehen (halten = Dauerlauf)
//   rechter Stick          waagerecht: Wert fein; senkrecht: Liste scrollen
//                          (bei Fadern/Knoepfen: senkrecht ziehen)
//   Menue (≡)              Master Play/Pause
//   Ansicht (⧉)            Master Stop
//   L3                     Legende ein-/ausblenden
//   R3                     Fokus in den Hauptbereich
//
// Testhaken: window.__gamepadNav (move, press, release, focusEl, candidates).
(function () {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('getGamepads' in navigator)) return;

  var BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  var DEADZONE = 0.4, REPEAT_FIRST = 300, REPEAT = 110, LEGEND_HIDE_MS = 6000;
  var SEL = 'button, [role=button], [role=radio], [role=tab], [role=menuitem], [role=slider], input:not([type=hidden]), select, textarea, a[href], [data-pad], [tabindex]:not([tabindex="-1"])';
  var NAV_RE = /^(DRUMS|BASS|SAMPLER|POLY|MIXER|CRT)/i;

  var html = document.documentElement;
  var focusEl = null, active = false, legendPinned = true, legendTimer = 0;
  var prev = [], held = {}, stickHeld = {}, drag = null, viewIdx = -1, pollTimer = 0, raf = 0;

  // ---------- Sichtbarkeit / Kandidaten ----------
  function topLayer() {
    var layers = document.querySelectorAll('[role=dialog], [data-ui-modal]');
    return layers.length ? layers[layers.length - 1] : null;
  }
  function visible(el) {
    if (!el || !el.isConnected || el.closest('[data-gamepad-legend]')) return false;
    if (el.disabled || el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"], [inert]')) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) return false;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none' || parseFloat(cs.opacity) === 0) return false;
    var layer = topLayer();
    if (layer && !layer.contains(el)) return false;
    return true;
  }
  function candidates() {
    var scope = topLayer() || document;
    var all = scope.querySelectorAll(SEL), out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      // Verschachtelte Kandidaten (Label um Checkbox): nur das innere Element.
      if (el.tagName === 'LABEL' && el.querySelector('input')) continue;
      if (visible(el)) out.push(el);
    }
    return out;
  }
  function rect(el) { var r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }
  function navButtons() {
    var btns = Array.prototype.filter.call(document.querySelectorAll('button'), function (b) {
      return visible(b) && NAV_RE.test((b.textContent || '').trim());
    });
    // Sidebar (Tablet) oder untere Leiste (Phone): die Gruppe mit >= 5 Treffern.
    var groups = {};
    btns.forEach(function (b) { var k = b.parentElement; (groups[k.className] = groups[k.className] || []).push(b); });
    var best = [];
    Object.keys(groups).forEach(function (k) { if (groups[k].length > best.length) best = groups[k]; });
    return best.length >= 5 ? best : btns;
  }
  function byTitle(prefix) {
    var all = document.querySelectorAll('button[title], [role=button][title]');
    for (var i = 0; i < all.length; i++) if (all[i].title.indexOf(prefix) === 0 && visible(all[i])) return all[i];
    return null;
  }
  function byText(re) {
    var all = document.querySelectorAll('button');
    for (var i = 0; i < all.length; i++) if (re.test((all[i].textContent || '').trim()) && visible(all[i])) return all[i];
    return null;
  }

  // ---------- Fokus ----------
  function label(el) {
    return (el.getAttribute('aria-label') || el.title || (el.textContent || '').trim().replace(/\s+/g, ' ') || el.value || el.tagName).slice(0, 48);
  }
  function setFocus(el) {
    if (!el) return;
    if (focusEl && focusEl !== el) focusEl.removeAttribute('data-gp-focus');
    focusEl = el;
    el.setAttribute('data-gp-focus', '');
    if (typeof el.focus === 'function') {
      if (!el.hasAttribute('tabindex') && !/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
      try { el.focus({ preventScroll: true }); } catch (e) {}
    }
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
    setHint(label(el));
  }
  function ensureFocus() {
    if (focusEl && visible(focusEl)) return focusEl;
    var list = candidates();
    if (!list.length) return null;
    // Erster Kandidat im Hauptbereich, sonst der erste ueberhaupt.
    var main = list.filter(function (el) { var r = rect(el); return r.t > 60 && r.l > 80; });
    setFocus(main[0] || list[0]);
    return focusEl;
  }
  function move(dir) {
    var cur = focusEl && visible(focusEl) ? focusEl : null;
    if (!cur) { ensureFocus(); return focusEl; }
    var r = rect(cur), best = null, bestScore = Infinity;
    candidates().forEach(function (el) {
      if (el === cur || cur.contains(el) || el.contains(cur)) return;
      var c = rect(el), primary, secondary;
      if (dir === 'right') { primary = c.l - r.r; secondary = gap(c.t, c.b, r.t, r.b); }
      else if (dir === 'left') { primary = r.l - c.r; secondary = gap(c.t, c.b, r.t, r.b); }
      else if (dir === 'down') { primary = c.t - r.b; secondary = gap(c.l, c.r, r.l, r.r); }
      else { primary = r.t - c.b; secondary = gap(c.l, c.r, r.l, r.r); }
      if (primary < -6) return; // liegt nicht in Richtung
      var centerBias = (dir === 'left' || dir === 'right') ? Math.abs(c.cy - r.cy) * 0.15 : Math.abs(c.cx - r.cx) * 0.15;
      var score = Math.max(primary, 0) + secondary * 2.5 + centerBias;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) setFocus(best);
    return best;
  }
  function gap(a1, a2, b1, b2) { return a1 > b2 ? a1 - b2 : b1 > a2 ? b1 - a2 : 0; }

  // ---------- Ausloesen ----------
  var PID = 9001;
  function pointer(type, el, x, y, extra) {
    var init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: type === 'pointerup' || type === 'mouseup' || type === 'click' ? 0 : 1, pointerId: PID, pointerType: 'mouse', isPrimary: true, view: window };
    if (extra) for (var k in extra) init[k] = extra[k];
    var ev = type.indexOf('pointer') === 0 && typeof PointerEvent === 'function' ? new PointerEvent(type, init) : new MouseEvent(type, init);
    el.dispatchEvent(ev);
  }
  function isValueInput(el) { return el && el.tagName === 'INPUT' && (el.type === 'range' || el.type === 'number'); }
  function press() {
    var el = ensureFocus(); if (!el) return;
    if (el.tagName === 'SELECT') { cycleSelect(el, 1); return; }
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) { el.click(); return; }
    if (isValueInput(el)) return; // Werte ueber LT/RT
    var r = rect(el);
    pointer('pointerdown', el, r.cx, r.cy); pointer('mousedown', el, r.cx, r.cy);
  }
  function release() {
    var el = focusEl; if (!el || !el.isConnected) return;
    if (el.tagName === 'SELECT' || isValueInput(el) || (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio'))) return;
    var r = rect(el);
    pointer('pointerup', el, r.cx, r.cy); pointer('mouseup', el, r.cx, r.cy); pointer('click', el, r.cx, r.cy);
  }
  function setNative(el, value) {
    var proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function cycleSelect(el, dir) {
    var n = el.options.length; if (!n) return;
    setNative(el, el.options[(el.selectedIndex + dir + n) % n].value);
    setHint(label(el) + ': ' + el.options[el.selectedIndex].text);
  }
  function adjust(delta, fine) {
    var el = ensureFocus(); if (!el) return false;
    if (el.tagName === 'SELECT') { if (!fine) cycleSelect(el, delta > 0 ? 1 : -1); return true; }
    if (!isValueInput(el)) return false;
    var min = parseFloat(el.min), max = parseFloat(el.max), step = parseFloat(el.step);
    if (isNaN(min)) min = 0; if (isNaN(max)) max = 100;
    if (isNaN(step) || step <= 0) step = (max - min) / 100;
    var v = parseFloat(el.value); if (isNaN(v)) v = min;
    var inc = fine ? step * delta : step * delta * Math.max(1, Math.round((max - min) / step / 50));
    var nv = Math.min(max, Math.max(min, v + inc));
    var dec = (String(step).split('.')[1] || '').length;
    setNative(el, nv.toFixed(dec));
    setHint(label(el) + ': ' + el.value);
    return true;
  }
  // Rechter Stick auf Fader/Knopf: synthetisches Ziehen.
  function dragTarget(el) {
    return el && (el.closest('[role=slider], .fader-cap, [class*="fader"], [class*="knob"], [class*="Knob"], [class*="Fader"]') || null);
  }
  function dragTick(dy) {
    var el = focusEl && visible(focusEl) ? dragTarget(focusEl) : null;
    if (!el) { dragEnd(); return false; }
    var r = rect(el);
    if (!drag) { drag = { el: el, x: r.cx, y: r.cy }; pointer('pointerdown', el, drag.x, drag.y); }
    drag.y += dy;
    pointer('pointermove', el, drag.x, drag.y);
    return true;
  }
  function dragEnd() { if (!drag) return; pointer('pointerup', drag.el, drag.x, drag.y); drag = null; }
  function scrollBy(dy) {
    var el = focusEl && visible(focusEl) ? focusEl : null;
    while (el && el !== document.body) {
      var cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) { el.scrollTop += dy; return; }
      el = el.parentElement;
    }
    (document.scrollingElement || document.body).scrollTop += dy;
  }

  // ---------- Aktionen ----------
  function back() {
    var layer = topLayer();
    if (layer) {
      var close = layer.querySelector('[aria-label="Close"], [aria-label^="Einstellungen schl"], [aria-label="Dismiss"]');
      if (close) { close.click(); focusEl = null; ensureFocus(); return; }
      var ev = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
      window.dispatchEvent(ev); document.dispatchEvent(ev);
      focusEl = null; setTimeout(ensureFocus, 50); return;
    }
    var nav = navButtons();
    if (nav.length) setFocus(nav[Math.max(0, viewIdx)]);
  }
  function switchView(dir) {
    var nav = navButtons(); if (!nav.length) return;
    if (viewIdx < 0) viewIdx = 0;
    viewIdx = (viewIdx + dir + nav.length) % nav.length;
    nav[viewIdx].click();
    setHint((nav[viewIdx].textContent || '').trim().replace(/\s+/g, ' '));
    focusEl = null; setTimeout(ensureFocus, 80);
  }
  function clickTitle(prefix, name) { var b = byTitle(prefix); if (b) { b.click(); setHint(name); } }
  function focusMain() { focusEl = null; ensureFocus(); }

  // ---------- Legende ----------
  var legend = null, hintEl = null;
  function buildLegend() {
    legend = document.createElement('div');
    legend.setAttribute('data-gamepad-legend', '');
    legend.setAttribute('aria-hidden', 'true');
    legend.innerHTML =
      '<span class="gp-hint"></span>' +
      '<span><i class="gp-btn gp-a">A</i>Wählen</span><span><i class="gp-btn gp-b">B</i>Zurück</span>' +
      '<span><i class="gp-btn gp-x">X</i>Rec</span><span><i class="gp-btn gp-y">Y</i>Setup</span>' +
      '<span><i class="gp-key">LB RB</i>Instrument</span><span><i class="gp-key">LT RT</i>Wert</span>' +
      '<span><i class="gp-key">≡</i>Play</span><span><i class="gp-key">⧉</i>Stop</span><span><i class="gp-key">L3</i>Legende</span>';
    document.body.appendChild(legend);
    hintEl = legend.querySelector('.gp-hint');
  }
  function setHint(t) { if (hintEl) hintEl.textContent = t || ''; showLegend(); }
  function showLegend() {
    if (!legend) return;
    legend.setAttribute('data-visible', '');
    clearTimeout(legendTimer);
    if (!legendPinned) legendTimer = setTimeout(function () { legend.removeAttribute('data-visible'); }, LEGEND_HIDE_MS);
  }
  function toggleLegend() { legendPinned = !legendPinned; if (legendPinned) showLegend(); else legend.removeAttribute('data-visible'); }

  // ---------- Aktiv-Zustand ----------
  function activate() {
    if (!active) { active = true; html.setAttribute('data-gamepad', 'active'); }
    else if (html.getAttribute('data-gamepad') !== 'active') html.setAttribute('data-gamepad', 'active');
  }
  document.addEventListener('pointermove', function (e) { if (e.isTrusted && active) html.setAttribute('data-gamepad', 'idle'); }, true);
  document.addEventListener('pointerdown', function (e) {
    if (!e.isTrusted) return;
    if (active) html.setAttribute('data-gamepad', 'idle');
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b && NAV_RE.test((b.textContent || '').trim())) { var nav = navButtons(); var i = nav.indexOf(b); if (i >= 0) viewIdx = i; }
  }, true);
  document.addEventListener('focusin', function (e) {
    if (!active || e.target === focusEl || !e.target.matches || !e.target.matches(SEL)) return;
    if (focusEl) focusEl.removeAttribute('data-gp-focus');
    focusEl = e.target; focusEl.setAttribute('data-gp-focus', '');
  });

  // ---------- Abfrage ----------
  function pad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected !== false) return pads[i];
    return null;
  }
  function pressed(gp, i) { var b = gp.buttons[i]; return !!b && (typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5); }
  function edge(gp, i, now) {
    var is = pressed(gp, i), was = !!prev[i];
    prev[i] = is;
    if (is && !was) { held[i] = { since: now, last: now }; return 'down'; }
    if (!is && was) { delete held[i]; return 'up'; }
    if (is && held[i]) {
      var h = held[i];
      if (now - h.since > REPEAT_FIRST && now - h.last > REPEAT) { h.last = now; return 'repeat'; }
    }
    return null;
  }
  function axisEdge(key, on, now) {
    if (on && !stickHeld[key]) { stickHeld[key] = { since: now, last: now }; return true; }
    if (!on) { delete stickHeld[key]; return false; }
    var h = stickHeld[key];
    if (now - h.since > REPEAT_FIRST && now - h.last > REPEAT) { h.last = now; return true; }
    return false;
  }
  function tick(now) {
    var gp = pad();
    if (gp) {
      var any = false;
      for (var i = 0; i < gp.buttons.length; i++) if (pressed(gp, i)) any = true;
      var ax = gp.axes || [];
      var lx = ax[0] || 0, ly = ax[1] || 0, rx = ax[2] || 0, ry = ax[3] || 0;
      if (Math.abs(lx) > DEADZONE || Math.abs(ly) > DEADZONE || Math.abs(rx) > DEADZONE || Math.abs(ry) > DEADZONE) any = true;
      if (any) activate();

      var e;
      e = edge(gp, BTN.A, now); if (e === 'down') press(); else if (e === 'up') release();
      if (edge(gp, BTN.B, now) === 'down') back();
      if (edge(gp, BTN.X, now) === 'down') { var rec = byText(/^REC$/); if (rec) { rec.click(); setHint('REC'); } }
      if (edge(gp, BTN.Y, now) === 'down') clickTitle('Einstellungen', 'Einstellungen');
      if (edge(gp, BTN.LB, now) === 'down') switchView(-1);
      if (edge(gp, BTN.RB, now) === 'down') switchView(1);
      e = edge(gp, BTN.LT, now); if (e === 'down' || e === 'repeat') adjust(-1, false);
      e = edge(gp, BTN.RT, now); if (e === 'down' || e === 'repeat') adjust(1, false);
      if (edge(gp, BTN.MENU, now) === 'down') clickTitle('Master Play', 'Play/Pause');
      if (edge(gp, BTN.VIEW, now) === 'down') clickTitle('Master Stop', 'Stop');
      if (edge(gp, BTN.L3, now) === 'down') toggleLegend();
      if (edge(gp, BTN.R3, now) === 'down') focusMain();
      var dirs = [[BTN.UP, 'up', ly < -DEADZONE], [BTN.DOWN, 'down', ly > DEADZONE], [BTN.LEFT, 'left', lx < -DEADZONE], [BTN.RIGHT, 'right', lx > DEADZONE]];
      for (var d = 0; d < dirs.length; d++) {
        e = edge(gp, dirs[d][0], now);
        if (e === 'down' || e === 'repeat' || axisEdge(dirs[d][1], dirs[d][2], now)) move(dirs[d][1]);
      }
      // Rechter Stick
      if (Math.abs(rx) > DEADZONE && axisEdge('rx', true, now)) adjust(rx > 0 ? 1 : -1, true); else if (Math.abs(rx) <= DEADZONE) axisEdge('rx', false, now);
      if (Math.abs(ry) > DEADZONE) {
        if (!dragTick(ry * 6)) scrollBy(ry * 14);
      } else dragEnd();
    }
    raf = requestAnimationFrame(tick);
  }
  function start() {
    if (raf) return;
    if (!legend) buildLegend();
    clearInterval(pollTimer);
    raf = requestAnimationFrame(tick);
  }
  window.addEventListener('gamepadconnected', function () { start(); setHint('Controller verbunden'); });
  window.addEventListener('gamepaddisconnected', function () { if (!pad()) { cancelAnimationFrame(raf); raf = 0; active = false; html.removeAttribute('data-gamepad'); if (legend) legend.removeAttribute('data-visible'); pollTimer = setInterval(function () { if (pad()) start(); }, 1000); } });
  // Bereits verbundene Controller melden sich nicht immer per Ereignis.
  pollTimer = setInterval(function () { if (pad()) start(); }, 1000);

  window.__gamepadNav = {
    move: move, press: press, release: release, back: back, adjust: adjust, switchView: switchView,
    candidates: candidates, setFocus: setFocus, start: start, get focusEl() { return focusEl; },
  };
})();
