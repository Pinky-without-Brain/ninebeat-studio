// GUI-VARIANTE "WEB" (Branch gui-cyberpunk-web): MUSS als allererstes
// Modul importiert werden, VOR "./ninebeat_web_engine.js" (siehe
// ninebeat-processor.js) - ES-Modul-Importe werden vollstaendig ausgewertet,
// bevor der Code des importierenden Moduls selbst laeuft, UND Geschwister-
// Importe werden in Quelltext-Reihenfolge ausgewertet, daher greift dieser
// Shim garantiert, bevor Emscriptens generierter Code seine eigene
// Umgebungserkennung durchfuehrt.
//
// Hintergrund: das kompilierte ninebeat_web_engine.js erkennt seine
// Laufzeitumgebung so (siehe dort):
//   ENVIRONMENT_IS_WEB    = !!globalThis.window;
//   ENVIRONMENT_IS_WORKER = !!globalThis.WorkerGlobalScope;
//   ENVIRONMENT_IS_NODE   = globalThis.process?.versions?.node && ...;
//   ENVIRONMENT_IS_SHELL  = !WEB && !NODE && !WORKER;
// Eine AudioWorkletGlobalScope hat WEDER `window` NOCH den globalen
// `WorkerGlobalScope`-Konstruktor (Audio-Worklets sind laut Web-Audio-
// Spezifikation ein EIGENER Global-Scope-Typ - WorkletGlobalScope, nicht
// WorkerGlobalScope - komplett getrennte Klassenhierarchie) NOCH ist es
// Node. Per Ausschlussverfahren landet der Kontext daher faelschlich bei
// "shell" (der vierte, eigentlich fuer CLI-JS-Engines wie d8 gedachte Fall)
// - das bricht zur Laufzeit mit "ReferenceError: read is not defined" ab
// (der Shell-Ladepfad versucht, das WASM-Binary ueber eine dort nicht
// existierende synchrone read()-Funktion zu laden). Per echtem Testkompile
// UND Testlauf im Browser gefunden - nicht aus der Emscripten-Dokumentation
// ableitbar, die Dokumentation beschreibt AudioWorklets nur ueber
// Emscriptens EIGENE, hier bewusst nicht genutzte -sAUDIO_WORKLET=1-
// Pthread-Pipeline (siehe web/README.md fuer die Begruendung).
//
// Ein reiner Attrappen-`WorkerGlobalScope`-Wert genuegt, um stattdessen
// (zutreffend genug) als regulaerer Worker erkannt zu werden - der
// tatsaechliche ESM-Ladepfad (MODULARIZE+EXPORT_ES6, siehe
// web/CMakeLists.txt) laedt das WASM-Binary ohnehin ueber fetch()/
// import.meta.url, der Wert selbst wird nirgends als echte Klasse benutzt.
if (! globalThis.WorkerGlobalScope)
    globalThis.WorkerGlobalScope = function () {};

// Zweite, unabhaengige Luecke derselben Kategorie (per echtem Testlauf in
// echtem Chrome gefunden, siehe Kommentar oben zur Herkunft dieser Datei):
// AudioWorkletGlobalScope kennt laut Spezifikation (WorkletGlobalScope-
// Basisklasse) den globalen `URL`-Konstruktor NICHT - ninebeat_web_engine.js
// nutzt ihn an genau zwei Stellen, beide nach demselben simplen Muster
// "loese einen relativen Dateinamen (oder '.') gegen eine bekannte, absolute
// http(s)-Basis-URL auf" (scriptDirectory-Ermittlung bzw. der WASM-Binary-
// Pfad relativ zu import.meta.url - keine Query-Strings, kein "..", kein
// anderes Protokoll). Ein vollstaendiger URL-Polyfill waere dafuer weit mehr,
// als hier gebraucht wird - dieser deckt bewusst NUR dieses eine Muster ab.
if (typeof globalThis.URL === 'undefined')
{
    globalThis.URL = class MinimalWorkletUrl
    {
        constructor (path, base)
        {
            if (/^[a-z][a-z0-9+.-]*:\/\//i.test (path)) { this.href = path; return; }
            const baseHref = (base && base.href) ? base.href : String (base ?? '');
            const lastSlash = baseHref.lastIndexOf ('/');
            const directory = lastSlash >= 0 ? baseHref.slice (0, lastSlash + 1) : baseHref;
            this.href = path === '.' ? directory : directory + path;
        }
    };
}
