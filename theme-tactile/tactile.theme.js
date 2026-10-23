// Theme "TACTILE" - Ninebeat Studio.
//
// Klassisches Skript (kein Modul): muss VOR dem App-Bundle laufen und legt
// die ThemeDefinition unter window.__NINEBEAT_EXTRA_THEMES.tactile ab. Das
// Bundle mischt dieses Objekt in seine Theme-Registry (siehe PLAN.md, 4.5).
// Struktur = ThemeDefinition aus src/theme/registry.ts (dunkles Schema,
// Palette identisch zu Tailwind, daher wie bei NEON NOIR 1:1-Mapping).
//
// Dieselbe Datei ist die Vorlage fuer die Portierung ins Quell-Repo; die
// Werte stehen bewusst ausgeschrieben (keine Helfer), damit sie sich ohne
// Umweg in registry.ts uebernehmen lassen.
(function () {
  function solid(c) { return { fg: c, fill: c, line: c }; }
  function accent(primary, bright, dim, on, glow, glowStrong) {
    return {
      primary: solid(primary), bright: solid(bright), dim: solid(dim), on: solid(on),
      ink: primary, glow: glow, glowStrong: glowStrong,
    };
  }
  var steps = { 50: 50, 100: 100, 200: 200, 300: 300, 400: 400, 500: 500, 600: 600, 700: 700, 800: 800, 900: 900, 950: 950 };
  var identity = { fg: steps, fill: steps, line: steps };

  var ON = '#0B0E13';
  var accents = {
    drums:   accent('#FF7A1A', '#FFA04D', '#7A3A0A', ON, 'rgba(255, 122, 26, 0.35)', 'rgba(255, 122, 26, 0.8)'),
    bass:    accent('#8CF23C', '#B3FF70', '#3E7318', ON, 'rgba(140, 242, 60, 0.35)', 'rgba(140, 242, 60, 0.8)'),
    sampler: accent('#3DB8FF', '#7DD1FF', '#145C85', ON, 'rgba(61, 184, 255, 0.35)', 'rgba(61, 184, 255, 0.8)'),
    poly6:   accent('#FF4FA3', '#FF8AC4', '#80204F', ON, 'rgba(255, 79, 163, 0.35)', 'rgba(255, 79, 163, 0.8)'),
    master:  accent('#FFD23F', '#FFE27A', '#7A6418', ON, 'rgba(255, 210, 63, 0.35)', 'rgba(255, 210, 63, 0.8)'),
  };

  var tactile = {
    id: 'tactile',
    name: 'TACTILE',
    tagline: 'Groß, griffig, kontrastreich – gebaut für Finger statt Maus.',
    scheme: 'dark',
    metaThemeColor: '#0F1115',
    tokens: {
      surface: {
        darkest: '#0F1115', groove: '#0B0D10', dark: '#161A20', panel: '#1E232B',
        elevated: '#2A313B', accent: '#3D4756', border: '#46515F',
        key: '#222831', keySelected: '#2E3844',
      },
      text: { text: '#F2F5F8', muted: '#A5B0BE', strong: '#FFFFFF' },
      overlay: { ink: '#FFFFFF', shade: '#000000', scrim: 'rgba(5, 7, 10, 0.78)', scrimSoft: 'rgba(5, 7, 10, 0.55)' },
      led: {
        red: solid('#FF4D5E'), amber: solid('#FFB020'), green: solid('#3DF28A'),
        cyan: solid('#2ED3F5'), off: solid('#333B47'),
      },
      accents: accents,
      // Flach und "tastenhaft": harte Unterkante statt weicher Schatten,
      // gedrueckt = eingesunken. Kein Leuchten als Zustandsanzeige.
      shadow: {
        inset: 'inset 0 0 0 1px rgba(0, 0, 0, 0.55), inset 0 2px 3px rgba(0, 0, 0, 0.45)',
        raised: '0 2px 6px rgba(0, 0, 0, 0.45), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
        button: '0 2px 0 0 rgba(0, 0, 0, 0.6), inset 0 1px 0 0 rgba(255, 255, 255, 0.09)',
        buttonPressed: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.65), 0 0 0 0 rgba(0, 0, 0, 0)',
        led: '0 0 6px currentColor',
        keyRest: '0 3px 0 rgba(0, 0, 0, 0.6), 0 4px 8px rgba(0, 0, 0, 0.35)',
        keyLip: 'inset 0 -5px 0 rgba(0, 0, 0, 0.45)',
        keyPressed: 'inset 0 3px 6px rgba(0, 0, 0, 0.7)',
      },
      decor: {
        brushedMetal: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.08) 100%)',
        knurled: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
        faderGrooveBg: 'linear-gradient(90deg, #0B0D10 0%, #13171D 50%, #0B0D10 100%)',
        faderGrooveShadow: 'inset 0 0 0 2px rgba(255, 255, 255, 0.06)',
        knurlDot: 'rgba(255, 255, 255, 0.14)',
        padInsetShadow: 'inset 0 0 0 2px rgba(255, 255, 255, 0.06)',
        padActiveShadow: 'inset 0 0 0 3px currentColor',
      },
      glowScale: 0.3,
      crt: {
        glass: '#0A0D12', chassis: '#0F1115', bezel: '#2A313B',
        gridLine: '#2A3442', gridTick: '#3D4A5C', gridAxis: '#5A6A80',
        gridAlpha: 0.4, axisAlpha: 0.7,
        scanline: '#000000', scanlineAlpha: 0.08,
        bloom: 0.3, halo: 0.5, coreWidth: 2.2, traceBlend: 'source-over',
        origin: '#FFFFFF',
        vignette: 'inset 0 0 40px rgba(0,0,0,0.6)',
        reflection: 'linear-gradient(to top right, rgba(255,255,255,0), rgba(255,255,255,0.01), rgba(255,255,255,0.03))',
        inscription: '#3DF28A',
        beams: {
          drums:   { trace: '#FF7A1A', core: '#FFD2AD', label: '#FFD2AD' },
          bass:    { trace: '#8CF23C', core: '#DCFFBF', label: '#DCFFBF' },
          sampler: { trace: '#3DB8FF', core: '#C9EAFF', label: '#C9EAFF' },
          poly6:   { trace: '#FF4FA3', core: '#FFC7E3', label: '#FFC7E3' },
          master:  { trace: '#FFD23F', core: '#FFFFFF', label: '#FFFFFF' },
        },
        ui: { fill: '#0E2A1E', ink: '#8CF5C0', value: '#3DF28A', line: '#27C47A', lamp: '#3DF28A' },
      },
    },
    // Wie im Bundle: palette/tint liegen NEBEN tokens, nicht darin.
    palette: { chromatic: identity, neutral: identity },
    tint: { base: '#0F1115', baseRaised: '#1E232B', amount: 0.06, amountRaised: 0.09 },
  };

  var root = (typeof window !== 'undefined' ? window : globalThis);
  root.__NINEBEAT_EXTRA_THEMES = root.__NINEBEAT_EXTRA_THEMES || {};
  root.__NINEBEAT_EXTRA_THEMES.tactile = tactile;
  if (typeof module !== 'undefined' && module.exports) module.exports = tactile;
})();
