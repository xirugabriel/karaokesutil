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
        cor:          "#230E46",   // fósforo — roxo bem fundo
        fundo:        "#000000",   // preto puro
        velocidade:   0.5,
        curvatura:    0.25,
        /* Daqui pra baixo são os valores PADRÃO do componente. Da outra
           vez eu tinha mexido em quase todos pra segurar um roxo claro
           que gritava atrás do texto. Com o fósforo escuro (#230E46)
           sobre preto isso não é mais preciso: a própria cor já entrega
           um fundo discreto, e mexer só apagaria o efeito. */
        forcaScanline: 0.25,
        amplitudeOnda: 0.30,
        densidadeOnda: 2.5,
        brilho:       1.5,
        raioBrilho:   1.0,
        /* O padrão é 0.10. Como o canvas é renderizado menor e esticado
           pela CSS, o grão é ampliado junto e fica mais grosso do que na
           referência — no celular, onde a escala é menor, mais ainda.
           Baixar aqui devolve a aparência do original. */
        ruido:        TELA_PEQUENA ? 0.05 : 0.07,
        vinheta:      0,
        exposicao:    1.25,
        desvioRGB:    0.015,
        forcaPonteiro: 0.5,
        teto:         1.0          // sem limite: quem escurece é a cor
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

  /* uMix ficou como controle de intensidade, hoje em 1.0 (sem corte).
     A potência que eu aplicava aqui existia pra abrir sombra quando o
     fósforo era um roxo claro; com a cor escura ela só apagaria o
     desenho, então saiu. */
  waveMask = waveMask * edgeFade * uMix;

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


/* As seções decorativas do design antigo (pílula deslizante da barra,
   holofote que seguia o dedo, tilt 3D nos cards, bento, manchas de cor)
   foram removidas junto com a reforma visual. A pílula, em especial,
   injetava um <span> como primeiro filho do #bottom-nav — um 5º item
   flex que roubava espaço e espremia os botões, cortando "Pedir Música". */


/* ══════════════════════════════════════════════════════════════
   🫧 GOOEY NAV — bolha que escorre entre os itens + estouro
   Porte do componente do ReactBits para JS puro.

   Como o efeito funciona: as formas são desenhadas dentro de uma
   camada que leva blur() e depois contrast(100). O blur borra as
   bordas e o contraste devolve elas duras — onde dois borrões se
   tocam, viram um só. É daí que vem o escorrido. O ::before preto
   é o substrato que o contraste precisa, e o mix-blend-mode:lighten
   apaga esse preto na hora de compor.

   ADAPTAÇÃO DE COR: contrast(100) joga cada canal para 0 ou 255,
   então branco sairia branco. Para cair no roxo da casa a cor de
   origem precisa ter R e B altos e G baixo — daí o rgb(190,60,240),
   que o filtro leva para magenta.
══════════════════════════════════════════════════════════════ */
(function () {
    const QTD = MOBILE_UI ? 10 : 14;   // menos partículas no celular
    const DIST = [76, 10];
    const GIRO = 100;
    const TEMPO = 560;
    const VARIA = 280;

    const ruido = (n) => n / 2 - Math.random() * n;

    function pontoNoCirculo(raio, i, total) {
        const ang = ((360 + ruido(8)) / total) * i * (Math.PI / 180);
        return [raio * Math.cos(ang), raio * Math.sin(ang)];
    }

    function estourar(camada) {
        for (let i = 0; i < QTD; i++) {
            const t = TEMPO * 2 + ruido(VARIA * 2);
            const ini = pontoNoCirculo(DIST[0], QTD - i, QTD);
            const fim = pontoNoCirculo(DIST[1] + ruido(7), QTD - i, QTD);
            let giro = ruido(GIRO / 10);
            giro = giro > 0 ? (giro + GIRO / 20) * 10 : (giro - GIRO / 20) * 10;

            const p = document.createElement('span');
            p.className = 'goo-particula';
            p.style.setProperty('--ix', ini[0] + 'px');
            p.style.setProperty('--iy', ini[1] + 'px');
            p.style.setProperty('--fx', fim[0] + 'px');
            p.style.setProperty('--fy', fim[1] + 'px');
            p.style.setProperty('--t', t + 'ms');
            p.style.setProperty('--escala', (1 + ruido(0.2)).toFixed(2));
            p.style.setProperty('--giro', giro + 'deg');

            const ponto = document.createElement('span');
            ponto.className = 'goo-ponto';
            p.appendChild(ponto);
            camada.appendChild(p);
            setTimeout(() => p.remove(), t);
        }
    }

    /* ---- barras com vários itens: a bolha viaja até o ativo ---- */
    function ligarBarra(seletorCaixa, seletorItem, seletorAtivo) {
        const caixa = document.querySelector(seletorCaixa);
        if (!caixa || caixa.querySelector('.goo-camada')) return;

        const camada = document.createElement('span');
        camada.className = 'goo-camada';
        caixa.appendChild(camada);
        caixa.classList.add('goo-caixa');

        let apagar = null;

        function posicionar(item, comEstouro) {
            if (!item) return;
            const rc = caixa.getBoundingClientRect();
            const ri = item.getBoundingClientRect();
            camada.style.left   = (ri.x - rc.x) + 'px';
            camada.style.top    = (ri.y - rc.y) + 'px';
            camada.style.width  = ri.width + 'px';
            camada.style.height = ri.height + 'px';
            if (!comEstouro) return;   // só reposiciona, sem acender

            /* O filtro (blur + contrast + blend) é caro e SÓ existe
               enquanto a animação roda. Deixá-lo ligado o tempo todo
               obrigaria o navegador a refazê-lo a cada quadro do CRT
               que anima atrás — foi o que travou a página no teste. */
            camada.classList.add('acesa');
            camada.querySelectorAll('.goo-particula').forEach((p) => p.remove());
            estourar(camada);
            clearTimeout(apagar);
            apagar = setTimeout(() => camada.classList.remove('acesa'), 1200);
        }

        const ativo = () => caixa.querySelector(seletorAtivo);

        caixa.addEventListener('click', (e) => {
            const item = e.target.closest(seletorItem);
            if (!item || item.matches(seletorAtivo)) return;
            // o app troca a classe no mesmo clique; espera o quadro seguinte
            requestAnimationFrame(() => posicionar(ativo() || item, true));
        });

        /* O item ativo não existe ainda quando este código roda: quem
           marca a classe é o updateUI, bem depois do login. Por isso
           um observador de classe — ele pega tanto a marcação inicial
           quanto qualquer troca feita por fora do clique. */
        if (window.MutationObserver) {
            new MutationObserver(() => posicionar(ativo(), false))
                .observe(caixa, { attributes: true, subtree: true, attributeFilter: ['class'] });
        }
        requestAnimationFrame(() => posicionar(ativo(), false));
        if (window.ResizeObserver) {
            new ResizeObserver(() => posicionar(ativo(), false)).observe(caixa);
        }
    }

    /* ---- botão solto: só o estouro, sem bolha viajante ---- */
    function ligarBotao(seletor) {
        document.querySelectorAll(seletor).forEach((btn) => {
            if (btn.querySelector('.goo-camada')) return;
            btn.classList.add('goo-solo');
            const camada = document.createElement('span');
            camada.className = 'goo-camada goo-centro';
            btn.appendChild(camada);
            let apagar = null;
            btn.addEventListener('click', () => {
                camada.classList.add('acesa');
                camada.querySelectorAll('.goo-particula').forEach((p) => p.remove());
                estourar(camada);
                clearTimeout(apagar);
                apagar = setTimeout(() => camada.classList.remove('acesa'), 1200);
            });
        });
    }

    function ligarTudo() {
        ligarBarra('#bottom-nav', 'button', 'button.active');
        ligarBarra('.rk-toggle', '.rk-opt', '.rk-opt.ativo');
        ligarBotao('.rk-cta-btn');
        ligarBotao('.rk-hero-btn');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ligarTudo);
    } else {
        ligarTudo();
    }
})();


/* ══════════════════════════════════════════════════════════════
   🎠 CIRCULAR GALLERY — categorias curvadas num arco
   Porte do componente do ReactBits.

   ⚠️ POR QUE NÃO É WebGL COMO O ORIGINAL: o componente deles roda
   sobre a biblioteca OGL e desenha num canvas WebGL próprio. Esta
   página JÁ tem um canvas WebGL rodando sem parar (o CRT do fundo).
   Dois contextos desenhando ao mesmo tempo num celular é bateria e
   risco de engasgo — ainda mais depois do travamento da rodada
   passada. Então a MATEMÁTICA é a mesma (copiada do update() deles),
   só que aplicada com transform, que a GPU resolve de graça:

     R   = (H² + b²) / 2b        · raio do círculo do arco
     arc = R - √(R² - x²)        · quanto o item desce
     rot = -sinal(x) · asin(x/R) · quanto ele tomba

   Custo: o laço PARA sozinho quando a esteira assenta. Parado, zero.
══════════════════════════════════════════════════════════════ */
(function () {
    const CURVA = 36;      // quanto o item da ponta desce, em pixels
    const SUAVE = 0.085;   // quanto o movimento persegue o alvo por quadro
    const RODA  = 1.6;     // sensibilidade do scroll do mouse

    const esteira = document.querySelector('.cats-scroll');
    if (!esteira) return;
    const itens = [].slice.call(esteira.querySelectorAll('.cat'));
    if (itens.length < 2) return;

    esteira.classList.add('cg-palco');

    let passo = 0, total = 0, meia = 0;
    const extra = new Array(itens.length).fill(0);
    let alvo = 0, atual = 0, ultimo = 0;
    let rodando = false, arrastando = false, partiuX = 0, partiuAlvo = 0;

    const ESPACO = 11;   // mesmo gap que a esteira usava no CSS

    /* O passo vem da LARGURA do item, não do espaçamento entre dois.
       Dois motivos: no carregamento a tela do cliente ainda está
       oculta e todo retângulo mede 0; e depois que vira palco os
       itens ficam todos em left:50%, então não há mais espaçamento
       para medir. A largura sobrevive aos dois casos. */
    function medir() {
        const larg = itens[0].getBoundingClientRect().width;
        if (larg > 0) {
            passo = larg + ESPACO;
            total = passo * itens.length;
        }
        meia = esteira.clientWidth / 2;
        return passo > 0 && meia > 0;
    }

    function desenhar() {
        const dir = atual > ultimo ? 'direita' : 'esquerda';
        const b = CURVA;
        const R = (meia * meia + b * b) / (2 * b);

        itens.forEach((el, i) => {
            let x = i * passo - atual + extra[i];

            /* Rodízio infinito: quem sai por um lado reentra pelo outro.
               É o mesmo "extra" do original. */
            const meiaLargura = passo / 2;
            if (dir === 'direita' && x + meiaLargura < -meia) { extra[i] += total; x += total; }
            if (dir === 'esquerda' && x - meiaLargura >  meia) { extra[i] -= total; x -= total; }

            const xr = Math.min(Math.abs(x), meia);
            const arco = R - Math.sqrt(Math.max(0, R * R - xr * xr));
            const giro = -Math.sign(x) * Math.asin(xr / R) * (180 / Math.PI);

            el.style.transform =
                `translate(-50%, 0) translate(${x}px, ${arco}px) rotate(${giro}deg)`;
        });

        ultimo = atual;
    }

    function laco() {
        atual += (alvo - atual) * SUAVE;
        desenhar();
        // assentou? para o laço. Nada roda com a esteira parada.
        if (!arrastando && Math.abs(alvo - atual) < 0.4) {
            atual = alvo; desenhar(); rodando = false; return;
        }
        requestAnimationFrame(laco);
    }

    function acordar() {
        if (rodando) return;
        rodando = true;
        requestAnimationFrame(laco);
    }

    // ---- arrastar ----
    function pegar(x) { arrastando = true; partiuX = x; partiuAlvo = alvo; esteira.classList.add('cg-pegando'); }
    function mover(x) { if (arrastando) { alvo = partiuAlvo - (x - partiuX); acordar(); } }
    function soltar()  {
        if (!arrastando) return;
        arrastando = false;
        esteira.classList.remove('cg-pegando');
        alvo = Math.round(alvo / passo) * passo;   // encaixa no item mais próximo
        acordar();
    }

    esteira.addEventListener('touchstart', (e) => pegar(e.touches[0].clientX), { passive: true });
    esteira.addEventListener('touchmove',  (e) => { mover(e.touches[0].clientX); }, { passive: true });
    esteira.addEventListener('touchend', soltar);
    esteira.addEventListener('mousedown', (e) => { pegar(e.clientX); e.preventDefault(); });
    window.addEventListener('mousemove', (e) => mover(e.clientX));
    window.addEventListener('mouseup', soltar);
    esteira.addEventListener('wheel', (e) => {
        alvo += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * RODA;
        acordar();
    }, { passive: true });

    /* Arrastar não pode virar clique: sem isto, deslizar a esteira
       dispararia a busca da categoria que ficou embaixo do dedo. */
    itens.forEach((el) => {
        el.addEventListener('click', (ev) => {
            if (Math.abs(alvo - partiuAlvo) > 6) { ev.preventDefault(); ev.stopPropagation(); }
        }, true);
    });

    // só desenha quando já dá pra medir (a aba pode estar oculta ainda)
    function reiniciar() { if (medir()) desenhar(); }
    reiniciar();
    window.addEventListener('resize', reiniciar, { passive: true });
    // a aba começa escondida: remede quando ela realmente aparece
    if (window.ResizeObserver) new ResizeObserver(reiniciar).observe(esteira);
})();
