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
        /* Mede a PRÓPRIA caixa, não a janela: o canvas agora transborda
           120px acima e abaixo do viewport pra cobrir o notch e a barra
           do navegador. Usar innerHeight desenharia no tamanho da janela
           e a imagem sairia esticada nessa sobra. */
        const cssL = canvas.clientWidth  || window.innerWidth;
        const cssA = canvas.clientHeight || window.innerHeight;
        const larg = Math.max(1, Math.round(cssL * ESCALA));
        const alt  = Math.max(1, Math.round(cssA * ESCALA));
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
            Math.max(14, Math.round(cssL / CEL_LARG)),
            Math.max(14, Math.round(cssA / CEL_ALT)));
    }
    redimensionar();
    window.addEventListener("resize", redimensionar, { passive: true });
    /* A caixa do canvas muda por CSS (a sangra que cobre o notch), e isso
       não dispara `resize` da janela. Sem observar a própria caixa, o
       shader ficaria desenhando na medida antiga e a imagem sairia
       esticada na sobra. */
    if (window.ResizeObserver) new ResizeObserver(redimensionar).observe(canvas);

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
    const CURVA = 30;      // quanto o item da ponta desce, em pixels
    /* Quanto do tombo o card leva. O original inclina o ângulo cheio
       (uns 21° na ponta), o que numa imagem larga fica elegante mas em
       card pequeno e em pé lê como "torto". Aqui fica suave: o arco
       continua marcando a curva, o tombo só acompanha de leve.
       Para o tombo do original, é só pôr 1. */
    const INCLINA = 0.32;
    const SUAVE = 0.085;   // quanto o movimento persegue o alvo por quadro
    const RODA  = 1.6;     // sensibilidade do scroll do mouse

    const esteira = document.querySelector('.cats-scroll');
    if (!esteira) return;
    const itens = [].slice.call(esteira.querySelectorAll('.cat'));
    if (itens.length < 2) return;

    esteira.classList.add('cg-palco');

    let passo = 0, total = 0, meia = 0;
    let alvo = 0, atual = 0;
    let rodando = false;   // arrasto e afins são declarados no bloco de gestos

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
        const b = CURVA;
        const R = (meia * meia + b * b) / (2 * b);
        const metade = total / 2;

        itens.forEach((el, i) => {
            /* Rodízio por RESTO, não por acúmulo. O original vai somando
               um "extra" a cada volta, comparando com a direção do
               movimento — e numa rolagem longa isso sai de sincronia e
               os cards empilham. Com o resto, a posição de cada item é
               calculada do zero a cada quadro: não acumula erro, não
               depende da direção e aguenta qualquer distância. */
            let x = (i * passo - atual) % total;
            if (x < 0) x += total;          // 0 .. total
            if (x > metade) x -= total;     // -total/2 .. total/2

            const xr = Math.min(Math.abs(x), meia);
            const arco = R - Math.sqrt(Math.max(0, R * R - xr * xr));
            const giro = -Math.sign(x) * Math.asin(xr / R) * (180 / Math.PI) * INCLINA;

            el.style.transform =
                `translate(-50%, 0) translate(${x.toFixed(1)}px, ${arco.toFixed(1)}px) rotate(${giro.toFixed(2)}deg)`;

            /* Marca quem está no meio. É esse card — e só ele — que
               acende o brilho holográfico. Sete blends animando ao
               mesmo tempo sobre o CRT seria carga demais. */
            const meio = Math.abs(x) < passo / 2;
            if (meio !== el.classList.contains('no-centro')) {
                el.classList.toggle('no-centro', meio);
            }
        });
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

    /* ── ARRASTO ─────────────────────────────────────────────
       Quatro cuidados que faltavam e deixavam o gesto errático:

       1. TRAVA DE EIXO. Antes eu movia a esteira em qualquer
          touchmove. Rolando a página com o dedo em cima das
          categorias, a tremida horizontal natural sacudia tudo
          junto. Agora o primeiro movimento decide: se for mais
          vertical que horizontal, o arrasto é abandonado e a
          página rola limpa.
       2. touchcancel. Se o sistema interrompe o toque (chamada,
          notificação), sem isto o arrasto ficava preso ligado.
       3. MOUSE FANTASMA. O celular dispara eventos de mouse
          depois do toque. Sem ignorar, cada gesto era processado
          duas vezes e a esteira pulava.
       4. INÉRCIA. Sem ela, um deslize rápido andava um card só.
          Agora a velocidade do dedo projeta o destino.            */
    let arrastando = false, eixo = null;
    let partiuX = 0, partiuY = 0, partiuAlvo = 0;
    let ultimoX = 0, ultimoT = 0, velocidade = 0;
    let houveToque = false;

    function inicio(x, y) {
        arrastando = true;
        eixo = null;
        partiuX = x; partiuY = y; partiuAlvo = alvo;
        ultimoX = x; ultimoT = performance.now(); velocidade = 0;
        esteira.classList.add('cg-pegando');
    }

    function anda(x, y) {
        if (!arrastando) return;
        if (eixo === null) {
            const dx = Math.abs(x - partiuX), dy = Math.abs(y - partiuY);
            if (dx < 5 && dy < 5) return;         // ainda não dá pra saber
            eixo = dx > dy ? 'x' : 'y';
            if (eixo === 'y') {                   // é rolagem da página
                arrastando = false;
                esteira.classList.remove('cg-pegando');
                return;
            }
        }
        const agora = performance.now();
        const dt = agora - ultimoT;
        /* Com dois movimentos quase no mesmo instante, dt tende a zero
           e a divisão estoura — a inércia jogaria a esteira longe. Piso
           de 4ms no tempo e teto de 2,5px/ms na velocidade (mais rápido
           que isso nenhum dedo faz) seguram o resultado. */
        if (dt >= 4) {
            const v = (x - ultimoX) / dt;
            velocidade = Math.max(-2.5, Math.min(2.5, v));
            ultimoX = x; ultimoT = agora;
        }
        alvo = partiuAlvo - (x - partiuX);
        acordar();
    }

    function fim() {
        if (!arrastando) return;
        arrastando = false;
        esteira.classList.remove('cg-pegando');
        // projeta onde pararia com a inércia e encaixa no card mais próximo
        const projecao = -velocidade * 230;
        alvo = Math.round((alvo + projecao) / passo) * passo;
        acordar();
    }

    esteira.addEventListener('touchstart', (e) => {
        houveToque = true;
        inicio(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    esteira.addEventListener('touchmove', (e) => {
        anda(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    esteira.addEventListener('touchend', fim);
    esteira.addEventListener('touchcancel', fim);

    // mouse só entra se o aparelho não for de toque
    esteira.addEventListener('mousedown', (e) => {
        if (houveToque) return;
        inicio(e.clientX, e.clientY);
        e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
        if (houveToque) return;
        anda(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => { if (!houveToque) fim(); });

    esteira.addEventListener('wheel', (e) => {
        alvo += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * RODA;
        acordar();
    }, { passive: true });

    /* Arrastar não pode virar clique: sem isto, deslizar a esteira
       dispararia a busca da categoria que ficou embaixo do dedo. */
    itens.forEach((el) => {
        el.addEventListener('click', (ev) => {
            if (eixo === 'x' && Math.abs(alvo - partiuAlvo) > 6) {
                ev.preventDefault(); ev.stopPropagation();
            }
        }, true);
    });

    function reiniciar() { if (medir()) desenhar(); }
    reiniciar();
    window.addEventListener('resize', reiniciar, { passive: true });
    // a aba começa escondida: remede quando ela realmente aparece
    if (window.ResizeObserver) new ResizeObserver(reiniciar).observe(esteira);
})();


/* ══════════════════════════════════════════════════════════════
   ⚡ ELECTRIC BORDER no card "sua vez"
   Porte do componente do ReactBits. Ele traça o contorno
   arredondado e desloca cada ponto com ruído em várias oitavas,
   redesenhando a cada quadro — é isso que faz a borda tremer como
   um fio de eletricidade.

   📱 O ORIGINAL É CARO. São ~725 pontos × 2 eixos × 10 oitavas por
   quadro, a 60fps, numa página que já roda o shader do CRT. Quatro
   travas, sem mudar o desenho:
     · 30 quadros por segundo (o original vai a 60)
     · 5 oitavas no celular em vez de 10 — as últimas só somam
       detalhe fino que some num traço de 2px
     · 1 ponto a cada 3,2px de perímetro, em vez de 1 a cada 2
     · para de desenhar quando o card sai da tela ou o app vai
       pro segundo plano
══════════════════════════════════════════════════════════════ */
(function () {
    const card = document.getElementById('your-turn');
    if (!card) return;

    const COR      = '#7DD8FF';
    const NUCLEO   = '#EAF9FF';   // o miolo do arco é quase branco
    const VELOC    = 1.25;
    const CAOS     = 0.13;
    const RAIO     = 22;
    const MARGEM   = 34;    // folga em volta pro traço poder escapar
    const OITAVAS  = MOBILE_UI ? 6 : 9;
    const QUADROS  = 30;
    /* Estava em 26 e o resultado era um contorno quase reto. O
       componente original usa 60; 46 dá a tremida de fio elétrico
       sem o traço fugir demais da borda do card. */
    const DESLOC   = 46;

    const tela = document.createElement('canvas');
    tela.className = 'turn-raio';
    card.insertBefore(tela, card.firstChild);
    const ctx = tela.getContext('2d');
    if (!ctx) { tela.remove(); return; }

    let larg = 0, alt = 0, dpr = 1, tempo = 0, anterior = 0, ultimo = 0;
    let naTela = true;

    const aleatorio = (x) => (Math.sin(x * 12.9898) * 43758.5453) % 1;

    function ruido2D(x, y) {
        const i = Math.floor(x), j = Math.floor(y);
        const fx = x - i, fy = y - j;
        const a = aleatorio(i + j * 57);
        const b = aleatorio(i + 1 + j * 57);
        const c = aleatorio(i + (j + 1) * 57);
        const d = aleatorio(i + 1 + (j + 1) * 57);
        const ux = fx * fx * (3 - 2 * fx);
        const uy = fy * fy * (3 - 2 * fy);
        return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
    }

    function ruidoOitavas(x, semente, t) {
        let y = 0, amplitude = CAOS, frequencia = 10;
        for (let i = 0; i < OITAVAS; i++) {
            if (i > 0) y += amplitude * ruido2D(frequencia * x + semente * 100, t * frequencia * 0.3);
            frequencia *= 1.6;
            amplitude *= 0.7;
        }
        return y;
    }

    // ponto sobre o retângulo arredondado, em t de 0 a 1
    function pontoNaBorda(t, x0, y0, w, h, r) {
        const retaW = w - 2 * r, retaH = h - 2 * r;
        const arco = (Math.PI * r) / 2;
        const total = 2 * retaW + 2 * retaH + 4 * arco;
        let d = t * total, acc = 0;
        const canto = (cx, cy, ini, p) => ({
            x: cx + r * Math.cos(ini + p * (Math.PI / 2)),
            y: cy + r * Math.sin(ini + p * (Math.PI / 2)),
        });
        if (d <= acc + retaW) return { x: x0 + r + ((d - acc) / retaW) * retaW, y: y0 };
        acc += retaW;
        if (d <= acc + arco) return canto(x0 + w - r, y0 + r, -Math.PI / 2, (d - acc) / arco);
        acc += arco;
        if (d <= acc + retaH) return { x: x0 + w, y: y0 + r + ((d - acc) / retaH) * retaH };
        acc += retaH;
        if (d <= acc + arco) return canto(x0 + w - r, y0 + h - r, 0, (d - acc) / arco);
        acc += arco;
        if (d <= acc + retaW) return { x: x0 + w - r - ((d - acc) / retaW) * retaW, y: y0 + h };
        acc += retaW;
        if (d <= acc + arco) return canto(x0 + r, y0 + h - r, Math.PI / 2, (d - acc) / arco);
        acc += arco;
        if (d <= acc + retaH) return { x: x0, y: y0 + h - r - ((d - acc) / retaH) * retaH };
        acc += retaH;
        return canto(x0 + r, y0 + r, Math.PI, (d - acc) / arco);
    }

    function medir() {
        const r = card.getBoundingClientRect();
        if (!r.width) return false;
        larg = r.width + MARGEM * 2;
        alt  = r.height + MARGEM * 2;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        tela.width  = larg * dpr;
        tela.height = alt * dpr;
        tela.style.width  = larg + 'px';
        tela.style.height = alt + 'px';
        tela.style.left = -MARGEM + 'px';
        tela.style.top  = -MARGEM + 'px';
        return true;
    }

    function desenhar(agora) {
        requestAnimationFrame(desenhar);
        if (!naTela || document.hidden || card.classList.contains('hidden')) { anterior = agora; return; }
        if (agora - ultimo < 1000 / QUADROS) return;
        ultimo = agora;
        if (!larg && !medir()) return;

        tempo += Math.min((agora - anterior) / 1000, 0.1) * VELOC;
        anterior = agora;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, larg, alt);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const bw = larg - 2 * MARGEM, bh = alt - 2 * MARGEM;
        const r = Math.min(RAIO, Math.min(bw, bh) / 2);
        const perimetro = 2 * (bw + bh) + 2 * Math.PI * r;
        const amostras = Math.floor(perimetro / 3.2);

        ctx.beginPath();
        for (let i = 0; i <= amostras; i++) {
            const t = i / amostras;
            const p = pontoNaBorda(t, MARGEM, MARGEM, bw, bh, r);
            const x = p.x + ruidoOitavas(t * 8, 0, tempo) * DESLOC;
            const y = p.y + ruidoOitavas(t * 8, 1, tempo) * DESLOC;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();

        /* O caminho é calculado UMA vez e pintado três: halo largo e
           fraco, halo médio, e o núcleo fino quase branco. É essa
           sobreposição que faz ler como descarga elétrica — um traço
           só de 1px fica parecendo um contorno desenhado.
           Custo: três traçados de um caminho pronto, que é barato
           perto do ruído que já foi calculado. */
        /* SEM ctx.shadowBlur: ele é das operações mais caras do canvas,
           e três traços com sombra num canvas de ~820x850 estouravam o
           tempo de composição (o preview nem conseguia tirar print).
           O halo sai de graça dos próprios traços: um bem largo e quase
           transparente por baixo, um médio, e o núcleo fino por cima. */
        ctx.strokeStyle = COR;

        ctx.globalAlpha = 0.09;
        ctx.lineWidth = 9;
        ctx.stroke();

        ctx.globalAlpha = 0.20;
        ctx.lineWidth = 5;
        ctx.stroke();

        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2.4;
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.strokeStyle = NUCLEO;
        ctx.lineWidth = 1.1;
        ctx.stroke();
    }

    if (window.ResizeObserver) new ResizeObserver(medir).observe(card);
    if (window.IntersectionObserver) {
        new IntersectionObserver(([e]) => { naTela = e.isIntersecting; }).observe(card);
    }
    /* O card nasce oculto e só aparece quando a pessoa tem pedido na
       fila. ResizeObserver só entrega no fim de um quadro; medir na
       troca da classe é síncrono e não depende disso. */
    if (window.MutationObserver) {
        new MutationObserver(() => { if (!card.classList.contains('hidden')) medir(); })
            .observe(card, { attributes: true, attributeFilter: ['class'] });
    }
    medir();
    requestAnimationFrame(desenhar);
})();


/* ══════════════════════════════════════════════════════════════
   🪜 STEPPER — tutorial de como pedir música
   Porte do componente do ReactBits. A trilha de indicadores é
   montada a partir dos passos que existem no HTML, então dá pra
   somar ou tirar um passo lá sem mexer aqui.

   Estados de cada bolinha, como no original:
     · concluído → tique
     · atual     → ponto
     · pendente  → número
   E o conector entre elas preenche conforme avança.
══════════════════════════════════════════════════════════════ */
(function () {
    const caixa = document.getElementById('tutorial');
    if (!caixa) return;

    const passos  = [].slice.call(caixa.querySelectorAll('.passo'));
    const trilha  = document.getElementById('passos-trilha');
    const conta   = document.getElementById('passos-conta');
    const voltar  = document.getElementById('passos-voltar');
    const seguir  = document.getElementById('passos-seguir');
    const seguirTxt = document.getElementById('passos-seguir-txt');
    if (!passos.length || !trilha) return;

    const TIQUE = '<svg viewBox="0 0 24 24" class="passo-tique"><path d="M20 6 9 17l-5-5"/></svg>';
    let atual = 0;

    // monta a trilha: bolinha, conector, bolinha, conector...
    passos.forEach((_, i) => {
        const b = document.createElement('button');
        b.className = 'passo-bola';
        b.type = 'button';
        b.setAttribute('aria-label', 'Passo ' + (i + 1));
        b.addEventListener('click', () => ir(i));
        trilha.appendChild(b);
        if (i < passos.length - 1) {
            const c = document.createElement('span');
            c.className = 'passo-linha';
            c.innerHTML = '<i></i>';
            trilha.appendChild(c);
        }
    });

    const bolas  = [].slice.call(trilha.querySelectorAll('.passo-bola'));
    const linhas = [].slice.call(trilha.querySelectorAll('.passo-linha i'));

    function pintar() {
        passos.forEach((p, i) => p.classList.toggle('ativo', i === atual));

        bolas.forEach((b, i) => {
            b.classList.toggle('feito',  i < atual);
            b.classList.toggle('agora',  i === atual);
            b.innerHTML = i < atual ? TIQUE
                        : i === atual ? '<i class="passo-ponto"></i>'
                        : String(i + 1);
        });
        linhas.forEach((l, i) => { l.style.width = i < atual ? '100%' : '0%'; });

        if (conta) conta.textContent = (atual + 1) + ' de ' + passos.length;
        voltar.classList.toggle('apagado', atual === 0);
        const ultimo = atual === passos.length - 1;
        seguirTxt.textContent = ultimo ? 'Pedir música' : 'Continuar';
        seguir.classList.toggle('finalizar', ultimo);
    }

    function ir(i) {
        atual = Math.max(0, Math.min(passos.length - 1, i));
        pintar();
    }

    voltar.addEventListener('click', () => ir(atual - 1));
    seguir.addEventListener('click', () => {
        if (atual < passos.length - 1) { ir(atual + 1); return; }
        // no último passo o botão leva pra ação: foca a busca
        const busca = document.getElementById('yt-search');
        if (busca) {
            busca.focus();
            busca.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        ir(0);   // deixa o tutorial pronto pro próximo cliente
    });

    pintar();
})();


/* ══════════════════════════════════════════════════════════════
   📜 ANIMATED LIST — itens entram ao aparecer na tela
   Porte do componente do ReactBits, aplicado às três listas:
   ranking, resultados da busca e fila.

   No original cada item nasce em scale(0.7) com opacidade 0 e vai
   a scale(1) quando METADE dele está visível. E como lá o gatilho
   é `triggerOnce: false`, ele encolhe de novo ao sair — mantive
   esse comportamento, é o que dá o efeito de lista "respirando".

   Diferença de contexto: no ReactBits a lista vive numa caixa de
   rolagem própria, com desbotado no topo e no pé. Aqui as listas
   rolam junto com a página, então esses degradês não existem —
   eles pertencem ao rolador interno, que não temos.

   Um IntersectionObserver só, para todas as listas. As listas são
   redesenhadas por innerHTML a cada atualização, então um
   MutationObserver reinscreve os itens novos.
══════════════════════════════════════════════════════════════ */
(function () {
    const LISTAS = ['.rk-list', '#search-results', '.queue-list'];
    const PASSO = 45;      // ms de atraso entre um item e o seguinte
    const TETO  = 8;       // a partir daqui não aumenta mais o atraso

    if (!window.IntersectionObserver) return;

    const olho = new IntersectionObserver((entradas) => {
        entradas.forEach((e) => {
            e.target.classList.toggle('na-vista', e.isIntersecting);
        });
    }, { threshold: 0.5 });

    function inscrever(lista) {
        const itens = [].slice.call(lista.children);
        itens.forEach((el, i) => {
            if (el.dataset.animado) return;
            el.dataset.animado = '1';
            el.classList.add('item-anim');
            // escalona a entrada, mas sem deixar o fim da lista lento demais
            el.style.setProperty('--atraso', (Math.min(i, TETO) * PASSO) + 'ms');
            olho.observe(el);

            /* REDE DE SEGURANÇA. O item começa invisível e só aparece
               quando o observador avisa. Se esse aviso não vier — aba
               oculta na hora do desenho, item mais alto que a tela, ou
               qualquer caso que eu não previ — o cliente ficaria olhando
               uma lista vazia. Conteúdo não pode sumir por causa de
               animação: passado o prazo, aparece de qualquer jeito. */
            setTimeout(() => el.classList.add('na-vista'), 1200);
        });
    }

    function varrer() {
        LISTAS.forEach((sel) => {
            document.querySelectorAll(sel).forEach(inscrever);
        });
    }

    varrer();
    // as listas são reescritas por innerHTML: pega os itens novos
    if (window.MutationObserver) {
        const raiz = document.getElementById('app') || document.body;
        new MutationObserver(varrer).observe(raiz, { childList: true, subtree: true });
    }
})();
