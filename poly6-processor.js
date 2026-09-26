class DiodeLadderFilter {
  constructor() {
    this.sampleRate = 44100;
    this.oversample = 2;
    this.oversampledRate = 88200;
    this.z1 = 0; this.z2 = 0; this.z3 = 0; this.z4 = 0;
    this.dcBlockerR = 0.998; this.dcBlockerInput = 0; this.dcBlockerOutput = 0;
    this.previousRawInput = 0; this.previousU = 0;
    this.stageGains = [0, 0, 0, 0]; this.feedbackAmount = 0;
    this.stageDetuneFactors = [0.985, 1.0, 1.02, 0.992];
  }
  prepare(sampleRate) {
    this.sampleRate = sampleRate > 0 ? sampleRate : 44100;
    this.oversampledRate = this.sampleRate * this.oversample;
    const dcBlockCutoffHz = 20.0;
    this.dcBlockerR = 1.0 - (2.0 * Math.PI * dcBlockCutoffHz) / this.oversampledRate;
    this.reset();
  }
  reset() {
    this.z1 = this.z2 = this.z3 = this.z4 = 0;
    this.dcBlockerInput = 0; this.dcBlockerOutput = 0;
    this.previousRawInput = 0; this.previousU = 0;
  }
  setCutoffAndResonance(cutoffHz, resonance01) {
    const safeCutoff = Math.max(10.0, Math.min(this.sampleRate * 0.45, cutoffHz));
    for (let i = 0; i < 4; i++) {
      const stageCutoff = Math.max(5.0, Math.min(this.sampleRate * 0.45, safeCutoff * this.stageDetuneFactors[i]));
      const g = Math.tan((Math.PI * stageCutoff) / this.oversampledRate);
      this.stageGains[i] = g / (1.0 + g);
    }
    this.feedbackAmount = Math.max(0.0, Math.min(1.0, resonance01)) * 4.5;
  }
  previewDcBlocked(y4) { return y4 - this.dcBlockerInput + this.dcBlockerR * this.dcBlockerOutput; }
  evaluateCascade(u) {
    let dy_du = 1.0;
    const e1 = u - this.z1; const t1 = Math.tanh(e1); const v1 = t1 * this.stageGains[0]; const y1 = v1 + this.z1; dy_du *= this.stageGains[0] * (1.0 - t1 * t1);
    const e2 = y1 - this.z2; const t2 = Math.tanh(e2); const v2 = t2 * this.stageGains[1]; const y2 = v2 + this.z2; dy_du *= this.stageGains[1] * (1.0 - t2 * t2);
    const e3 = y2 - this.z3; const t3 = Math.tanh(e3); const v3 = t3 * this.stageGains[2]; const y3 = v3 + this.z3; dy_du *= this.stageGains[2] * (1.0 - t3 * t3);
    const e4 = y3 - this.z4; const t4 = Math.tanh(e4); const v4 = t4 * this.stageGains[3]; const y4 = v4 + this.z4; dy_du *= this.stageGains[3] * (1.0 - t4 * t4);
    return { y1, v1, y2, v2, y3, v3, y4, v4, dy_du };
  }
  processOversampled(x) {
    let u = this.previousU;
    let res = this.evaluateCascade(u);
    for (let iter = 0; iter < 2; iter++) {
      res = this.evaluateCascade(u);
      const feedback = this.previewDcBlocked(res.y4);
      const residual = u + this.feedbackAmount * feedback - x;
      const derivative = 1.0 + this.feedbackAmount * res.dy_du;
      if (Math.abs(derivative) > 1e-6) u -= residual / derivative;
    }
    res = this.evaluateCascade(u);
    this.previousU = u;
    this.z1 = res.y1 + res.v1; this.z2 = res.y2 + res.v2; this.z3 = res.y3 + res.v3;
    const finalFeedback = this.previewDcBlocked(res.y4);
    this.dcBlockerInput = res.y4; this.dcBlockerOutput = finalFeedback;
    this.z4 = res.y4 + res.v4;
    return res.y4;
  }
  processSample(input) {
    let output = 0;
    for (let step = 0; step < this.oversample; step++) {
      const frac = (step + 1) / this.oversample;
      const oversampledInput = this.previousRawInput + (input - this.previousRawInput) * frac;
      output = this.processOversampled(oversampledInput);
    }
    this.previousRawInput = input;
    return output;
  }
}

function polyBlep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1.0;
  } else if (t > 1.0 - dt) {
    t = (t - 1.0) / dt;
    return t * t + t + t + 1.0;
  }
  return 0.0;
}


class Poly6Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleRate = 44100;
    this.noiseSeed = 0x12345678;
    
    // Master Chorus / Flanger / Ensemble delay lines
    this.chorusBufferL = new Float32Array(4096);
    this.chorusBufferR = new Float32Array(4096);
    this.chorusWriteIndex = 0;
    this.chorusLfoPhase1 = 0;
    this.chorusLfoPhase2 = Math.PI * 0.5;
    this.chorusLfoPhase3 = Math.PI;

    this.params = {
      dco: { range: "8'", lfoAmount: 0, sawEnabled: true, squareEnabled: false, triangleEnabled: false, sineEnabled: false, pulseEnabled: false, pwmMode: 'manual', pwmAmount: 0, subEnabled: false, subLevel: 0, noiseLevel: 0 },
      hpf: { mode: 0 },
      vcf: { cutoff: 1000, resonance: 0, envMod: 0, envPolarity: 'pos', lfoMod: 0, keyTrack: 0 },
      vca: { mode: 'env', level: 0.8 },
      adsr: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.1 },
      chorusMode: 'off',
      lfo: { rate: 1 }
    };
    this.concertPitch = 440;
    this.mpe = { pressureToLevel: 0, slideToCutoff: 0 };
    
    this.voices = [];
    for (let i = 0; i < 8; i++) {
      this.voices.push({
        index: i, active: false, midiNote: 0, frequency: 261.63, velocity: 0.8, noteOnTime: 0,
        phase: 0, subPhase: 0, z1: 0, z2: 0, z3: 0, z4: 0,
        hpfX1: 0, hpfX2: 0, hpfY1: 0, hpfY2: 0,
        noteId: 0, bendTarget: 1, bendCurrent: 1, pressureTarget: 0, pressureCurrent: 0,
        timbreTarget: 0, timbreCurrent: 0, envStage: 'idle', envValue: 0,
        attackInc: 0.01, decayCoeff: 0.999, releaseCoeff: 0.999, gateGain: 0, gateTarget: 0
      });
    }

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'init') {
        this.sampleRate = msg.sampleRate;
      } else if (msg.type === 'updateParams') {
        this.params = msg.params;
      } else if (msg.type === 'updateConcertPitch') {
        this.concertPitch = msg.pitch;
        this.mpe = msg.mpe;
      } else if (msg.type === 'noteOn') {
        const v = this.voices[msg.voiceIndex];
        if (v) Object.assign(v, msg.state);
      } else if (msg.type === 'noteOff') {
        const v = this.voices[msg.voiceIndex];
        if (v) {
          v.envStage = 'release';
          v.gateTarget = 0.0;
        }
      } else if (msg.type === 'setExpression') {
        const v = this.voices.find(voice => voice.active && voice.noteId === msg.noteId);
        if (v) {
          if (msg.bend !== undefined) v.bendTarget = msg.bend;
          if (msg.pressure !== undefined) v.pressureTarget = msg.pressure;
          if (msg.timbre !== undefined) v.timbreTarget = msg.timbre;
        }
      } else if (msg.type === 'setZoneBend') {
        for (const v of this.voices) {
          if (v.active) v.bendTarget = msg.bend;
        }
      } else if (msg.type === 'allNotesOff') {
        for (const v of this.voices) {
          v.envStage = 'release';
          v.gateTarget = 0.0;
        }
      }
    };
  }

  process(inputs, outputs, parameters) {
    const outL = outputs[0][0];
    const outR = outputs[0][1];
    if (!outL || !outR) return true;
    
    const len = outL.length;
    outL.fill(0);
    outR.fill(0);

    const { dco, hpf, vcf, vca, adsr, chorusMode, lfo } = this.params;
    const mpe = this.mpe;
    const pressDepth = mpe.pressureToLevel;
    const slideDepth = mpe.slideToCutoff;

    const lfoInc = (2.0 * Math.PI * lfo.rate) / this.sampleRate;

    let chorusRateL = 0.4;
    let chorusRateR = 0.6;
    let chorusDepth = 0.0018;
    let chorusBaseDelay = 0.0055;
    let chorusFeedback = 0.0;

    if (chorusMode === 'I') {
      chorusRateL = 0.4; chorusRateR = 0.55; chorusDepth = 0.0018; chorusBaseDelay = 0.0055;
    } else if (chorusMode === 'II') {
      chorusRateL = 0.65; chorusRateR = 0.85; chorusDepth = 0.0032; chorusBaseDelay = 0.0055;
    } else if (chorusMode === 'I+II') {
      chorusRateL = 7.5; chorusRateR = 8.2; chorusDepth = 0.0015; chorusBaseDelay = 0.004;
    } else if (chorusMode === 'flanger') {
      chorusRateL = 0.15; chorusRateR = 0.18; chorusDepth = 0.0008; chorusBaseDelay = 0.0012; chorusFeedback = 0.68;
    } else if (chorusMode === 'ensemble') {
      chorusRateL = 0.35; chorusRateR = 0.48; chorusDepth = 0.0028; chorusBaseDelay = 0.0065;
    }

    const chorusIncL = (2.0 * Math.PI * chorusRateL) / this.sampleRate;
    const chorusIncR = (2.0 * Math.PI * chorusRateR) / this.sampleRate;

    for (let i = 0; i < len; i++) {
      let drySum = 0.0;

      this.chorusLfoPhase1 += chorusIncL;
      if (this.chorusLfoPhase1 > 2.0 * Math.PI) this.chorusLfoPhase1 -= 2.0 * Math.PI;

      this.chorusLfoPhase2 += chorusIncR;
      if (this.chorusLfoPhase2 > 2.0 * Math.PI) this.chorusLfoPhase2 -= 2.0 * Math.PI;

      this.chorusLfoPhase3 += chorusIncL * 1.33;
      if (this.chorusLfoPhase3 > 2.0 * Math.PI) this.chorusLfoPhase3 -= 2.0 * Math.PI;

      for (let v = 0; v < this.voices.length; v++) {
        const voice = this.voices[v];
        if (voice.envStage === 'idle' && voice.gateGain <= 0.0001) {
          voice.active = false;
          continue;
        }

        voice.bendCurrent += (voice.bendTarget - voice.bendCurrent) * 0.01;
        voice.pressureCurrent += (voice.pressureTarget - voice.pressureCurrent) * 0.01;
        voice.timbreCurrent += (voice.timbreTarget - voice.timbreCurrent) * 0.01;

        const lfoVal = Math.sin(this.chorusLfoPhase1);
        const pitchMod = 1.0 + lfoVal * dco.lfoAmount * 0.04;
        const noteFreq = voice.frequency * voice.bendCurrent * pitchMod;
        const dt = noteFreq / this.sampleRate;

        voice.phase += dt;
        if (voice.phase >= 1.0) voice.phase -= 1.0;

        voice.subPhase += dt * 0.5;
        if (voice.subPhase >= 1.0) voice.subPhase -= 1.0;

        let oscOut = 0.0;

        if (dco.sawEnabled) {
          let saw = 2.0 * voice.phase - 1.0;
          saw -= polyBlep(voice.phase, dt);
          oscOut += saw * 0.8;
        }

        if (dco.squareEnabled) {
          let sq = voice.phase < 0.5 ? 1.0 : -1.0;
          sq += polyBlep(voice.phase, dt);
          sq -= polyBlep((voice.phase + 0.5) % 1.0, dt);
          oscOut += sq * 0.7;
        }

        if (dco.triangleEnabled) {
          const tri = 1.0 - 4.0 * Math.abs(voice.phase - 0.5);
          oscOut += tri * 0.8;
        }

        if (dco.sineEnabled) {
          oscOut += Math.sin(2.0 * Math.PI * voice.phase) * 0.8;
        }

        if (dco.pulseEnabled) {
          let pw = 0.5;
          if (dco.pwmMode === 'manual') {
            pw = 0.05 + dco.pwmAmount * 0.9;
          } else {
            pw = 0.5 + Math.sin(this.chorusLfoPhase2) * (dco.pwmAmount * 0.42);
          }
          pw = Math.max(0.05, Math.min(0.95, pw));

          let pulse = voice.phase < pw ? 1.0 : -1.0;
          pulse += polyBlep(voice.phase, dt);
          pulse -= polyBlep((voice.phase - pw + 1.0) % 1.0, dt);
          oscOut += pulse * 0.75;
        }

        if (dco.subEnabled && dco.subLevel > 0) {
          const sub = voice.subPhase < 0.5 ? 1.0 : -1.0;
          oscOut += sub * dco.subLevel * 0.7;
        }

        if (dco.noiseLevel > 0) {
          this.noiseSeed = (this.noiseSeed * 1664525 + 1013904223) | 0;
          const white = ((this.noiseSeed & 0xffff) / 32768.0) - 1.0;
          oscOut += white * dco.noiseLevel * 0.35;
        }

        let filteredHpf = oscOut;
        if (hpf.mode === 1) {
          const cutNorm = (2.0 * Math.PI * 120.0) / this.sampleRate;
          const a = 1.0 / (1.0 + cutNorm);
          voice.hpfY1 = a * (voice.hpfY1 + oscOut - voice.hpfX1);
          voice.hpfX1 = oscOut;
          filteredHpf = voice.hpfY1;
        } else if (hpf.mode === 2) {
          const cutNorm = (2.0 * Math.PI * 240.0) / this.sampleRate;
          const a = 1.0 / (1.0 + cutNorm);
          voice.hpfY1 = a * (voice.hpfY1 + oscOut - voice.hpfX1);
          voice.hpfX1 = oscOut;
          filteredHpf = voice.hpfY1;
        } else if (hpf.mode === 3) {
          const f0 = 90.0;
          const Q = 1.4;
          const boostGain = 1.55;
          const w0 = (2.0 * Math.PI * f0) / this.sampleRate;
          const alpha = Math.sin(w0) / (2.0 * Q);
          const a0 = 1.0 + alpha / boostGain;
          const b0 = (1.0 + alpha * boostGain) / a0;
          const b1 = (-2.0 * Math.cos(w0)) / a0;
          const b2 = (1.0 - alpha * boostGain) / a0;
          const a1 = (-2.0 * Math.cos(w0)) / a0;
          const a2 = (1.0 - alpha / boostGain) / a0;

          const y = b0 * oscOut + b1 * voice.hpfX1 + b2 * voice.hpfX2 - a1 * voice.hpfY1 - a2 * voice.hpfY2;
          voice.hpfX2 = voice.hpfX1;
          voice.hpfX1 = oscOut;
          voice.hpfY2 = voice.hpfY1;
          voice.hpfY1 = y;
          filteredHpf = y * 0.9;
        }

        if (voice.envStage === 'attack') {
          voice.envValue += voice.attackInc;
          if (voice.envValue >= 1.0) {
            voice.envValue = 1.0;
            voice.envStage = 'decay';
          }
        } else if (voice.envStage === 'decay') {
          voice.envValue = adsr.sustain + (voice.envValue - adsr.sustain) * voice.decayCoeff;
          if (Math.abs(voice.envValue - adsr.sustain) < 0.002) {
            voice.envValue = adsr.sustain;
            voice.envStage = 'sustain';
          }
        } else if (voice.envStage === 'release') {
          voice.envValue *= voice.releaseCoeff;
          if (voice.envValue <= 0.0005) {
            voice.envValue = 0;
            voice.envStage = 'idle';
            voice.active = false;
          }
        }

        let envModAmt = vcf.envMod * (vcf.envPolarity === 'pos' ? 1.0 : -1.0);
        const keyTrackFactor = Math.pow(2.0, ((voice.midiNote - 60) / 12.0) * vcf.keyTrack);
        const lfoCutMod = Math.sin(this.chorusLfoPhase2) * vcf.lfoMod * 0.5;

        let effectiveCutoff = vcf.cutoff * keyTrackFactor * Math.pow(2.0, envModAmt * voice.envValue * 4.0 + lfoCutMod);
        if (voice.timbreCurrent > 0) {
          effectiveCutoff *= Math.pow(2.0, voice.timbreCurrent * slideDepth * 2.5);
        }
        effectiveCutoff = Math.max(15.0, Math.min(this.sampleRate * 0.45, effectiveCutoff));

        const g = Math.tan((Math.PI * effectiveCutoff) / this.sampleRate);
        const gNorm = g / (1.0 + g);
        const resoFeedback = Math.max(0.0, Math.min(0.98, vcf.resonance)) * 3.85;

        const u = Math.tanh(filteredHpf - resoFeedback * voice.z4);

        const v1 = (u - voice.z1) * gNorm;
        const y1 = v1 + voice.z1;
        voice.z1 = y1 + v1;

        const v2 = (y1 - voice.z2) * gNorm;
        const y2 = v2 + voice.z2;
        voice.z2 = y2 + v2;

        const v3 = (y2 - voice.z3) * gNorm;
        const y3 = v3 + voice.z3;
        voice.z3 = y3 + v3;

        const v4 = (y3 - voice.z4) * gNorm;
        const y4 = v4 + voice.z4;
        voice.z4 = y4 + v4;

        voice.gateGain += (voice.gateTarget - voice.gateGain) * 0.02;
        let vcaAmp = vca.mode === 'env' ? voice.envValue : voice.gateGain;
        const dynamics = voice.velocity + (1.0 - voice.velocity) * voice.pressureCurrent * pressDepth;
        vcaAmp *= dynamics * vca.level;

        drySum += y4 * vcaAmp * 0.38;
      }

      if (chorusMode === 'off') {
        outL[i] = Math.tanh(drySum);
        outR[i] = Math.tanh(drySum);
      } else {
        const bufferSize = this.chorusBufferL.length;
        const writeIdx = this.chorusWriteIndex;

        const modL = (Math.sin(this.chorusLfoPhase1) + 1.0) * 0.5;
        const delaySamplesL = (chorusBaseDelay + modL * chorusDepth) * this.sampleRate;

        const modR = (Math.sin(this.chorusLfoPhase2) + 1.0) * 0.5;
        const delaySamplesR = (chorusBaseDelay + modR * chorusDepth) * this.sampleRate;

        let readIdxL = writeIdx - delaySamplesL;
        if (readIdxL < 0) readIdxL += bufferSize;
        const idxL_int = Math.floor(readIdxL);
        const fracL = readIdxL - idxL_int;
        const wetL =
          this.chorusBufferL[idxL_int % bufferSize] * (1.0 - fracL) +
          this.chorusBufferL[(idxL_int + 1) % bufferSize] * fracL;

        let readIdxR = writeIdx - delaySamplesR;
        if (readIdxR < 0) readIdxR += bufferSize;
        const idxR_int = Math.floor(readIdxR);
        const fracR = readIdxR - idxR_int;
        const wetR =
          this.chorusBufferR[idxR_int % bufferSize] * (1.0 - fracR) +
          this.chorusBufferR[(idxR_int + 1) % bufferSize] * fracR;

        let ensembleTap = 0.0;
        if (chorusMode === 'ensemble') {
          const mod3 = (Math.sin(this.chorusLfoPhase3) + 1.0) * 0.5;
          const delaySamples3 = (chorusBaseDelay + mod3 * chorusDepth * 1.2) * this.sampleRate;
          let readIdx3 = writeIdx - delaySamples3;
          if (readIdx3 < 0) readIdx3 += bufferSize;
          const idx3_int = Math.floor(readIdx3);
          const frac3 = readIdx3 - idx3_int;
          const tapA = (this.chorusBufferL[idx3_int % bufferSize] + this.chorusBufferR[idx3_int % bufferSize]) * 0.5;
            const tapB = (this.chorusBufferL[(idx3_int + 1) % bufferSize] + this.chorusBufferR[(idx3_int + 1) % bufferSize]) * 0.5;
            ensembleTap = tapA * (1.0 - frac3) + tapB * frac3;
        }

        this.chorusBufferL[writeIdx] = drySum + wetL * chorusFeedback;
        this.chorusBufferR[writeIdx] = drySum + wetR * chorusFeedback;
        this.chorusWriteIndex = (writeIdx + 1) % bufferSize;

        if (chorusMode === 'flanger') {
          outL[i] = Math.tanh((drySum + wetL * 0.85) * 0.72);
          outR[i] = Math.tanh((drySum + wetR * 0.85) * 0.72);
        } else if (chorusMode === 'ensemble') {
          outL[i] = Math.tanh((drySum * 0.45 + wetL * 0.65 + ensembleTap * 0.45) * 0.75);
          outR[i] = Math.tanh((drySum * 0.45 + wetR * 0.65 - ensembleTap * 0.45) * 0.75);
        } else {
          outL[i] = Math.tanh((drySum * 0.7 + wetL * 0.7) * 0.85);
          outR[i] = Math.tanh((drySum * 0.7 + wetR * 0.7) * 0.85);
        }
      }
    }
    
    // Post peak level periodically? No, the worklet could send a message if we wanted, but UI might not need it right away or we can just send it occasionally. Let's send it occasionally or let the analyser node do the metering.
    // Analyser node handles metering, so peakLevel in DSP isn't strictly required to be sent back unless it's used directly.
    return true;
  }
}

registerProcessor('poly6-processor', Poly6Processor);
