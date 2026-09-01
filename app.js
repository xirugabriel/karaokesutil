/* ⚡ utilitários de performance */
var MOBILE_UI = window.matchMedia('(hover: none)').matches;
function comThrottle(fn) {
    var agendado = false, ultimoEvento = null;
    return function (e) {
        ultimoEvento = e;
        if (agendado) return;
        agendado = true;
        requestAnimationFrame(function () { agendado = false; fn(ultimoEvento); });
    };
}

/**
 * Sutil Karaokê — Interactivity & Animations
 * Loaded after Firebase inline scripts in index.html
 */

/* ══════════════════════════════════════════════════════════════
   0. INTRO — nome se desenhando sobre preto (sem cortina)
══════════════════════════════════════════════════════════════ */
(function () {
    const intro = document.getElementById('intro');
    if (!intro) return;
    document.documentElement.classList.add('intro-lock');

    // MAGIC RINGS atrás do nome
    const palco = intro.querySelector('.intro-stage');
    if (palco && !palco.querySelector('.intro-aneis')) {
        const a = document.createElement('div');
        a.className = 'intro-aneis';
        a.innerHTML = '<i></i><i></i><i></i>';
        palco.insertBefore(a, palco.firstChild);
    }

    // 🎯 Centralização à prova de iPhone: no webapp salvo na tela
    // inicial, 100vh/100dvh não batem com a área realmente visível.
    // Medimos a altura de verdade (visualViewport) e fixamos.
    function centralizar() {
        const vv = window.visualViewport;
        const h = (vv && vv.height) || window.innerHeight ||
                  document.documentElement.clientHeight;
        const topo = (vv && vv.offsetTop) || 0;
        intro.style.height = h + 'px';
        intro.style.top = topo + 'px';
        intro.style.bottom = 'auto';
    }
    centralizar();
    window.addEventListener('resize', centralizar);
    window.addEventListener('orientationchange', centralizar);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', centralizar);
        window.visualViewport.addEventListener('scroll', centralizar);
    }

    let saiu = false;
    function sair() {
        if (saiu) return;
        saiu = true;
        if (navigator.vibrate) navigator.vibrate(14);
        intro.classList.add('intro-done');
        setTimeout(() => {
            intro.remove();
            document.documentElement.classList.remove('intro-lock');
        }, 850);
    }
    const auto = setTimeout(sair, 3000);
    intro.addEventListener('click', () => { clearTimeout(auto); sair(); });
})();


/* ══════════════════════════════════════════════════════════════
   1. FUNDO — CRT WARP (tubo de TV antiga com plasma)
   Shader do ReactBits portado para WebGL puro (sem three.js, que
   custaria ~600KB só pra desenhar um retângulo).

   📱 CUIDADOS DE CELULAR — é um shader, então o custo por quadro é
   por PIXEL. Três travas seguram o consumo:
     1. o canvas é renderizado MENOR que a tela e a CSS estica.
        O plasma já é quadriculado em 80x24 no próprio shader, então
        não se perde detalhe nenhum — só se paga menos pixel.
     2. no celular entra o "modo leve": 4 amostras de brilho em vez
        de 8 (o dobro do peso em cada uma compensa a diferença).
     3. 30 quadros por segundo, e ZERO quadro com a aba em segundo
        plano ou com o celular bloqueado.
══════════════════════════════════════════════════════════════ */
(function () {
    const TELA_PEQUENA = window.matchMedia("(hover: none)").matches;

    // resolução interna do canvas (1 = tela cheia). Menor = mais leve.
    const ESCALA   = TELA_PEQUENA ? 0.60 : 0.85;
    const QUADROS  = 30;

    // ── ajustes de arte (equivalentes às props do componente) ──
    const AJUSTES = {
        cor:          "#B14EFF",   // fósforo — o roxo da marca
        fundo:        "#07060D",   // preto do site
        velocidade:   0.5,
        curvatura:    0.25,
        forcaScanline: 0.30,
        /* Amplitude/densidade acima do padrão de propósito: nos valores
           originais o plasma vira mancha gigante, que atrás de texto só
           atrapalha. Mais alto = mais células pequenas, ou seja, TEXTURA
           de tubo em vez de borrão roxo. */
        amplitudeOnda: 0.55,
        densidadeOnda: 3.2,
        brilho:       1.5,
        raioBrilho:   1.0,
        ruido:        0.10,
        vinheta:      0.35,        // escurece as bordas (ajuda a leitura)
        exposicao:    TELA_PEQUENA ? 0.85 : 0.95,
        desvioRGB:    0.015,
        forcaPonteiro: 0.5,
        // teto do plasma: o quanto ele pode cobrir o preto do fundo
        teto:         TELA_PEQUENA ? 0.26 : 0.34
    };

    const canvas = document.createElement("canvas");
    canvas.id = "crt-fundo";
    document.body.insertBefore(canvas, document.body.firstChild);

    // véu por cima do shader: é o que garante que o texto continue legível
    const veu = document.createElement("div");
    veu.id = "dither";
    document.body.insertBefore(veu, canvas.nextSibling);

    const gl = canvas.getContext("webgl", {
        antialias: false, alpha: false, depth: false, stencil: false,
        powerPreference: "low-power", preserveDrawingBuffer: false
    });
    // sem WebGL (celular muito antigo): fica só o preto do site, sem quebrar nada
    if (!gl) { canvas.remove(); return; }

    /* sRGB -> linear. O three.js faz isso por baixo dos panos ao ler a cor;
       como aqui não tem three, a conversão é feita na mão pra cor não sair
       lavada. A volta (linear -> sRGB) acontece no fim do shader. */
    function corParaLinear(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [16, 8, 0].map(function (deslocamento) {
            const c = ((n >> deslocamento) & 255) / 255;
            return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
    }

    const VERTICE = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

    const FRAGMENTO = `
precision mediump float;

varying vec2 vUv;
uniform vec2  uResolution;
uniform float uTime;
uniform vec3  uColor;
uniform vec3  uBackgroundColor;
uniform float uCurvature;
uniform float uScanlineStrength;
uniform float uScanlineFrequency;
uniform float uWaveAmplitude;
uniform float uWaveFrequency;
uniform float uBloom;
uniform float uBloomRadius;
uniform float uNoise;
uniform float uVignette;
uniform float uBrightness;
uniform float uRgbShift;
uniform vec2  uPointer;
uniform float uMouseStrength;
uniform vec2  uGrid;
uniform float uMix;

#ifdef LEVE
  #define PESO_CRUZ 0.20
#else
  #define PESO_CRUZ 0.12
#endif

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// a barriga do tubo: empurra os pixels pra fora a partir do centro
vec2 crtCurve(vec2 uv, float radius) {
  vec2 p = (uv - 0.5) * 2.0;
  float safeRadius = max(radius, 1.415);
  float cornerScale = safeRadius / sqrt(max(safeRadius * safeRadius - 2.0, 0.001));
  p = safeRadius * p / sqrt(max(safeRadius * safeRadius - dot(p, p), 0.001));
  p /= cornerScale;
  return p * 0.5 + 0.5;
}

// o plasma: soma de senos, quantizado num grid grosso de 80x24
float referencePlasma(vec2 uv, float t) {
  float frequencyScale = max(uWaveFrequency / 2.2, 0.001);
  uv = (uv - 0.5) * frequencyScale + 0.5;

  float scanline = 0.5 - 0.5 * cos(uv.y * 3.14159265 * uScanlineFrequency);
  scanline = mix(1.0, scanline, uScanlineStrength);

  // grade de "caracteres" do tubo. No original é fixa em 80x24 (tela
  // deitada); aqui vem de fora pra não esticar em pé no celular.
  uv *= uGrid;
  uv = ceil(uv);
  uv /= uGrid;

  float amplitude = uWaveAmplitude / 0.28;
  float field = 0.0;
  field += 0.7 * sin(0.5 * uv.x + t / 5.0);
  field += 3.0 * sin(1.6 * uv.y + t / 5.0);
  field += sin(10.0 * (uv.y * sin(t / 2.0) + uv.x * cos(t / 5.0)) + t / 2.0);

  float cx = uv.x + 0.5 * sin(t / 2.0);
  float cy = uv.y + 0.5 * cos(t / 4.0);
  field += 0.4 * sin(sqrt(100.0 * cx * cx + 100.0 * cy * cy + 1.0) + t);
  field += 0.9 * sin(sqrt(75.0 * cx * cx + 25.0 * cy * cy + 1.0) + t);
  field -= 1.4 * sin(sqrt(256.0 * cx * cx + 25.0 * cy * cy + 1.0) + t);
  field += 0.3 * sin(0.5 * uv.y + uv.x + sin(t));

  return scanline * floor(3.0 * (0.5 + 0.499 * sin(field * amplitude))) / 3.0;
}

// converte de volta pra sRGB na saída (o three fazia isso no renderer)
vec3 paraSRGB(vec3 c) {
  return mix(c * 12.92,
             1.055 * pow(max(c, vec3(0.0031308)), vec3(1.0 / 2.4)) - 0.055,
             step(vec3(0.0031308), c));
}

void main() {
  vec2 uv = vUv;

  float curveRadius = 1.1 + 0.42 / max(uCurvature, 0.001);
  curveRadius *= exp(-uPointer.y * uMouseStrength * 0.4);
  vec2 curvedUv = crtCurve(uv, curveRadius);
  curvedUv.x -= uPointer.x * uMouseStrength * 0.035;

  float signal = referencePlasma(curvedUv, uTime);

  // brilho de fósforo: amostra os vizinhos e soma
  float radius = 0.01 * uBloomRadius;
  float glow = signal * 0.2;
  glow += referencePlasma(curvedUv + vec2(radius, 0.0), uTime) * PESO_CRUZ;
  glow += referencePlasma(curvedUv - vec2(radius, 0.0), uTime) * PESO_CRUZ;
  glow += referencePlasma(curvedUv + vec2(0.0, radius), uTime) * PESO_CRUZ;
  glow += referencePlasma(curvedUv - vec2(0.0, radius), uTime) * PESO_CRUZ;
#ifndef LEVE
  glow += referencePlasma(curvedUv + vec2(radius), uTime) * 0.08;
  glow += referencePlasma(curvedUv - vec2(radius), uTime) * 0.08;
  glow += referencePlasma(curvedUv + vec2(radius, -radius), uTime) * 0.08;
  glow += referencePlasma(curvedUv + vec2(-radius, radius), uTime) * 0.08;
#endif

  // separação dos canais: o "sangramento" de cor do tubo
  float redSignal  = referencePlasma(curvedUv + vec2(uRgbShift, 0.0), uTime);
  float blueSignal = referencePlasma(curvedUv - vec2(uRgbShift, 0.0), uTime);
  vec3 channelSignal = vec3(redSignal, signal, blueSignal);
  vec3 waveColor = uColor * (0.3 + signal * 0.7 + glow * uBloom * 0.65);
  waveColor += (channelSignal - signal) * 0.42;

  float edge = clamp(1.0 - dot(vUv - 0.5, vUv - 0.5) * 2.0, 0.0, 1.0);
  float edgeFade = mix(1.0, smoothstep(0.0, 1.0, edge), uVignette);
  /* TETO DO PLASMA. No original a máscara chega a 1.0 e o fósforo cobre
     o fundo inteiro — ótimo num banner, péssimo atrás de texto: nos picos
     a tela virava uma parede roxa e engolia o cabeçalho. Limitando aqui
     o brilho nunca passa de uma fração, então continua sendo FUNDO.
     Cortar na origem preserva o desenho nítido do tubo; empilhar véu por
     cima só deixaria tudo cinza e lavado. */
  float waveMask = clamp(signal * 0.82 + glow * 0.52, 0.0, 1.0);

  /* CURVA + TETO. O sinal do tubo é quantizado em 4 degraus, então fica
     aceso em quase toda a tela — vira parede roxa e engole o texto.
     A potência empurra os meios-tons pro preto e mantém só os picos,
     abrindo sombra de verdade; o teto garante que nem o pico cobre o
     fundo por completo. Cortar aqui preserva o desenho nítido do tubo —
     empilhar véu por cima só deixaria tudo cinza e lavado. */
  waveMask = pow(waveMask, 2.2) * edgeFade * uMix;

  float grain = hash21(gl_FragCoord.xy + vec2(fract(uTime) * 173.0));
  waveColor = max(waveColor * uBrightness, vec3(0.0));
  vec3 color = mix(uBackgroundColor, waveColor, waveMask);
  color += (grain - 0.5) * uNoise;
  gl_FragColor = vec4(paraSRGB(max(color, vec3(0.0))), 1.0);
}`;

    function compilar(tipo, fonte) {
        const s = gl.createShader(tipo);
        gl.shaderSource(s, fonte);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.warn("[CRT] shader falhou:", gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    const cabecalho = TELA_PEQUENA ? "#define LEVE 1\n" : "";
    const vs = compilar(gl.VERTEX_SHADER, VERTICE);
    const fs = compilar(gl.FRAGMENT_SHADER, cabecalho + FRAGMENTO);
    if (!vs || !fs) { canvas.remove(); return; }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn("[CRT] link falhou:", gl.getProgramInfoLog(prog));
        canvas.remove();
        return;
    }
    gl.useProgram(prog);

    // um triângulo só, grande o bastante pra cobrir a tela inteira
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = {};
    ["uResolution", "uTime", "uColor", "uBackgroundColor", "uCurvature",
     "uScanlineStrength", "uScanlineFrequency", "uWaveAmplitude", "uWaveFrequency",
     "uBloom", "uBloomRadius", "uNoise", "uVignette", "uBrightness",
     "uRgbShift", "uPointer", "uMouseStrength", "uGrid", "uMix"].forEach(function (nome) {
        u[nome] = gl.getUniformLocation(prog, nome);
    });

    gl.uniform3fv(u.uColor, corParaLinear(AJUSTES.cor));
    gl.uniform3fv(u.uBackgroundColor, corParaLinear(AJUSTES.fundo));
    gl.uniform1f(u.uCurvature, AJUSTES.curvatura);
    gl.uniform1f(u.uScanlineStrength, AJUSTES.forcaScanline);
    gl.uniform1f(u.uWaveAmplitude, AJUSTES.amplitudeOnda);
    gl.uniform1f(u.uWaveFrequency, AJUSTES.densidadeOnda);
    gl.uniform1f(u.uBloom, AJUSTES.brilho);
    gl.uniform1f(u.uBloomRadius, AJUSTES.raioBrilho);
    gl.uniform1f(u.uNoise, AJUSTES.ruido);
    gl.uniform1f(u.uVignette, AJUSTES.vinheta);
    gl.uniform1f(u.uBrightness, AJUSTES.exposicao);
    gl.uniform1f(u.uRgbShift, AJUSTES.desvioRGB);
    gl.uniform1f(u.uMouseStrength, AJUSTES.forcaPonteiro);
    gl.uniform1f(u.uMix, AJUSTES.teto);

    function redimensionar() {
        const larg = Math.max(1, Math.round(window.innerWidth  * ESCALA));
        const alt  = Math.max(1, Math.round(window.innerHeight * ESCALA));
        if (canvas.width === larg && canvas.height === alt) return;
        canvas.width = larg;
        canvas.height = alt;
        gl.viewport(0, 0, larg, alt);
        gl.uniform2f(u.uResolution, larg, alt);
        /* As linhas do tubo precisam acompanhar a altura REAL do canvas.
           Fixas em 200 num canvas baixo elas viram moiré (aquele chuvisco
           tremido que dá dor de cabeça). ~3px por linha é o ponto certo. */
        gl.uniform1f(u.uScanlineFrequency,
            Math.max(60, Math.min(200, Math.round(alt / 3))));

        /* Tamanho do "caractere" do tubo, em pixels de tela. Mantendo esta
           medida fixa, o bloco fica igual em qualquer aparelho — em vez de
           esticar e virar listra comprida no celular em pé. */
        const CEL_LARG = 13, CEL_ALT = 26;
        gl.uniform2f(u.uGrid,
            Math.max(14, Math.round(window.innerWidth  / CEL_LARG)),
            Math.max(14, Math.round(window.innerHeight / CEL_ALT)));
    }
    redimensionar();
    window.addEventListener("resize", redimensionar, { passive: true });

    // o dedo/mouse entorta o sinal de leve
    const alvo = { x: 0, y: 0 };
    const atual = { x: 0, y: 0 };
    window.addEventListener("pointermove", function (e) {
        alvo.x = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
        alvo.y = -((e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1);
    }, { passive: true });

    let tempo = 0;
    let ultimo = 0;
    let anterior = performance.now();
    const intervalo = 1000 / QUADROS;

    function desenhar(agora) {
        requestAnimationFrame(desenhar);
        if (document.hidden) { anterior = agora; return; }
        if (agora - ultimo < intervalo) return;
        ultimo = agora - ((agora - ultimo) % intervalo);

        const passo = Math.min((agora - anterior) / 1000, 0.1);
        anterior = agora;
        tempo += passo * AJUSTES.velocidade;

        atual.x += (alvo.x - atual.x) * 0.08;
        atual.y += (alvo.y - atual.y) * 0.08;

        gl.uniform1f(u.uTime, tempo);
        gl.uniform2f(u.uPointer, atual.x, atual.y);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(desenhar);

    // se o navegador derrubar o contexto (memória baixa), não fica piscando
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
})();


/* ══════════════════════════════════════════════════════════════
   2. RIPPLE EFFECT on every button click
══════════════════════════════════════════════════════════════ */
document.addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (navigator.vibrate) navigator.vibrate(8);   // subtle haptic tap (mobile)
    const span = document.createElement('span');
    span.className = 'ripple';
    const rect = btn.getBoundingClientRect();
    const d = Math.max(rect.width, rect.height);
    span.style.cssText = `
        width: ${d}px;
        height: ${d}px;
        left: ${e.clientX - rect.left  - d / 2}px;
        top:  ${e.clientY - rect.top   - d / 2}px;
    `;
    btn.appendChild(span);
    setTimeout(() => span.remove(), 650);
});


/* ══════════════════════════════════════════════════════════════
   3. TOAST NOTIFICATION SYSTEM (replaces window.alert)
══════════════════════════════════════════════════════════════ */
(function () {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);

    const ICONS = {
        success: '🎉',
        error:   '❌',
        info:    '🎤',
        warning: '⚠️'
    };

    window.showToast = function (msg, type = 'info') {
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.innerHTML = `<span class="toast-icon">${ICONS[type]}</span><span>${msg}</span>`;
        container.prepend(t);
        setTimeout(() => {
            t.classList.add('exit');
            setTimeout(() => t.remove(), 330);
        }, 3800);
    };

    // Override native alert — decide type by message content
    window.alert = function (msg) {
        const isError = /erro|incorreta|preencha|já tem|fechada/i.test(msg);
        showToast(msg, isError ? 'error' : 'success');
    };
})();


/* ══════════════════════════════════════════════════════════════
   4. CONFETTI BURST
══════════════════════════════════════════════════════════════ */
window.fireConfetti = function () {
    const colors = [
        '#E8821A', '#F5A543', '#C9931A', '#FFD700',
        '#FFF5E0', '#FF9F40', '#ffffff', '#B85E0A', '#FFAA44'
    ];
    for (let i = 0; i < 75; i++) {
        const el = document.createElement('div');
        el.className = 'confetti-piece';
        const size = `${Math.floor(Math.random() * 6 + 5)}px`;
        el.style.cssText = `
            left: ${15 + Math.random() * 70}vw;
            top: -12px;
            width: ${size};
            height: ${size};
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            --dur:   ${(Math.random() * 1.6 + 0.9).toFixed(2)}s;
            --delay: ${(Math.random() * 0.5).toFixed(2)}s;
            border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        `;
        document.body.appendChild(el);
        const total = (parseFloat(el.style.getPropertyValue('--dur')) +
                       parseFloat(el.style.getPropertyValue('--delay'))) * 1000 + 200;
        setTimeout(() => el.remove(), total);
    }
};


/* (Removed the header sound-wave — the refined header keeps the top clean.) */


/* ══════════════════════════════════════════════════════════════
   6. MUTATION OBSERVER — auto-enhance dynamically rendered UI
      • Injects equalizer bars into section headings
      • Staggers queue item entrance animations
      • Adds spotlight sweep to the #1 queue item
      • Adds input-shake on validation errors
══════════════════════════════════════════════════════════════ */
function injectEqualizer(el) {
    if (!el || el.querySelector('.equalizer')) return;
    const eq = document.createElement('span');
    eq.className = 'equalizer';
    const barHeights = [55, 100, 38, 78, 55, 88, 42];
    barHeights.forEach(h => {
        const b = document.createElement('span');
        b.className = 'eq-bar';
        b.style.height = `${h}%`;
        b.style.setProperty('--dur', `${(0.38 + Math.random() * 0.5).toFixed(2)}s`);
        eq.appendChild(b);
    });
    el.appendChild(eq);
}

const appRoot = document.getElementById('app');

const uiObserver = new MutationObserver(() => {
    // Equalizer on headings
    appRoot.querySelectorAll('.queue-section-title, .admin-title').forEach(injectEqualizer);

    // Stagger queue item animations
    appRoot.querySelectorAll('.queue-item').forEach((el, i) => {
        if (!el.dataset.staggered) {
            el.style.animationDelay = `${(i * 0.07).toFixed(2)}s`;
            el.dataset.staggered = '1';
        }
    });

    // Spotlight sweep on first queue item
    const firstItem = appRoot.querySelector('.queue-item:first-child');
    if (firstItem && !firstItem.querySelector('.spotlight-sweep')) {
        const sweep = document.createElement('div');
        sweep.className = 'spotlight-sweep';
        firstItem.appendChild(sweep);
    }
});

uiObserver.observe(appRoot, { childList: true, subtree: true });


/* ══════════════════════════════════════════════════════════════
   7. CONFETTI TRIGGER — detect when current user joins queue
══════════════════════════════════════════════════════════════ */
let _wasInQueue = false;

function pollQueueMembership() {
    try {
        if (typeof localQueue === 'undefined' || typeof currentUID === 'undefined') return;
        const inQueue = Array.isArray(localQueue) && localQueue.some(r => r.uid === currentUID);
        if (inQueue && !_wasInQueue) {
            setTimeout(fireConfetti, 200);
        }
        _wasInQueue = inQueue;
    } catch (_) {}
}

setInterval(pollQueueMembership, 500);


/* ══════════════════════════════════════════════════════════════
   8. INPUT SHAKE — enhance addRequest validation
══════════════════════════════════════════════════════════════ */
(function () {
    const origAlert = window.alert;
    window.alert = function (msg) {
        if (/preencha/i.test(msg)) {
            ['song-name', 'table-number', 'edit-song-name', 'edit-table-number'].forEach(id => {
                const inp = document.getElementById(id);
                if (inp && !inp.value.trim()) {
                    inp.classList.add('shake');
                    setTimeout(() => inp.classList.remove('shake'), 450);
                }
            });
        }
        origAlert(msg);
    };
})();


/* ══════════════════════════════════════════════════════════════
   9. POSITION BADGE FLIP animation on queue reorder
══════════════════════════════════════════════════════════════ */
(function () {
    let prevPositions = {};

    function checkPositions() {
        try {
            if (typeof localQueue === 'undefined') return;
            localQueue.forEach((item, i) => {
                if (prevPositions[item.id] !== undefined && prevPositions[item.id] !== i) {
                    document.querySelectorAll('.position-badge').forEach((badge, j) => {
                        if (j === i) {
                            badge.classList.remove('changed');
                            void badge.offsetWidth; // reflow to restart animation
                            badge.classList.add('changed');
                            setTimeout(() => badge.classList.remove('changed'), 400);
                        }
                    });
                }
                prevPositions[item.id] = i;
            });
        } catch (_) {}
    }

    setInterval(checkPositions, 800);
})();


/* ══════════════════════════════════════════════════════════════
   10. SPOTLIGHT AMBIENT — subtle pulsing color on bg near header
══════════════════════════════════════════════════════════════ */
(function () {
    const spot = document.createElement('div');
    spot.style.cssText = `
        position: fixed;
        top: -120px;
        left: 50%;
        transform: translateX(-50%);
        width: 500px;
        height: 300px;
        border-radius: 50%;
        background: radial-gradient(ellipse at center,
            rgba(232, 130, 26, 0.12) 0%,
            transparent 70%
        );
        pointer-events: none;
        z-index: 0;
        animation: ambient-pulse 5s ease-in-out infinite;
    `;
    document.body.insertBefore(spot, document.body.firstChild);

    const style = document.createElement('style');
    style.textContent = `
        @keyframes ambient-pulse {
            0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1);    }
            50%       { opacity: 1;   transform: translateX(-50%) scale(1.15); }
        }
    `;
    document.head.appendChild(style);
})();


/* ══════════════════════════════════════════════════════════════
   ✨ PILL NAV — a "pílula" desliza atrás do item ativo
══════════════════════════════════════════════════════════════ */
(function () {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;

    const pilula = document.createElement('span');
    pilula.className = 'nav-pilula';
    nav.insertBefore(pilula, nav.firstChild);

    function mover() {
        const ativo = nav.querySelector('button.active');
        if (!ativo) { pilula.style.opacity = '0'; return; }
        pilula.style.opacity = '1';
        pilula.style.left = ativo.offsetLeft + 'px';
        pilula.style.width = ativo.offsetWidth + 'px';
    }

    // acompanha trocas de aba (o app mexe na classe .active)
    new MutationObserver(mover).observe(nav, {
        subtree: true, attributes: true, attributeFilter: ['class'],
    });
    window.addEventListener('resize', mover);
    setTimeout(mover, 60);
})();


/* ══════════════════════════════════════════════════════════════
   ✨ SPOTLIGHT — o brilho segue o dedo/mouse nos cards
══════════════════════════════════════════════════════════════ */
(function () {
    const ALVOS = '.np-card, .turn-card, .steps-card, .rk-me-card, .sr-item';

    function marcar() {
        document.querySelectorAll(ALVOS).forEach((el) => {
            if (!el.classList.contains('spot-card')) el.classList.add('spot-card');
        });
    }
    marcar();
    new MutationObserver(marcar).observe(document.body, { childList: true, subtree: true });

    function seguir(e) {
        const p = e.touches ? e.touches[0] : e;
        const card = (e.target.closest && e.target.closest(ALVOS));
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((p.clientX - r.left) / r.width * 100) + '%');
        card.style.setProperty('--my', ((p.clientY - r.top) / r.height * 100) + '%');
        card.classList.add('tocado');
        clearTimeout(card._spotT);
        card._spotT = setTimeout(() => card.classList.remove('tocado'), 1400);
    }
    if (!MOBILE_UI) {
        document.addEventListener('mousemove', comThrottle(seguir), { passive: true });
    }
})();


/* ══════════════════════════════════════════════════════════════
   🔥 REFORMA — Bento, Card 3D, Gooey nav, Wheel, Manchas
══════════════════════════════════════════════════════════════ */
(function () {

    /* ---- manchas de cor respirando nos cantos (shape blur) ---- */
    [['177,78,255', '-12vw', '-8vh', '58vw', '0s'],
     ['43,184,255', '62vw', '58vh', '52vw', '-7s'],
     ['255,77,157', '30vw', '18vh', '38vw', '-13s']].forEach(([c, l, t, s, d]) => {
        const m = document.createElement('div');
        m.className = 'mancha';
        m.style.cssText = `left:${l};top:${t};width:${s};height:${s};
            background:radial-gradient(circle,rgba(${c},0.30),transparent 68%);
            animation-delay:${d};`;
        document.body.appendChild(m);
    });

    /* ---- brilho que segue o dedo nos cards do BENTO ---- */
    function brilhoBento(e) {
        const p = e.touches ? e.touches[0] : e;
        const card = e.target.closest && e.target.closest('.bento-card');
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((p.clientX - r.left) / r.width * 100) + '%');
        card.style.setProperty('--my', ((p.clientY - r.top) / r.height * 100) + '%');
        card.classList.add('tocado');
        clearTimeout(card._t);
        card._t = setTimeout(() => card.classList.remove('tocado'), 1200);
    }
    if (!MOBILE_UI) {
        document.addEventListener('mousemove', comThrottle(brilhoBento), { passive: true });
    }

    /* ---- PROFILE CARD 3D: o "tocando agora" inclina com o dedo ---- */
    function tilt3d(e) {
        const p = e.touches ? e.touches[0] : e;
        const card = document.getElementById('now-playing');
        if (!card || card.classList.contains('hidden')) return;
        const r = card.getBoundingClientRect();
        if (p.clientY < r.top - 60 || p.clientY > r.bottom + 60) {
            card.style.transform = ''; return;
        }
        const rx = ((p.clientY - r.top) / r.height - 0.5) * -9;   // graus
        const ry = ((p.clientX - r.left) / r.width - 0.5) * 12;
        card.style.transform = `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
        clearTimeout(card._tilt);
        card._tilt = setTimeout(() => { card.style.transform = ''; }, 1600);
    }
    if (!MOBILE_UI) {
        document.addEventListener('mousemove', comThrottle(tilt3d), { passive: true });
    }

    /* ---- GOOEY NAV: a bolha "salta" ao trocar de aba ---- */
    const nav = document.getElementById('bottom-nav');
    if (nav) {
        nav.addEventListener('click', (e) => {
            if (!e.target.closest('button')) return;
            nav.classList.remove('saltando');
            void nav.offsetWidth;
            nav.classList.add('saltando');
            setTimeout(() => nav.classList.remove('saltando'), 500);
        });
    }

    /* ---- OPTION WHEEL: destaca a categoria no centro da esteira ---- */
    const esteira = document.querySelector('.cats-scroll');
    if (esteira) {
        function destacar() {
            const meio = esteira.scrollLeft + esteira.clientWidth / 2;
            esteira.querySelectorAll('.cat').forEach((c) => {
                const centro = c.offsetLeft + c.offsetWidth / 2;
                c.classList.toggle('perto', Math.abs(centro - meio) < c.offsetWidth * 0.62);
            });
        }
        esteira.addEventListener('scroll', destacar, { passive: true });
        setTimeout(destacar, 120);
    }
})();
