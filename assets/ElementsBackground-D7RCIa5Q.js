import{a as V,r as q,j as X,aa as Y,o as k,v as Z,B as J,a2 as Q}from"./index-DzcfuwSA.js";const $=`#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`,ee=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_time;
uniform float u_kickPulse;
uniform float u_hatPulse;
out vec4 outColor;

float hash(vec2 p) { return fract(1e4 * sin(17.0 * p.x + p.y * 0.1) * (0.1 + abs(sin(p.y * 13.0 + p.x)))); }

void main() {
  vec2 uv = v_uv * 2.0 - 1.0;

  // Erdstoesse zur Bassdrum
  float dist = length(uv);
  float wave = sin(dist * 40.0 - u_time * 15.0) * exp(-dist * 4.0) * u_kickPulse;

  // Schwebender Staub, zuckt mit den Becken
  float rocks = 0.0;
  for (int i = 0; i < 15; i++) {
     float fi = float(i);
     vec2 pos = vec2(sin(fi * 3.1 + u_time * 0.5) * 0.8, cos(fi * 2.7 + u_time * 0.4) * 0.8);
     float d = length(uv - pos);
     float size = 0.02 + hash(vec2(fi)) * 0.03 + u_hatPulse * 0.05;
     rocks += smoothstep(size, size * 0.8, d) * (0.5 + 0.5 * hash(vec2(fi, 1.0)));
  }

  vec3 color = vec3(0.2, 0.8, 0.3) * wave * 2.0;
  color += vec3(0.4, 0.6, 0.2) * rocks * (1.0 + u_kickPulse * 2.0);
  outColor = vec4(color, wave + rocks);
}`,te=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_time;
uniform float u_cutoff;
uniform float u_resonance;
out vec4 outColor;
float hash(vec2 p) { return fract(1e4 * sin(17.0 * p.x + p.y * 0.1) * (0.1 + abs(sin(p.y * 13.0 + p.x)))); }
float noise(vec2 x) {
    vec2 i = floor(x);
    vec2 f = fract(x);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 x) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 5; ++i) {
        v += a * noise(x);
        x = rot * x * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}
void main() {
  vec2 uv = v_uv;
  uv.y = 1.0 - uv.y;
  vec2 q = uv;
  q.x -= u_time * 0.1;
  q.y -= u_time * (0.5 + u_cutoff * 1.5); // hoeherer Cutoff, schnellere Flammen

  // Funkenflug
  float embers = 0.0;
  for (int i = 0; i < 20; i++) {
     float fi = float(i);
     vec2 pos = vec2(
        hash(vec2(fi)) * 1.2 - 0.1 + sin(u_time * 0.5 + fi) * 0.1,
        fract(hash(vec2(fi, 2.0)) - u_time * (0.2 + hash(vec2(fi, 3.0)) * 0.5 + u_cutoff))
     );
     float d = length(uv - pos);
     embers += smoothstep(0.015, 0.005, d) * (0.5 + 0.5 * sin(u_time * 10.0 + fi));
  }

  float strength = fbm(q * 3.0);
  float f = fbm(uv * (5.0 - u_resonance * 2.0) + strength * 2.0 - u_time * 1.5);

  vec3 color = mix(vec3(1.0, 0.1, 0.0), vec3(1.0, 0.9, 0.2), f);
  color += vec3(1.0, 0.8, 0.3) * embers * 2.0;

  float alpha = f * uv.y * (u_resonance * 2.0 + 0.5) * 2.0 + embers;
  outColor = vec4(color, alpha * 0.7);
}`,oe=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_time;
uniform float u_rms;
uniform vec3 u_drops[12]; // xy = Ort, z = Zeitpunkt des Anschlags
out vec4 outColor;
void main() {
  vec2 uv = v_uv * 2.0 - 1.0;

  // Grundwelle folgt dem Pegel
  float len = length(uv);
  float ripple = sin(len * 20.0 - u_time * 5.0) * 0.5 + 0.5;
  ripple *= exp(-len * 2.0) * (u_rms * 2.0);

  // Ein Tropfen je Pad-Anschlag
  float dropRipples = 0.0;
  for (int i = 0; i < 12; i++) {
     if (u_drops[i].z > 0.0) {
        float age = u_time - u_drops[i].z;
        if (age < 2.0) {
           float d = distance(v_uv, u_drops[i].xy);
           float ring = sin(d * 50.0 - age * 20.0);
           ring *= exp(-d * 10.0 - age * 2.0);
           dropRipples += max(0.0, ring);
        }
     }
  }

  float totalRipple = ripple + dropRipples * 0.5;

  // Aufsteigende Blasen
  float bubbles = 0.0;
  for (int i = 0; i < 15; i++) {
     float fi = float(i);
     float speed = 0.1 + fract(fi * 0.13) * 0.2;
     vec2 pos = vec2(
        fract(fi * 0.37) * 2.0 - 1.0 + sin(u_time + fi) * 0.1,
        fract(fi * 0.73 - u_time * speed) * 2.0 - 1.0
     );
     float d = length(uv - pos);
     float size = 0.02 + fract(fi * 0.21) * 0.03;
     bubbles += smoothstep(size, size * 0.8, d) * smoothstep(size * 0.6, size * 0.9, d);
  }

  vec3 color = mix(vec3(0.0, 0.4, 0.8), vec3(0.5, 0.9, 1.0), totalRipple);
  color += vec3(1.0) * bubbles;
  outColor = vec4(color, (totalRipple + bubbles) * 0.9);
}`,ae=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_time;
uniform float u_arp;
uniform float u_keys;
out vec4 outColor;
void main() {
  vec2 uv = v_uv * 2.0 - 1.0;

  // Boee, wenn Akkorde klingen
  float gust = exp(-length(uv) * 2.0) * u_keys;

  float angle = atan(uv.y, uv.x);
  float radius = length(uv);
  float spiral = sin(angle * (5.0 + u_arp * 3.0) + radius * 15.0 - u_time * 12.0 * (1.0 + u_arp + gust * 2.0));
  float alpha = smoothstep(0.7, 1.0, spiral) * exp(-radius * (2.0 - u_arp * 0.5));

  // Wirbelnde Blaetter
  float leaves = 0.0;
  for (int i = 0; i < 25; i++) {
     float fi = float(i);
     float r = fract(fi * 0.13) * 1.5;
     float a = fract(fi * 0.77) * 6.28 + u_time * (1.0 + u_arp * 2.0 + gust) / max(0.1, r);
     vec2 pos = vec2(cos(a), sin(a)) * r;
     float d = length(uv - pos);
     leaves += smoothstep(0.015, 0.005, d) * (0.5 + 0.5 * sin(u_time * 5.0 + fi));
  }

  vec3 color = vec3(0.8, 0.9, 1.0) + vec3(1.0, 1.0, 0.8) * gust;
  color = mix(color, vec3(1.0, 0.8, 0.4), leaves);
  outColor = vec4(color, (alpha + leaves) * (0.5 + gust * 0.5));
}`,re={earth:ee,fire:te,water:oe,air:ae},ie=1.5;function I(a,h,p){const f=a.createShader(h);return f?(a.shaderSource(f,p),a.compileShader(f),a.getShaderParameter(f,a.COMPILE_STATUS)?f:(console.error("[ElementsBackground] Shader:",a.getShaderInfoLog(f)),a.deleteShader(f),null)):null}const ne=({element:a})=>{const h=V(),p=q.useRef(null);return q.useEffect(()=>{if(h!=="elements"||a==="aether")return;const f=p.current;if(!f)return;const r=document.createElement("canvas");r.dataset.elementsCanvas=a,r.className="absolute inset-0 w-full h-full pointer-events-none mix-blend-screen",f.appendChild(r);const e=r.getContext("webgl2",{alpha:!0,premultipliedAlpha:!1});if(!e){r.remove();return}const d=I(e,e.VERTEX_SHADER,$),_=I(e,e.FRAGMENT_SHADER,re[a]),l=e.createProgram(),g=e.createBuffer(),S=()=>{g&&e.deleteBuffer(g),l&&e.deleteProgram(l),d&&e.deleteShader(d),_&&e.deleteShader(_),e.getExtension("WEBGL_lose_context")?.loseContext(),r.remove()};if(!d||!_||!l||!g){S();return}if(e.attachShader(l,d),e.attachShader(l,_),e.linkProgram(l),!e.getProgramParameter(l,e.LINK_STATUS)){console.error("[ElementsBackground] Programm:",e.getProgramInfoLog(l)),S();return}e.useProgram(l),e.bindBuffer(e.ARRAY_BUFFER,g),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),e.STATIC_DRAW);const w=e.getAttribLocation(l,"a_position");e.enableVertexAttribArray(w),e.vertexAttribPointer(w,2,e.FLOAT,!1,0,0),e.enable(e.BLEND),e.blendFunc(e.SRC_ALPHA,e.ONE);const u=i=>e.getUniformLocation(l,i),D=u("u_time"),L=u("u_kickPulse"),N=u("u_hatPulse"),H=u("u_cutoff"),O=u("u_resonance"),U=u("u_rms"),W=u("u_drops"),j=u("u_arp"),G=u("u_keys"),F=()=>{const i=Math.min(Y(),ie),m=Math.max(1,Math.round(r.clientWidth*i)),s=Math.max(1,Math.round(r.clientHeight*i));(r.width!==m||r.height!==s)&&(r.width=m,r.height=s)},P=new ResizeObserver(F);P.observe(r),F();let x=0,B=performance.now(),y=0,E=0,R=0,A=new Float32Array(0),c=new Float32Array(0);const b=new Float32Array(36),C=new Array(12).fill(0),M=i=>(A.length!==i.frequencyBinCount&&(A=new Float32Array(i.frequencyBinCount)),i.getFloatFrequencyData(A),A),T=i=>{const m=Math.max(0,(i-B)/1e3);if(B=i,e.viewport(0,0,r.width,r.height),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.uniform1f(D,i*.001),a==="earth"){y*=Math.exp(-m*15),E*=Math.exp(-m*20);const s=k.getDrumsAnalyserNode();if(s){const n=M(s);let v=0;for(let o=1;o<=5&&o<n.length;o++)v+=Math.max(0,n[o]+100);let t=0;for(let o=150;o<=200&&o<n.length;o++)t+=Math.max(0,n[o]+100);v>300&&(y=1),t>200&&(E=1)}e.uniform1f(L,y),e.uniform1f(N,E)}else if(a==="fire"){const{cutoff:s,resonance:n}=Z.getState().params;e.uniform1f(H,s/1e4),e.uniform1f(O,n)}else if(a==="water"){const s=k.getAnalyserNode();let n=0;if(s){c.length!==s.fftSize&&(c=new Float32Array(s.fftSize)),s.getFloatTimeDomainData(c);for(let t=0;t<c.length;t++)n+=c[t]*c[t];n=Math.sqrt(n/Math.max(1,c.length))}e.uniform1f(U,n);const v=J.getState().activePads;for(let t=0;t<12;t++){const o=v[t];o&&o!==C[t]&&(C[t]=o,b[t*3]=Math.random()*.8+.1,b[t*3+1]=Math.random()*.8+.1,b[t*3+2]=i*.001)}e.uniform3fv(W,b)}else if(a==="air"){const s=Q.getState();e.uniform1f(j,s.arp.active?1:0),R*=Math.exp(-m*5);const n=k.getAnalyserNode();if(n&&!s.isMuted){const v=M(n);let t=0;for(let o=30;o<=60&&o<v.length;o++)t+=Math.max(0,v[o]+100);t>500&&(R=1)}e.uniform1f(G,R)}e.drawArrays(e.TRIANGLES,0,6)},K=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches??!1,z=i=>{T(i),x=requestAnimationFrame(z)};return K?x=requestAnimationFrame(()=>T(0)):x=requestAnimationFrame(z),()=>{cancelAnimationFrame(x),P.disconnect(),S()}},[h,a]),h!=="elements"?null:X.jsx("div",{ref:p,"aria-hidden":"true",className:"absolute inset-0 -z-10 pointer-events-none overflow-hidden"})};export{ne as E};
