// Die Engine der Web-Demo als EIN AudioWorklet (D4-w1, 19.10.2026, docs/Standalone-Entwurf.md Abschnitt 2 V1).
//
// Laedt `ninebeat_engine.wasm` (engine/wasm/, Kern engine/core/EngineCore - derselbe wie im JUCE-Host) und spielt
// darin alle vier Instrumente samt Schrittgebern, Summe und Abgriffen. Die Oberflaeche spricht mit ihm dasselbe
// Protokoll wie mit dem Host, nur ueber `port.postMessage` statt ueber die JUCE-Bruecke:
//
//   Hauptthread -> Worklet
//     { t: 'init', wasmBinary }                 Modul starten (Bytes laedt der Hauptthread, siehe unten)
//     { t: 'cmd', c }                           ein Befehl, Form wie `nbCommand` im Host ({ type, a, b, c, d, v, name, p })
//     { t: 'cmds', list }                       mehrere Befehle in Reihenfolge
//     { t: 'cmds', list, at }                   dieselben, angewandt genau am Frame `at` (currentFrame-Zaehlung) - der
//                                               Block wird dort geteilt; fuer Offline-Vergleiche, deren Ereignisse
//                                               nicht auf 128er-Grenzen liegen (scripts/chain-reference.mjs --wasm)
//     { t: 'fn', id, name, args }               eine Funktion wie die nativen Funktionen des Hosts (nbExport, nbImport,
//                                               nbSamplerMaterial, nbCapture, nbScope, nbInfo, nbHealthReset) und
//                                               nbRecord ({ op: 'start', epoch } | { op: 'stop' }) fuer den Session-
//                                               Mitschnitt des Browsers (im Host schreibt die Engine die Datei selbst)
//     { t: 'ack', n }                           Quittung anfordern (alles davor ist angewandt) - fuer Offline-Renderer
//   Worklet -> Hauptthread
//     { t: 'ready', info } | { t: 'error', message }
//     { t: 'done', id, result }                 Antwort auf 'fn'
//     { t: 'ack', n }
//     { t: 'ev', name, payload }                Ereignisse wie im Host: nbLevels, nbLatency, nbSteps, nbScope,
//                                               nbCaptureBlock, nbRecordBlock (Scope und Aufnahme als Int16Array/Float32Array statt
//                                               Base64 - Entwurf Abschnitt 4, Regel 4: im Worklet uebertragbar)
//
// Die Befehlsnamen stehen hier NICHT: sie kommen beim Start aus dem Modul (`nbw_commandName` ...), aus derselben
// Tabelle, die der Host liest (engine/protocol/Command.cpp). Ebenso die Belegung der Pegel und der Steps.
//
// Wie im Host wird jeder Befehl zwischen zwei Bloecken angewandt (port.onmessage laeuft zwischen zwei process()).
// Im Block wird nichts angelegt ausser den Nachrichten selbst (Pegel ~30 Hz, Steps bei Bedarf); Sampler-Material
// wird beim Eintreffen in den WASM-Speicher kopiert.
import './environment-shim.js';
import NinebeatEngineModule from './ninebeat_engine.js';

const QUANTUM = 128;

class NinebeatEngineProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ready = false;
    this.pending = [];
    this.M = null;
    this.inst = 0;
    this.edition = (options && options.processorOptions && options.processorOptions.edition) || 'full';
    this.typeIndex = new Map();
    this.sendParamIndex = new Map();
    this.masteringParamIndex = new Map();
    this.levelFields = [];
    this.tick = 0;
    this.levelTicks = 0;
    this.levelEvery = Math.max(1, Math.round(sampleRate / QUANTUM / 30)); // ~30 Hz wie der Timer des Hosts
    this.callbacks = 0;
    this.unknownCommands = 0;
    this.timed = [];
    this.scopeReadyAt = 0;
    this.scopeLastFrame = 0;
    this.scopeEvents = 0;
    this.scopeBytes = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  init(wasmBinary) {
    NinebeatEngineModule({ wasmBinary }).then((M) => {
      this.M = M;
      const S = (ptr) => M.UTF8ToString(ptr);
      this.inst = M._nbw_create();
      M._nbw_prepare(this.inst, sampleRate);
      for (let t = 1; t < M._nbw_numCommandTypes(); t++) this.typeIndex.set(S(M._nbw_commandName(t)), t);
      for (let i = 0; i < M._nbw_numSendParams(); i++) this.sendParamIndex.set(S(M._nbw_sendParamName(i)), i);
      for (let i = 0; i < M._nbw_numMasteringParams(); i++) this.masteringParamIndex.set(S(M._nbw_masteringParamName(i)), i);
      this.numP = M._nbw_numP();
      // `voice[11]` Liste, `playing?` Schalter, sonst Zahl.
      this.levelFields = S(M._nbw_levelsLayout()).split(',').map((f) => {
        const m = /^(\w+)(?:\[(\d+)\])?(\?)?$/.exec(f);
        return { name: m[1], count: m[2] ? Number(m[2]) : 1, list: !!m[2], bool: !!m[3] };
      });
      this.stepFields = S(M._nbw_stepFields()).split(',');
      this.cmdPtr = M._nbw_commandBuffer(this.inst) >> 3;
      this.io = [0, 1, 2, 3].map((k) => M._nbw_io(this.inst, k) >> 2);
      this.stepPtr = M._nbw_stepBuffer(this.inst) >> 3;
      this.scopeWindow = M._nbw_scopeWindow();
      this.scopePtr = M._nbw_scopeBuffer(this.inst) >> 1;
      this.captureFrames = M._nbw_captureFrames();
      this.capturePtr = [M._nbw_captureBuffer(this.inst, 0) >> 2, M._nbw_captureBuffer(this.inst, 1) >> 2];
      this.recordPtr = [M._nbw_recordBuffer(this.inst, 0) >> 2, M._nbw_recordBuffer(this.inst, 1) >> 2];
      this.tapPtr = [0, 1, 2, 3, 4, 5, 6, 7].map((t) => [M._nbw_tapBuffer(this.inst, t, 0) >> 2, M._nbw_tapBuffer(this.inst, t, 1) >> 2]);
      this.tapsOn = false;
      this.ready = true;
      const queued = this.pending;
      this.pending = [];
      for (const msg of queued) this.onMessage(msg);
      this.port.postMessage({ t: 'ready', info: this.info() });
    }).catch((err) => this.port.postMessage({ t: 'error', message: String(err && err.stack || err) }));
  }

  onMessage(msg) {
    if (!msg) return;
    if (msg.t === 'init') { this.init(msg.wasmBinary); return; }
    if (!this.ready) { this.pending.push(msg); return; }
    switch (msg.t) {
      case 'cmd': this.applyCommand(msg.c); break;
      case 'cmds':
        if (typeof msg.at === 'number') {
          // Stabil nach Frame einsortieren (gleicher Frame: Ankunftsreihenfolge).
          let i = this.timed.length;
          while (i > 0 && this.timed[i - 1].at > msg.at) i--;
          this.timed.splice(i, 0, { at: msg.at, list: msg.list });
        } else {
          for (const c of msg.list) this.applyCommand(c);
        }
        break;
      case 'fn': {
        let result;
        try { result = this.call(msg.name, msg.args || []); } catch (err) { result = { ok: false, error: String(err) }; }
        const transfer = result && result.__transfer;
        if (transfer) delete result.__transfer;
        this.port.postMessage({ t: 'done', id: msg.id, result }, transfer || []);
        break;
      }
      case 'ack': this.port.postMessage({ t: 'ack', n: msg.n }); break;
      default: break;
    }
  }

  /** Ein Befehl in der Form von `nbCommand` - Typ und Namen ueber die Tabelle des Moduls. */
  applyCommand(c) {
    const M = this.M;
    const type = this.typeIndex.get(c.type);
    if (type === undefined) { this.unknownCommands++; return; }
    let a = c.a | 0;
    if (c.type === 'sendParam' || c.type === 'masteringParam') {
      const idx = (c.type === 'sendParam' ? this.sendParamIndex : this.masteringParamIndex).get(c.name);
      if (idx === undefined) { this.unknownCommands++; return; }
      a = idx;
    }
    const H = M.HEAPF64;
    const o = this.cmdPtr;
    H[o] = type; H[o + 1] = a; H[o + 2] = c.b | 0; H[o + 3] = c.c | 0; H[o + 4] = c.d | 0;
    H[o + 5] = typeof c.v === 'number' ? c.v : 0;
    // Zeitbasis: ein Befehl wirkt am Anfang des naechsten Blocks; Verzoegerungen (POLY-6-Gegenprobe) zaehlen ab dort.
    H[o + 6] = 0; H[o + 7] = 0;
    const p = c.p;
    for (let i = 0; i < this.numP; i++) H[o + 8 + i] = p && i < p.length ? +p[i] : 0;
    M._nbw_apply(this.inst, 0);
  }

  info() {
    const M = this.M;
    const chain = M ? M._nbw_chainLatencySamples(this.inst) : 0;
    return {
      backend: 'wasm', edition: this.edition, sampleRate, blockSize: QUANTUM,
      chainLatencySamples: chain, chainLatencyMs: 1000 * chain / sampleRate,
      commandTypes: this.typeIndex.size,
      // Die Namen, wie das Modul sie meldet (engine/protocol/Command.cpp) - fuer die Pruefung [77].
      commandNames: [...this.typeIndex.keys()],
      health: {
        callbacks: this.callbacks,
        oversizeBlocks: M ? M._nbw_oversizeBlocks(this.inst) : 0,
        stepsDropped: M ? M._nbw_stepsDropped(this.inst) : 0,
        captureDropped: M ? M._nbw_captureDropped(this.inst) : 0,
        unknownCommands: this.unknownCommands,
      },
      scopeMask: this.scopeMask || 0,
    };
  }

  /** Die Funktionen, die im Host native Funktionen sind - dieselben Namen, Argumente und Antworten. */
  call(name, args) {
    const M = this.M;
    const arg = args[0] || {};
    switch (name) {
      case 'nbExport': {
        const ptr = M._nbw_exportState(this.inst);
        const json = M.UTF8ToString(ptr);
        M._free(ptr);
        return json;
      }
      case 'nbImport': {
        const ptr = M.stringToNewUTF8(String(args[0] || ''));
        const ok = M._nbw_importState(this.inst, ptr) === 1;
        M._free(ptr);
        return ok;
      }
      case 'nbSamplerMaterial': {
        // { pad, sampleRate, channels, length, data: Float32Array planar, start, end, whole } - length 0 leert das Pad.
        const length = arg.length | 0;
        const channels = Math.max(1, Math.min(2, arg.channels | 0 || 1));
        let ptr = 0;
        if (length > 0) {
          const data = arg.data instanceof Float32Array ? arg.data : new Float32Array(arg.data || 0);
          if (data.length < length * channels) return { ok: false, error: 'Zu wenige Daten.' };
          ptr = M._malloc(length * channels * 4);
          M.HEAPF32.set(data.subarray(0, length * channels), ptr >> 2);
        }
        const ok = M._nbw_samplerMaterial(this.inst, arg.pad | 0, ptr, channels, length, +arg.sampleRate || sampleRate,
          +arg.start || 0, arg.end === undefined ? 1 : +arg.end, arg.whole ? 1 : 0) === 1;
        if (ptr) M._free(ptr);
        if (!ok) return { ok: false, error: 'Vorhoeren ohne Material.' };
        return { ok: true, via: length > 0 ? 'data' : 'clear', length, channels, sampleRate: +arg.sampleRate || sampleRate };
      }
      case 'nbCapture': {
        if (arg.op === 'open') {
          const source = arg.source | 0;
          if (source < 0 || source > 5) return { ok: false, error: 'Unknown source.' };
          this.applyCommand({ type: 'captureOpen', a: source, b: arg.epoch | 0 });
          return { ok: true, sampleRate };
        }
        if (arg.op === 'close') { this.applyCommand({ type: 'captureClose' }); return { ok: true }; }
        if (arg.op === 'monitor') { this.applyCommand({ type: 'captureMonitor', a: arg.on ? 1 : 0 }); return { ok: true }; }
        return { ok: false };
      }
      case 'nbScope': {
        if (arg.op === 'watch') {
          const mask = Math.max(0, Math.min(31, arg.mask | 0));
          // Frisch eingeschaltet: erst ab einem vollen neuen Fenster senden (wie WebBridge::handleScope).
          if (!this.scopeMask && mask) this.scopeReadyAt = M._nbw_scopeWritten(this.inst) + this.scopeWindow;
          this.scopeMask = mask;
          M._nbw_setScopeMask(this.inst, mask);
          return { ok: true, mask };
        }
        if (arg.op === 'stats') {
          const r = { events: this.scopeEvents, chars: this.scopeBytes, mask: this.scopeMask || 0, frame: M._nbw_scopeWritten(this.inst) };
          if (arg.reset) { this.scopeEvents = 0; this.scopeBytes = 0; }
          return r;
        }
        return { ok: false };
      }
      case 'nbRecord': {
        // Session-Mitschnitt (D4-w2): die Summe vor der Master-Lautstaerke als Bloecke - Datei und WAV macht die Oberflaeche.
        if (arg.op === 'start') { M._nbw_recordStart(this.inst, arg.epoch | 0); return { ok: true, sampleRate }; }
        if (arg.op === 'stop') { M._nbw_recordStop(this.inst); return { ok: true }; }
        return { ok: false };
      }
      case 'nbTaps': {
        // Messausgaenge 1..8 (Drums, Bass, Sampler, POLY-6, MASTER vor der Lautstaerke, Rueckweg Delay, Phaser, Hall) ein/aus -
        // fuer AnalyserNodes der
        // Funktionspruefung (D4-w2). Aus: nichts wird kopiert, die Ausgaenge bleiben still.
        this.tapsOn = !!arg.on;
        M._nbw_setTaps(this.inst, this.tapsOn ? 1 : 0);
        return { ok: true, on: this.tapsOn };
      }
      case 'nbStemSnapshot': {
        // Stem-Export (ARRANGER A3): Journal aller Setter und der NB-09-Zustand als Bytes (engine/export/StateJournal).
        // Gerendert wird NICHT hier - die Seite startet damit ein eigenes Exemplar des Moduls und rechnet offline.
        // Die Demo-Ausgabe exportiert nicht (D4-w3): ihr Bundle ruft dies nie auf, und der Worklet gibt ihr auch nichts.
        if (this.edition === 'demo') return { ok: false, error: 'Kein Stem-Export in der Demo.' };
        const size = M._nbw_snapshot(this.inst);
        if (size <= 0) return { ok: false, error: 'Kein Engine-Zustand.' };
        const ptr = M._nbw_snapshotData(this.inst);
        const bytes = M.HEAPU8.slice(ptr, ptr + size).buffer;
        return { ok: true, bytes, sampleRate, entries: M._nbw_journalSize(this.inst), __transfer: [bytes] };
      }
      case 'nbInfo': return this.info();
      case 'nbHealthReset': this.callbacks = 0; return true;
      default: return { ok: false, error: `Unknown function ${name}.` };
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!this.ready) {
      for (const ch of out) ch.fill(0);
      return true;
    }
    const M = this.M;
    const F = M.HEAPF32;
    const input = inputs[0];
    const numIn = input ? Math.min(2, input.length) : 0;
    for (let k = 0; k < numIn; k++) {
      const src = input[k];
      const base = this.io[k];
      for (let i = 0; i < QUANTUM; i++) F[base + i] = src[i];
    }
    // Befehle mit Frame: der Block wird an jedem geteilt (sonst wirkt alles am Blockanfang, wie im Host).
    let pos = 0;
    const base = currentFrame;
    while (this.timed.length && this.timed[0].at < base + QUANTUM) {
      const split = Math.max(0, Math.min(QUANTUM, this.timed[0].at - base));
      if (split > pos) { M._nbw_render(this.inst, numIn, pos, split - pos); pos = split; }
      for (const c of this.timed.shift().list) this.applyCommand(c);
    }
    if (pos < QUANTUM) M._nbw_render(this.inst, numIn, pos, QUANTUM - pos);
    const F2 = M.HEAPF32;
    for (let k = 0; k < out.length; k++) {
      const dst = out[k];
      const base = this.io[k === 0 ? 2 : 3];
      for (let i = 0; i < QUANTUM; i++) dst[i] = F2[base + i];
    }
    if (this.tapsOn) {
      for (let t = 0; t < this.tapPtr.length && t + 1 < outputs.length; t++) {
        const o = outputs[t + 1];
        for (let c = 0; c < o.length && c < 2; c++) {
          const base = this.tapPtr[t][c];
          const dst = o[c];
          for (let i = 0; i < QUANTUM; i++) dst[i] = F2[base + i];
        }
      }
    }
    this.callbacks++;
    M._nbw_housekeeping(this.inst);
    this.emitSteps();
    this.emitCapture();
    this.emitRecord();
    if (++this.tick >= this.levelEvery) {
      this.tick = 0;
      this.emitLevels();
      this.emitScope();
      if (++this.levelTicks % 15 === 0) this.emitLatency();
    }
    return true;
  }

  emitSteps() {
    const M = this.M;
    const n = M._nbw_popSteps(this.inst);
    if (n <= 0) return;
    const H = M.HEAPF64;
    const f = this.stepFields;
    const events = new Array(n);
    for (let k = 0; k < n; k++) {
      const o = this.stepPtr + k * f.length;
      const e = {};
      for (let j = 0; j < f.length; j++) e[f[j]] = H[o + j];
      // Wie WebBridge::emitSteps: t/x nur, wenn der SAMPLER-Schrittgeber etwas angeschlagen/beendet hat.
      if (!e.t && !e.x) { delete e.t; delete e.x; }
      // m: Step in einem Takt, den der Arranger stummschaltet (D4-5d) - wie im Host nur, wenn gesetzt.
      if (!e.m) delete e.m;
      events[k] = e;
    }
    this.port.postMessage({ t: 'ev', name: 'nbSteps', payload: { events, sampleRate, dropped: M._nbw_stepsDropped(this.inst) } });
  }

  emitCapture() {
    const M = this.M;
    for (;;) {
      const epoch = M._nbw_captureRead(this.inst);
      if (epoch < 0) return;
      const n = this.captureFrames;
      const data = new Float32Array(n * 2);
      data.set(M.HEAPF32.subarray(this.capturePtr[0], this.capturePtr[0] + n), 0);
      data.set(M.HEAPF32.subarray(this.capturePtr[1], this.capturePtr[1] + n), n);
      this.port.postMessage({ t: 'ev', name: 'nbCaptureBlock',
        payload: { epoch, sampleRate, frames: n, dropped: M._nbw_captureDropped(this.inst), data } }, [data.buffer]);
    }
  }

  emitRecord() {
    const M = this.M;
    for (;;) {
      const epoch = M._nbw_recordRead(this.inst);
      if (epoch < 0) return;
      const n = this.captureFrames;
      const data = new Float32Array(n * 2);
      data.set(M.HEAPF32.subarray(this.recordPtr[0], this.recordPtr[0] + n), 0);
      data.set(M.HEAPF32.subarray(this.recordPtr[1], this.recordPtr[1] + n), n);
      this.port.postMessage({ t: 'ev', name: 'nbRecordBlock',
        payload: { epoch, sampleRate, frames: n, dropped: M._nbw_recordDropped(this.inst), data } }, [data.buffer]);
    }
  }

  emitLevels() {
    const M = this.M;
    const ptr = M._nbw_levels(this.inst) >> 3;
    const H = M.HEAPF64;
    const payload = {};
    let k = ptr;
    for (const f of this.levelFields) {
      if (f.list) {
        const arr = new Array(f.count);
        for (let i = 0; i < f.count; i++) arr[i] = H[k++];
        payload[f.name] = arr;
      } else {
        const v = H[k++];
        payload[f.name] = f.bool ? v !== 0 : v;
      }
    }
    this.port.postMessage({ t: 'ev', name: 'nbLevels', payload });
  }

  emitLatency() {
    const chain = this.M._nbw_chainLatencySamples(this.inst);
    this.port.postMessage({ t: 'ev', name: 'nbLatency', payload: {
      blockMs: 1000 * QUANTUM / sampleRate, chainMs: 1000 * chain / sampleRate, chainSamples: chain,
      blockSize: QUANTUM, sampleRate, count: 0, invokeToBlockMs: 0, medianMs: 0, maxMs: 0, deviceOutputMs: 0,
    } });
  }

  emitScope() {
    const mask = this.scopeMask || 0;
    if (!mask) return;
    const M = this.M;
    const written = M._nbw_scopeWritten(this.inst);
    if (written < this.scopeReadyAt || written === this.scopeLastFrame) return;
    const n = this.scopeWindow;
    const ch = [];
    const transfer = [];
    let frame = 0;
    for (let c = 0; c < 5; c++) {
      if (!(mask & (1 << c))) { ch.push(null); continue; }
      const at = M._nbw_scopeRead(this.inst, c);
      if (!at) { ch.push(null); continue; }
      frame = Math.max(frame, at);
      const w = new Int16Array(n);
      w.set(M.HEAP16.subarray(this.scopePtr, this.scopePtr + n));
      ch.push(w);
      transfer.push(w.buffer);
      this.scopeBytes += n * 2;
    }
    if (!frame) return;
    this.scopeLastFrame = written;
    this.scopeEvents++;
    this.port.postMessage({ t: 'ev', name: 'nbScope', payload: { sr: sampleRate, n, frame, ch } }, transfer);
  }
}

registerProcessor('ninebeat-engine-processor', NinebeatEngineProcessor);
