/**
 * Aufnahme-Abgriff im Audio-Thread (S3, Sampler-Plan).
 *
 * WARUM EIN WORKLET. Die erste Fassung nahm ueber einen ScriptProcessorNode
 * auf. Der tauscht Puffer mit dem Hauptthread; kommt der zu spaet, schreibt der
 * Audio-Thread ueber einen noch nicht abgeholten Puffer. Gemessen
 * (tests/manual/probe-capture-jank.mjs): bei 250 ms blockiertem Hauptthread
 * kam ein 200-ms-Ton 226,6 ms lang an, und rund 110 ms Material fehlten -
 * Luecken UND Teilwiederholungen, nachtraeglich nicht auszurichten.
 *
 * Hier werden die Bloecke GESCHICKT. Stockt der Hauptthread, stauen sich die
 * Nachrichten und kommen spaeter vollstaendig und in Reihenfolge an.
 *
 * Gesammelt wird zu Stuecken von BATCH Frames statt je 128er-Quantum: weniger
 * Nachrichten, und ein Stueck ist gross genug fuer den Vorlauf des
 * Schwellwert-Starts (10 ms = 480 Frames bei 48 kHz).
 */
const BATCH = 1024;

class CaptureTapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.l = new Float32Array(BATCH);
    this.r = new Float32Array(BATCH);
    this.n = 0;
    this.aktiv = true;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.aktiv = false;
    };
  }

  process(inputs) {
    if (!this.aktiv) return false;
    const input = inputs[0];
    // Ohne verbundenen Eingang liefert der Browser ein leeres Feld. Das ist
    // Stille, kein Ende - weiterlaufen, damit die Zeitachse durchgehend bleibt.
    const len = input && input[0] ? input[0].length : 128;
    const quelleL = input && input[0] ? input[0] : null;
    const quelleR = input && input[1] ? input[1] : quelleL;
    let i = 0;
    while (i < len) {
      const n = Math.min(len - i, BATCH - this.n);
      if (quelleL) {
        this.l.set(quelleL.subarray(i, i + n), this.n);
        this.r.set(quelleR.subarray(i, i + n), this.n);
      } else {
        this.l.fill(0, this.n, this.n + n);
        this.r.fill(0, this.n, this.n + n);
      }
      this.n += n;
      i += n;
      if (this.n === BATCH) {
        // Uebertragen statt kopieren; danach frische Puffer anlegen.
        this.port.postMessage({ l: this.l, r: this.r }, [this.l.buffer, this.r.buffer]);
        this.l = new Float32Array(BATCH);
        this.r = new Float32Array(BATCH);
        this.n = 0;
      }
    }
    return true;
  }
}

registerProcessor('capture-tap', CaptureTapProcessor);
