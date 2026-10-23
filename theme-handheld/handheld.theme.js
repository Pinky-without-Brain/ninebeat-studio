// Theme "HANDHELD" - Ninebeat Studio, ausgelegt auf das ASUS ROG Xbox Ally X
// (7 Zoll, 1920x1080, Windows-Skalierung 150 % -> 1280x720 CSS-Pixel,
// Xbox-Controller fest verbaut, Touchscreen).
//
// Klassisches Skript wie tactile.theme.js; legt die Definition unter
// window.__NINEBEAT_EXTRA_THEMES.handheld ab. Gestaltung: tiefes Schwarz
// (hoher Kontrast bei kleinem Bild), weisse Schrift, kraeftige Akzente,
// Fokus-Ring in Signal-Gruen fuer die Gamepad-Navigation (gamepad/gamepad.css
// liest --gp-focus und --gp-focus-contrast).
(function () {
  function solid(c) { return { fg: c, fill: c, line: c }; }
  function accent(primary, bright, dim, on, glow, glowStrong) {
    return { primary: solid(primary), bright: solid(bright), dim: solid(dim), on: solid(on), ink: primary, glow: glow, glowStrong: glowStrong };
  }
  var steps = { 50: 50, 100: 100, 200: 200, 300: 300, 400: 400, 500: 500, 600: 600, 700: 700, 800: 800, 900: 900, 950: 950 };
  var identity = { fg: steps, fill: steps, line: steps };
  var ON = '#000000';
  var accents = {
    drums:   accent('#FF8A2A', '#FFB066', '#8A3F0A', ON, 'rgba(255, 138, 42, 0.35)', 'rgba(255, 138, 42, 0.85)'),
    bass:    accent('#9CFF3F', '#C6FF85', '#3F7A14', ON, 'rgba(156, 255, 63, 0.35)', 'rgba(156, 255, 63, 0.85)'),
    sampler: accent('#4FC3FF', '#8EDBFF', '#176A9A', ON, 'rgba(79, 195, 255, 0.35)', 'rgba(79, 195, 255, 0.85)'),
    poly6:   accent('#FF5CB0', '#FF9ACF', '#8A2459', ON, 'rgba(255, 92, 176, 0.35)', 'rgba(255, 92, 176, 0.85)'),
    master:  accent('#FFD84A', '#FFE88A', '#8A701C', ON, 'rgba(255, 216, 74, 0.35)', 'rgba(255, 216, 74, 0.85)'),
  };
  var handheld = {
    id: 'handheld',
    name: 'HANDHELD',
    tagline: 'Für 7-Zoll-Handhelds wie das ROG Xbox Ally X – Controller, Touch, hoher Kontrast.',
    scheme: 'dark',
    metaThemeColor: '#050607',
    tokens: {
      surface: {
        darkest: '#050607', groove: '#000000', dark: '#0C0E12', panel: '#14171D',
        elevated: '#1F242C', accent: '#343B47', border: '#4A5363',
        key: '#181C23', keySelected: '#26303D',
      },
      text: { text: '#F7F9FB', muted: '#AEB8C6', strong: '#FFFFFF' },
      overlay: { ink: '#FFFFFF', shade: '#000000', scrim: 'rgba(0, 0, 0, 0.82)', scrimSoft: 'rgba(0, 0, 0, 0.6)' },
      led: { red: solid('#FF5566'), amber: solid('#FFB732'), green: solid('#4DFF96'), cyan: solid('#3FDCFF'), off: solid('#2E3542') },
      accents: accents,
      shadow: {
        inset: 'inset 0 0 0 1px rgba(0, 0, 0, 0.7), inset 0 2px 3px rgba(0, 0, 0, 0.5)',
        raised: '0 2px 6px rgba(0, 0, 0, 0.6), inset 0 1px 0 0 rgba(255, 255, 255, 0.07)',
        button: '0 2px 0 0 rgba(0, 0, 0, 0.75), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
        buttonPressed: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.75), 0 0 0 0 rgba(0, 0, 0, 0)',
        led: '0 0 6px currentColor',
        keyRest: '0 3px 0 rgba(0, 0, 0, 0.75), 0 4px 8px rgba(0, 0, 0, 0.45)',
        keyLip: 'inset 0 -5px 0 rgba(0, 0, 0, 0.5)',
        keyPressed: 'inset 0 3px 6px rgba(0, 0, 0, 0.8)',
      },
      decor: {
        brushedMetal: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.1) 100%)',
        knurled: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
        faderGrooveBg: 'linear-gradient(90deg, #000000 0%, #10131A 50%, #000000 100%)',
        faderGrooveShadow: 'inset 0 0 0 2px rgba(255, 255, 255, 0.08)',
        knurlDot: 'rgba(255, 255, 255, 0.14)',
        padInsetShadow: 'inset 0 0 0 2px rgba(255, 255, 255, 0.08)',
        padActiveShadow: 'inset 0 0 0 3px currentColor',
      },
      glowScale: 0.35,
      crt: {
        glass: '#020304', chassis: '#050607', bezel: '#1F242C',
        gridLine: '#222A36', gridTick: '#3A4656', gridAxis: '#5C6C84',
        gridAlpha: 0.45, axisAlpha: 0.75, scanline: '#000000', scanlineAlpha: 0.06,
        bloom: 0.3, halo: 0.5, coreWidth: 2.4, traceBlend: 'source-over', origin: '#FFFFFF',
        vignette: 'inset 0 0 36px rgba(0,0,0,0.6)',
        reflection: 'linear-gradient(to top right, rgba(255,255,255,0), rgba(255,255,255,0.01), rgba(255,255,255,0.03))',
        inscription: '#4DFF96',
        beams: {
          drums:   { trace: '#FF8A2A', core: '#FFD9B8', label: '#FFD9B8' },
          bass:    { trace: '#9CFF3F', core: '#E2FFC4', label: '#E2FFC4' },
          sampler: { trace: '#4FC3FF', core: '#D0EEFF', label: '#D0EEFF' },
          poly6:   { trace: '#FF5CB0', core: '#FFCBE6', label: '#FFCBE6' },
          master:  { trace: '#FFD84A', core: '#FFFFFF', label: '#FFFFFF' },
        },
        ui: { fill: '#0B2A1C', ink: '#9AF7C6', value: '#4DFF96', line: '#2BD47E', lamp: '#4DFF96' },
      },
    },
    palette: { chromatic: identity, neutral: identity },
    tint: { base: '#050607', baseRaised: '#14171D', amount: 0.07, amountRaised: 0.1 },
  };
  var root = (typeof window !== 'undefined' ? window : globalThis);
  root.__NINEBEAT_EXTRA_THEMES = root.__NINEBEAT_EXTRA_THEMES || {};
  root.__NINEBEAT_EXTRA_THEMES.handheld = handheld;
  if (typeof module !== 'undefined' && module.exports) module.exports = handheld;
})();
