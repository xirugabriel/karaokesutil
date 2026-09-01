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
   1. FUNDO — AERO SHARDS + DITHER
   Cacos de vidro colorido girando devagar, com uma trama de
   pontos (dither) por cima. Canvas único, leve no celular.
══════════════════════════════════════════════════════════════ */
(function () {
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas';
    document.body.insertBefore(canvas, document.body.firstChild);
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0, DPR = 1;
    function resize() {
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        W = canvas.width = Math.floor(window.innerWidth * DPR);
        H = canvas.height = Math.floor(window.innerHeight * DPR);
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
    }
    resize();
    window.addEventListener('resize', resize);

    const CORES = [
        [177, 78, 255],   // roxo
        [43, 184, 255],   // azul
        [255, 77, 157],   // magenta
        [140, 110, 255],  // violeta
    ];

    // cada caco: polígono irregular que gira e deriva
    const CACOS = Array.from({ length: 11 }, (_, i) => {
        const lados = 3 + Math.floor(Math.random() * 3); // 3 a 5 lados
        const pontos = Array.from({ length: lados }, (_, k) => {
            const a = (k / lados) * Math.PI * 2 + Math.random() * 0.5;
            const r = 0.55 + Math.random() * 0.45;
            return [Math.cos(a) * r, Math.sin(a) * r];
        });
        return {
            pontos,
            x: Math.random(), y: Math.random(),
            tam: 110 + Math.random() * 260,
            cor: CORES[i % CORES.length],
            giro: Math.random() * Math.PI * 2,
            vGiro: (Math.random() - 0.5) * 0.00022,
            vx: (Math.random() - 0.5) * 0.000035,
            vy: (Math.random() - 0.5) * 0.000028,
            alpha: 0.22 + Math.random() * 0.26,
        };
    });

    function desenharCaco(c, t) {
        const x = ((c.x + c.vx * t) % 1.25 + 1.25) % 1.25 - 0.12;
        const y = ((c.y + c.vy * t) % 1.25 + 1.25) % 1.25 - 0.12;
        const px = x * W, py = y * H;
        const s = c.tam * DPR;
        const ang = c.giro + c.vGiro * t;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.beginPath();
        c.pontos.forEach(([ax, ay], i) => {
            const vx = ax * s, vy = ay * s;
            i ? ctx.lineTo(vx, vy) : ctx.moveTo(vx, vy);
        });
        ctx.closePath();

        const [r, g, b] = c.cor;
        const rgb = r + ',' + g + ',' + b;
        const grad = ctx.createLinearGradient(-s, -s, s, s);
        grad.addColorStop(0, 'rgba(' + rgb + ',' + c.alpha + ')');
        grad.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = 'rgba(' + rgb + ',' + (c.alpha * 1.6) + ')';
        ctx.lineWidth = 1.2 * DPR;
        ctx.stroke();
        ctx.restore();
    }

    (function tick(t) {
        ctx.clearRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';
        for (const c of CACOS) desenharCaco(c, t);
        requestAnimationFrame(tick);
    })(0);

    // DITHER: trama de pontos por cima dos cacos
    const dither = document.createElement('div');
    dither.id = 'dither';
    document.body.insertBefore(dither, canvas.nextSibling);
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
    document.addEventListener('mousemove', seguir, { passive: true });
    document.addEventListener('touchstart', seguir, { passive: true });
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
    document.addEventListener('mousemove', brilhoBento, { passive: true });
    document.addEventListener('touchstart', brilhoBento, { passive: true });

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
    document.addEventListener('mousemove', tilt3d, { passive: true });
    document.addEventListener('touchmove', tilt3d, { passive: true });

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
