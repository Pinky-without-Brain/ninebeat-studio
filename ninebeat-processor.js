// GUI-VARIANTE "WEB" (Branch gui-cyberpunk-web): AudioWorkletProcessor, der
// den kompletten Klangkern (siehe web/src/WebEngine.h) DIREKT in diesem
// eigenen Echtzeit-Audio-Thread laedt und rendert - der Haupt-Thread (siehe
// app.js) fasst die eigentliche WASM-Instanz nie an, sondern kommuniziert
// ausschliesslich per this.port.postMessage() (Parameter-/Step-Aenderungen
// rein, Playhead-/Oszilloskop-Daten raus). Das ist die von der Web-Audio-
// Spezifikation vorgesehene Architektur fuer Audio-Verarbeitung mit
// garantiert glitch-freiem Timing (der Haupt-Thread darf beliebig lange
// blockieren - z. B. durch Layout/Malerei -, ohne den Audio-Callback zu
// stoeren).
//
// audioWorklet.addModule() laedt diese Datei als ECHTES ES-Modul (siehe
// Web-Audio-Spezifikation) - der "import"-Ausdruck unten funktioniert daher
// genau wie in einem regulaeren Modul-Skript.
//
// environment-shim.js MUSS vor ninebeat_web_engine.js importiert werden
// (siehe dortigen Kommentar) - Geschwister-Importe eines Moduls werden in
// Quelltext-Reihenfolge ausgewertet, das sichert die richtige Reihenfolge.
import './environment-shim.js';
import NinebeatModule from './ninebeat_web_engine.js';

// Web-Audio-API-Spezifikation: process() wird IMMER mit exakt 128 Samples
// pro Kanal aufgerufen (das "Render Quantum") - fest, nicht von der
// tatsaechlichen Blockgroesse des Audio-Grafen abhaengig.
const RENDER_QUANTUM = 128;

// Wie oft (in process()-Aufrufen) eine leichte Playhead-Nachricht an den
// Haupt-Thread gesendet wird - postMessage() aus dem Echtzeit-Audio-Thread
// heraus ist nicht kostenlos; jeden einzelnen Aufruf zu senden (~344/s bei
// 44.1kHz) waere unnoetiger Overhead fuer eine reine Anzeige. Alle 4
// Aufrufe (~86 Hz) wirkt fuer Playhead-/Sektions-Hervorhebung weiterhin
// vollkommen fluessig.
const PLAYHEAD_UPDATE_INTERVAL = 4;

/** Deklarative Liste aller "einfachen" ninebeat_*-Aufrufe (kein Rueckgabe-
    wert, keine Puffer/Zeiger-Handhabung noetig) - jede Nachricht vom Haupt-
    Thread mit passendem type-Feld wird direkt auf die gleichnamige
    (ohne "ninebeat_"-Praefix) Engine-Funktion durchgereicht, Argumente in
    der angegebenen Reihenfolge aus den gleichnamigen Nachrichtenfeldern
    gelesen. Deckt praktisch die gesamte Web-GUI-Bedienoberflaeche ab
    (Parameter, Steps inkl. Detail-Felder, Song-Sektionen, Mute/Solo,
    Tempo/Swing) ohne 20+ redundante switch-Faelle. */
const SIMPLE_CALLS = {
    setParameter:               { fn: 'setParameter',               args: ['index', 'value'] },
    setPlaying:                 { fn: 'setPlaying',                 args: ['playing'] },
    setPlaybackMode:            { fn: 'setPlaybackMode',            args: ['mode'] },
    setActiveSongIndex:         { fn: 'setActiveSongIndex',         args: ['index'] },
    setActivePatternIndex:      { fn: 'setActivePatternIndex',      args: ['index'] },
    setStepOn:                  { fn: 'setStepOn',                  args: ['patternIndex', 'track', 'step', 'on'] },
    setStepAccent:              { fn: 'setStepAccent',              args: ['patternIndex', 'track', 'step', 'value'] },
    setStepProbabilityActive:   { fn: 'setStepProbabilityActive',   args: ['patternIndex', 'track', 'step', 'value'] },
    setStepProbabilityPercent:  { fn: 'setStepProbabilityPercent',  args: ['patternIndex', 'track', 'step', 'value'] },
    setStepRandomActive:        { fn: 'setStepRandomActive',        args: ['patternIndex', 'track', 'step', 'value'] },
    setStepFlamActive:          { fn: 'setStepFlamActive',          args: ['patternIndex', 'track', 'step', 'value'] },
    setStepFlamDistance:        { fn: 'setStepFlamDistance',        args: ['patternIndex', 'track', 'step', 'value'] },
    setStepRepeatActive:        { fn: 'setStepRepeatActive',        args: ['patternIndex', 'track', 'step', 'value'] },
    setStepRepeatValue:         { fn: 'setStepRepeatValue',         args: ['patternIndex', 'track', 'step', 'value'] },
    setPatternLength:           { fn: 'setPatternLength',           args: ['patternIndex', 'length'] },
    triggerVoice:                { fn: 'triggerVoice',              args: ['voiceIndex', 'velocity'] },
    setMute:                    { fn: 'setMute',                    args: ['voiceIndex', 'value'] },
    setSolo:                    { fn: 'setSolo',                    args: ['voiceIndex', 'value'] },
    setTempoBpm:                { fn: 'setTempoBpm',                args: ['bpm'] },
    setSwingPercent:            { fn: 'setSwingPercent',            args: ['percent'] },
    setSectionEnabled:          { fn: 'setSectionEnabled',          args: ['sectionIndex', 'value'] },
    setSectionPatternIndex:     { fn: 'setSectionPatternIndex',     args: ['sectionIndex', 'value'] },
    setSectionRepeatCount:      { fn: 'setSectionRepeatCount',      args: ['sectionIndex', 'value'] },
    setSectionNextSongIndex:    { fn: 'setSectionNextSongIndex',    args: ['sectionIndex', 'value'] },
};

/** Alle per cwrap() gebundenen Engine-Funktionen, die dieser Prozessor
    braucht - Name (ohne "ninebeat_"-Praefix) -> [Rueckgabetyp, Argumenttypen],
    identisch zur cwrap()-Signatur. Zusaetzlich zu den in SIMPLE_CALLS
    referenzierten Namen die restlichen, direkt (nicht ueber eine
    Nachricht) aus diesem Modul heraus aufgerufenen Funktionen. */
const API_SPEC = {
    create:                     ['number', []],
    prepare:                    [null, ['number', 'number', 'number']],
    getNumParameters:           ['number', []],
    renderBlock:                [null, ['number', 'number', 'number', 'number']],
    renderBlockWithVoices:      [null, ['number', 'number', 'number', 'number', 'number']],
    getNumVoices:               ['number', []],
    copyVoiceScope:             [null, ['number', 'number', 'number', 'number']],
    getCurrentStep:              ['number', ['number']],
    getCurrentSectionIndex:      ['number', ['number']],
    exportStateAsJson:           ['number', ['number']],
    importStateFromJson:         ['number', ['number', 'string']],
    freeString:                  [null, ['number']],
    setParameter:                [null, ['number', 'number', 'number']],
    setPlaying:                   [null, ['number', 'number']],
    setPlaybackMode:              [null, ['number', 'number']],
    setActiveSongIndex:           [null, ['number', 'number']],
    setActivePatternIndex:        [null, ['number', 'number']],
    setStepOn:                    [null, ['number', 'number', 'number', 'number', 'number']],
    setStepAccent:                [null, ['number', 'number', 'number', 'number', 'number']],
    setStepProbabilityActive:     [null, ['number', 'number', 'number', 'number', 'number']],
    setStepProbabilityPercent:    [null, ['number', 'number', 'number', 'number', 'number']],
    setStepRandomActive:          [null, ['number', 'number', 'number', 'number', 'number']],
    setStepFlamActive:            [null, ['number', 'number', 'number', 'number', 'number']],
    setStepFlamDistance:          [null, ['number', 'number', 'number', 'number', 'number']],
    setStepRepeatActive:          [null, ['number', 'number', 'number', 'number', 'number']],
    setStepRepeatValue:           [null, ['number', 'number', 'number', 'number', 'number']],
    setPatternLength:             [null, ['number', 'number', 'number']],
    triggerVoice:                 [null, ['number', 'number', 'number']],
    setMute:                      [null, ['number', 'number', 'number']],
    setSolo:                      [null, ['number', 'number', 'number']],
    setTempoBpm:                  [null, ['number', 'number']],
    setSwingPercent:              [null, ['number', 'number']],
    setSectionEnabled:            [null, ['number', 'number', 'number']],
    setSectionPatternIndex:       [null, ['number', 'number', 'number']],
    setSectionRepeatCount:        [null, ['number', 'number', 'number']],
    setSectionNextSongIndex:      [null, ['number', 'number', 'number']],
};

class NinebeatProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        this.ready = false;
        this.pendingMessages = [];
        this.engine = 0;
        this.leftPtr = 0;
        this.rightPtr = 0;
        this.voicesPtr = 0;
        this.numVoices = 0;
        this.scopeScratchPtr = 0;
        this.playheadCounter = 0;
        this.wasm = {};

        // GUI-VARIANTE "WEB": das WASM-Binary wird NICHT selbst per fetch()
        // geladen (Reviewer-/Test-Befund, per echtem Testlauf in echtem
        // Chrome gefunden - fetch() aus dieser AudioWorkletGlobalScope
        // heraus loeste sich nie auf, weder erfolgreich noch mit Fehler).
        // app.js laedt die Bytes stattdessen im HAUPT-THREAD (dort
        // nachweislich zuverlaessig) und schickt sie per initModule()-
        // Nachricht (siehe handleMessage() unten) - mit Transfer statt
        // Kopie (zweiter postMessage()-Parameter im Haupt-Thread), kein
        // zusaetzlicher Speicher-Overhead.
        this.port.onmessage = (event) => this.handleMessage (event.data);
    }

    initModule (wasmBinary) {
        NinebeatModule ({ wasmBinary }).then ((Module) => {
            this.Module = Module;
            for (const [name, [returnType, argTypes]] of Object.entries (API_SPEC))
                // API_SPEC-Schluessel sind kurze, praegnante Aliase (siehe
                // dort) - der TATSAECHLICHE exportierte C-Funktionsname
                // traegt immer das "ninebeat_"-Praefix (siehe
                // web/src/WebEngineApi.cpp).
                this.wasm[name] = Module.cwrap ('ninebeat_' + name, returnType, argTypes);

            this.engine = this.wasm.create();
            this.wasm.prepare (this.engine, sampleRate, RENDER_QUANTUM);

            this.leftPtr = Module._malloc (RENDER_QUANTUM * 4);
            this.rightPtr = Module._malloc (RENDER_QUANTUM * 4);
            // Trockene Einzelsignale je Stimme - Quelle des zweiten
            // Ausgangs, an dem die Send-Effekte abgreifen. Kanalzahl kommt
            // aus der Engine, damit sie nicht an zwei Stellen steht.
            this.numVoices = this.wasm.getNumVoices ();
            this.voicesPtr = Module._malloc (this.numVoices * RENDER_QUANTUM * 4);
            this.scopeScratchPtr = Module._malloc (2048 * 4); // ScopeBuffer::capacity, siehe Analysis/ScopeBuffer.h

            this.ready = true;
            if (this.pendingMessages && this.pendingMessages.length > 0) {
                for (const pending of this.pendingMessages) {
                    this.handleMessage(pending);
                }
                this.pendingMessages = [];
            }
            this.port.postMessage ({ type: 'ready', numParameters: this.wasm.getNumParameters() });
        }).catch ((error) => {
            this.port.postMessage ({ type: 'error', message: String (error) });
        });
    }

    handleMessage (message) {
        if (message.type === 'initModule')
        {
            this.initModule (message.wasmBinary);
            return;
        }

        if (! this.ready)
        {
            if (!this.pendingMessages) this.pendingMessages = [];
            this.pendingMessages.push(message);
            return;
        }

        const simple = SIMPLE_CALLS[message.type];
        if (simple)
        {
            const args = simple.args.map ((name) => {
                if (name === 'bpm') return message.bpm ?? message.tempoBpm ?? 120;
                if (name === 'percent') return message.percent ?? message.swingPercent ?? 50;
                if (name === 'voiceIndex') return message.voiceIndex ?? message.trackIndex ?? message.track ?? 0;
                if (name === 'value') return message.value ?? message.on ?? message.enabled ?? 0;
                return message[name];
            });
            this.wasm[simple.fn] (this.engine, ...args);
            return;
        }

        switch (message.type)
        {
            case 'exportState':
            {
                const ptr = this.wasm.exportStateAsJson (this.engine);
                const json = this.Module.UTF8ToString (ptr);
                this.wasm.freeString (ptr);
                this.port.postMessage ({ type: 'stateExported', json });
                break;
            }
            case 'importState':
            {
                this.wasm.importStateFromJson (this.engine, message.json);
                break;
            }
            case 'requestScope':
            {
                // Alle 11 Stimmen-Oszilloskop-Puffer in EINEM transferierbaren
                // Float32Array buendeln (weniger postMessage-Overhead als elf
                // einzelne Nachrichten) - Layout: [Stimme0[0..2047], Stimme1[0..2047], ...].
                const capacity = 2048;
                const numVoices = 11;
                const combined = new Float32Array (capacity * numVoices);
                for (let voice = 0; voice < numVoices; ++voice)
                {
                    this.wasm.copyVoiceScope (this.engine, voice, this.scopeScratchPtr, capacity);
                    combined.set (new Float32Array (this.Module.HEAPF32.buffer, this.scopeScratchPtr, capacity),
                                  voice * capacity);
                }
                // Transfer statt Kopie (zweiter Parameter) - combined.buffer
                // gehoert danach dem Haupt-Thread, hier nicht mehr verwenden.
                this.port.postMessage ({ type: 'scopeData', data: combined }, [combined.buffer]);
                break;
            }
            default:
                // Unbekannte Nachrichtentypen bewusst still ignorieren statt zu
                // werfen - ein Audio-Worklet-Absturz reisst die komplette
                // Wiedergabe mit, ein still verworfener Tippfehler in app.js
                // ist das kleinere Problem (wird beim Testen im Log sichtbar,
                // siehe fehlende erwartete Wirkung).
                break;
        }
    }

    process (_inputs, outputs)
    {
        if (! this.ready)
            return true; // Prozessor am Leben halten, bis das WASM-Modul geladen ist (siehe Konstruktor)

        const output = outputs[0];
        const left = output[0];
        const right = output.length > 1 ? output[1] : output[0];
        const numSamples = left.length; // per Spezifikation immer RENDER_QUANTUM

        // Zweiter Ausgang (optional): ein Kanal je Stimme, trocken und nach
        // deren Insert-FX. Daran haengen die Send-Effekte - siehe
        // AudioEngineManager, wo er per ChannelSplitterNode aufgefaechert
        // wird. Ist er nicht verbunden, wird gar nicht erst danach gefragt.
        const voiceOut = outputs.length > 1 ? outputs[1] : null;
        const wantVoices = voiceOut != null && voiceOut.length > 0 && this.voicesPtr !== 0;

        if (wantVoices)
            this.wasm.renderBlockWithVoices (this.engine, this.leftPtr, this.rightPtr, this.voicesPtr, numSamples);
        else
            this.wasm.renderBlock (this.engine, this.leftPtr, this.rightPtr, numSamples);

        left.set (new Float32Array (this.Module.HEAPF32.buffer, this.leftPtr, numSamples));
        if (right !== left)
            right.set (new Float32Array (this.Module.HEAPF32.buffer, this.rightPtr, numSamples));

        if (wantVoices)
        {
            // Die Engine schreibt stimmenweise hintereinander; jeder
            // Ausgangskanal bekommt genau sein Fenster daraus. Weniger
            // Kanaele als Stimmen sind zulaessig (dann fehlen die hinteren),
            // mehr ebenso (die ueberzaehligen bleiben still).
            const count = Math.min (voiceOut.length, this.numVoices);
            for (let voice = 0; voice < count; ++voice)
                voiceOut[voice].set (new Float32Array (this.Module.HEAPF32.buffer,
                                                       this.voicesPtr + voice * numSamples * 4,
                                                       numSamples));
        }

        if (++this.playheadCounter >= PLAYHEAD_UPDATE_INTERVAL)
        {
            this.playheadCounter = 0;
            this.port.postMessage ({
                type: 'playhead',
                step: this.wasm.getCurrentStep (this.engine),
                section: this.wasm.getCurrentSectionIndex (this.engine),
            });
        }

        return true; // Prozessor am Leben halten (Rueckgabe false wuerde ihn dauerhaft beenden)
    }
}

registerProcessor ('ninebeat-processor', NinebeatProcessor);
