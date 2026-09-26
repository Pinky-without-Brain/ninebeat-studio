class DiodeLadderFilter {
  constructor() {
    this.sampleRate = 44100;
    this.oversample = 2;
    this.oversampledRate = 88200;

    this.z1 = 0;
    this.z2 = 0;
    this.z3 = 0;
    this.z4 = 0;

    this.dcBlockerR = 0.998;
    this.dcBlockerInput = 0;
    this.dcBlockerOutput = 0;

    this.previousRawInput = 0;
    this.previousU = 0;

    this.stageGains = [0, 0, 0, 0];
    this.feedbackAmount = 0;

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
    this.dcBlockerInput = 0;
    this.dcBlockerOutput = 0;
    this.previousRawInput = 0;
    this.previousU = 0;
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

  previewDcBlocked(y4) {
    return y4 - this.dcBlockerInput + this.dcBlockerR * this.dcBlockerOutput;
  }

  evaluateCascade(u) {
    let dy_du = 1.0;

    const e1 = u - this.z1;
    const t1 = Math.tanh(e1);
    const v1 = t1 * this.stageGains[0];
    const y1 = v1 + this.z1;
    dy_du *= this.stageGains[0] * (1.0 - t1 * t1);

    const e2 = y1 - this.z2;
    const t2 = Math.tanh(e2);
    const v2 = t2 * this.stageGains[1];
    const y2 = v2 + this.z2;
    dy_du *= this.stageGains[1] * (1.0 - t2 * t2);

    const e3 = y2 - this.z3;
    const t3 = Math.tanh(e3);
    const v3 = t3 * this.stageGains[2];
    const y3 = v3 + this.z3;
    dy_du *= this.stageGains[2] * (1.0 - t3 * t3);

    const e4 = y3 - this.z4;
    const t4 = Math.tanh(e4);
    const v4 = t4 * this.stageGains[3];
    const y4 = v4 + this.z4;
    dy_du *= this.stageGains[3] * (1.0 - t4 * t4);

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

      if (Math.abs(derivative) > 1e-6) {
        u -= residual / derivative;
      }
    }

    res = this.evaluateCascade(u);
    this.previousU = u;

    this.z1 = res.y1 + res.v1;
    this.z2 = res.y2 + res.v2;
    this.z3 = res.y3 + res.v3;

    const finalFeedback = this.previewDcBlocked(res.y4);
    this.dcBlockerInput = res.y4;
    this.dcBlockerOutput = finalFeedback;

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

class AcidProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.filter = new DiodeLadderFilter();
    this.sampleRate = 44100; // Will be updated on first process call

    this.phase = 0;
    this.subPhase = 0;
    this.currentFrequency = 130.81;
    this.targetFrequency = 130.81;

    this.filterEnvValue = 0;
    this.filterEnvStage = 'idle';
    this.filterEnvAttackSamples = 1;
    this.filterEnvSampleIndex = 0;
    this.filterEnvDecayCoeff = 0;

    this.vcaEnvValue = 0;
    this.vcaEnvStage = 'idle';
    this.vcaEnvAttackSamples = 1;
    this.vcaEnvSampleIndex = 0;
    this.vcaEnvDecayCoeff = 0;

    this.accentSweepValue = 0;
    this.accentSweepDecayCoeff = 0;
    this.currentAccentBoostGain = 1.0;

    this.gateOpen = false;
    this.currentGateGain = 0;
    this.targetGateGain = 0;
    this.gateRampStep = 0.007;

    // Default params
    this.params = {
      tuning: 0,
      waveform: 'saw',
      cutoff: 1000,
      resonance: 0.5,
      envMod: 0.5,
      decay: 0.4,
      accent: 0.5,
      overdrive: 0.0,
      subOscLevel: 0.0,
      slideTime: 0.08,
      softAttack: 0.01,
      accentDecay: 0.15,
      voiceLevel: 0.8
    };

    this.concertPitch = 440;

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'updateParams') {
        this.params = msg.params;
        this.accentSweepDecayCoeff = Math.exp(Math.log(0.0001) / (this.sampleRate * 0.1));
        this.gateRampStep = 1.0 / (this.sampleRate * 0.005);
      } else if (msg.type === 'triggerAttack') {
        this.targetFrequency = this.midiToFrequency(msg.midiNote, this.params.tuning);
        this.currentFrequency = this.targetFrequency;

        this.gateOpen = true;
        this.targetGateGain = 1.0;

        const attackTime = msg.isAccented ? 0.003 : Math.max(0.003, this.params.softAttack);
        const decayTime = msg.isAccented ? Math.max(0.02, this.params.accentDecay) : Math.max(0.2, this.params.decay);

        this.filterEnvAttackSamples = Math.max(1, Math.round(attackTime * this.sampleRate));
        this.filterEnvSampleIndex = 0;
        this.filterEnvDecayCoeff = Math.exp(Math.log(0.0001) / (this.sampleRate * decayTime));
        this.filterEnvStage = 'attack';
        this.filterEnvValue = 0.0;

        const vcaDecayTime = 3.5;
        this.vcaEnvAttackSamples = this.filterEnvAttackSamples;
        this.vcaEnvSampleIndex = 0;
        this.vcaEnvDecayCoeff = Math.exp(Math.log(0.0001) / (this.sampleRate * vcaDecayTime));
        this.vcaEnvStage = 'attack';
        this.vcaEnvValue = 0.0;

        const maxAccentBoostGain = 1.585;
        this.currentAccentBoostGain = msg.isAccented ? 1.0 + this.params.accent * (maxAccentBoostGain - 1.0) : 1.0;

        if (msg.isAccented) {
          const chargeAmount = Math.min(1.0, this.params.accent) * 0.4;
          this.accentSweepValue = Math.min(1.0, this.accentSweepValue + chargeAmount);
        }
      } else if (msg.type === 'triggerSlide') {
        this.targetFrequency = this.midiToFrequency(msg.midiNote, this.params.tuning);
      } else if (msg.type === 'gateOff') {
        this.gateOpen = false;
        this.targetGateGain = 0.0;
      } else if (msg.type === 'updateConcertPitch') {
        this.concertPitch = msg.pitch;
      }
    };
  }

  midiToFrequency(midiNote, tuningSemitones) {
    return this.concertPitch * Math.pow(2.0, (midiNote - 69 + tuningSemitones) / 12.0);
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0][0];
    if (!output) return true;

    // Initialize sample rate if not set
    if (this.sampleRate !== globalThis.sampleRate) {
      this.sampleRate = globalThis.sampleRate;
      this.filter.prepare(this.sampleRate);
      this.accentSweepDecayCoeff = Math.exp(Math.log(0.0001) / (this.sampleRate * 0.1));
      this.gateRampStep = 1.0 / (this.sampleRate * 0.005);
    }

    const numSamples = output.length;
    const params = this.params;

    const slideTimeSec = Math.max(0.005, params.slideTime);
    const slideCoeff = 1.0 - Math.exp(-1.0 / (this.sampleRate * slideTimeSec));

    const preGain = 1.0 + params.overdrive * 7.0;
    
    for (let i = 0; i < numSamples; i++) {
      if (this.currentGateGain < this.targetGateGain) {
        this.currentGateGain = Math.min(this.targetGateGain, this.currentGateGain + this.gateRampStep);
      } else if (this.currentGateGain > this.targetGateGain) {
        this.currentGateGain = Math.max(this.targetGateGain, this.currentGateGain - this.gateRampStep);
      }

      this.currentFrequency += (this.targetFrequency - this.currentFrequency) * slideCoeff;

      const phaseInc = this.currentFrequency / this.sampleRate;
      const subPhaseInc = (this.currentFrequency * 0.5) / this.sampleRate;

      let oscSample = 0;

      if (params.waveform === 'saw') {
        let saw = 2.0 * this.phase - 1.0;
        saw -= polyBlep(this.phase, phaseInc);
        saw = saw + 0.15 * saw * saw;
        oscSample = Math.max(-1.0, Math.min(1.0, saw));
      } else {
        const lowAnchor = 32.7;
        const highAnchor = 1046.5;
        const tDuty = Math.max(0, Math.min(1, (Math.log2(this.currentFrequency) - Math.log2(lowAnchor)) / (Math.log2(highAnchor) - Math.log2(lowAnchor))));
        const duty = 0.71 + tDuty * (0.45 - 0.71);

        let sq = this.phase < duty ? 1.0 : -1.0;
        sq += polyBlep(this.phase, phaseInc);
        sq -= polyBlep((this.phase + 1.0 - duty) % 1.0, phaseInc);
        oscSample = sq;
      }

      if (params.subOscLevel > 0.001) {
        let subSample = 0;
        if (params.waveform === 'saw') {
          let subSaw = 2.0 * this.subPhase - 1.0;
          subSaw -= polyBlep(this.subPhase, subPhaseInc);
          subSample = subSaw;
        } else {
          let subSq = this.subPhase < 0.5 ? 1.0 : -1.0;
          subSq += polyBlep(this.subPhase, subPhaseInc);
          subSq -= polyBlep((this.subPhase + 0.5) % 1.0, subPhaseInc);
          subSample = subSq;
        }
        oscSample += subSample * params.subOscLevel * 0.6;
      }

      this.phase += phaseInc;
      if (this.phase >= 1.0) this.phase -= 1.0;

      this.subPhase += subPhaseInc;
      if (this.subPhase >= 1.0) this.subPhase -= 1.0;

      let driven = oscSample;
      if (params.overdrive > 0.001) {
        driven = Math.tanh(oscSample * preGain);
      }

      if (this.filterEnvStage === 'attack') {
        this.filterEnvValue = this.filterEnvSampleIndex / this.filterEnvAttackSamples;
        if (++this.filterEnvSampleIndex >= this.filterEnvAttackSamples) {
          this.filterEnvStage = 'decay';
          this.filterEnvValue = 1.0;
        }
      } else if (this.filterEnvStage === 'decay') {
        this.filterEnvValue *= this.filterEnvDecayCoeff;
        if (this.filterEnvValue < 0.0001) {
          this.filterEnvValue = 0;
          this.filterEnvStage = 'idle';
        }
      }

      if (this.vcaEnvStage === 'attack') {
        this.vcaEnvValue = this.vcaEnvSampleIndex / this.vcaEnvAttackSamples;
        if (++this.vcaEnvSampleIndex >= this.vcaEnvAttackSamples) {
          this.vcaEnvStage = 'decay';
          this.vcaEnvValue = 1.0;
        }
      } else if (this.vcaEnvStage === 'decay') {
        this.vcaEnvValue *= this.vcaEnvDecayCoeff;
        if (this.vcaEnvValue < 0.0001) {
          this.vcaEnvValue = 0;
          this.vcaEnvStage = 'idle';
        }
      }

      this.accentSweepValue *= this.accentSweepDecayCoeff;

      const modulatedCutoff = params.cutoff * Math.pow(2.0, 5.0 * params.envMod * this.filterEnvValue + 2.0 * this.accentSweepValue);

      this.filter.setCutoffAndResonance(modulatedCutoff, params.resonance);
      const filtered = this.filter.processSample(driven);

      const voiceOut = filtered * this.vcaEnvValue * this.currentAccentBoostGain * this.currentGateGain * params.voiceLevel;

      output[i] = voiceOut;
    }

    return true;
  }
}

registerProcessor('acid-processor', AcidProcessor);
