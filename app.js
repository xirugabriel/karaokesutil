/**
 * Sutil Karaokê — Interactivity & Animations
 * Loaded after Firebase inline scripts in index.html
 */

/* ══════════════════════════════════════════════════════════════
   0. INTRO — theatrical curtain reveal
══════════════════════════════════════════════════════════════ */
(function () {
    const intro = document.getElementById('intro');
    if (!intro) return;

    // Trava qualquer rolagem enquanto a intro está na tela
    document.documentElement.classList.add('intro-lock');

    // Garante que a cortina cubra a tela TODA, inclusive atrás da barra do
    // Safari (à prova de falhas — usa a altura física da tela do aparelho).
    function fillScreen() {
        const h = Math.max(
            window.innerHeight || 0,
            (window.screen && window.screen.height) || 0,
            document.documentElement.clientHeight || 0
        ) + 80; // folga pra cobrir a barra do navegador
        intro.style.height = h + 'px';
        // o "palco" (logo/título) centraliza na área VISÍVEL
        const stage = intro.querySelector('.intro-stage');
        if (stage) stage.style.height = (window.innerHeight || document.documentElement.clientHeight) + 'px';
    }
    fillScreen();
    window.addEventListener('resize', fillScreen);

    // Build the equalizer bars under the title
    const eq = document.getElementById('intro-eq');
    if (eq) {
        [40, 70, 100, 55, 85, 48, 95, 62].forEach((h, i) => {
            const b = document.createElement('i');
            b.style.height = h + '%';
            b.style.animationDelay = (i * 0.09).toFixed(2) + 's';
            b.style.animationDuration = (0.40 + Math.random() * 0.40).toFixed(2) + 's';
            eq.appendChild(b);
        });
    }

    let opened = false;
    function openCurtains() {
        if (opened) return;
        opened = true;
        if (navigator.vibrate) navigator.vibrate(18);
        intro.classList.add('intro-open');           // curtains slide apart
        setTimeout(() => intro.classList.add('intro-done'), 900);  // fade overlay (overlaps a abertura)
        setTimeout(() => {
            intro.remove();                          // free the DOM
            document.documentElement.classList.remove('intro-lock'); // libera a rolagem
        }, 1700);
    }

    const auto = setTimeout(openCurtains, 2300);      // auto reveal
    intro.addEventListener('click', () => { clearTimeout(auto); openCurtains(); });
})();


/* ══════════════════════════════════════════════════════════════
   1. CANVAS BACKGROUND — floating music notes
══════════════════════════════════════════════════════════════ */
(function () {
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas';
    document.body.insertBefore(canvas, document.body.firstChild);

    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const NOTES = ['♪', '♫', '♬', '♩', '🎵'];

    class MusicNote {
        constructor(preplace) {
            this._init(preplace);
        }
        _init(preplace) {
            this.x      = Math.random() * canvas.width;
            this.y      = preplace ? Math.random() * canvas.height : canvas.height + 20;
            this.size   = Math.random() * 18 + 8;
            this.speed  = Math.random() * 0.45 + 0.12;
            this.drift  = (Math.random() - 0.5) * 0.35;
            this.alpha  = Math.random() * 0.28 + 0.04;
            this.fade   = Math.random() * 0.0005 + 0.0002;
            this.glyph  = NOTES[Math.floor(Math.random() * NOTES.length)];
            this.rot    = 0;
            this.rotSpd = (Math.random() - 0.5) * 0.018;
        }
        update() {
            this.y     -= this.speed;
            this.x     += this.drift;
            this.alpha -= this.fade;
            this.rot   += this.rotSpd;
            if (this.alpha <= 0 || this.y < -30) this._init(false);
        }
        draw() {
            ctx.save();
            ctx.globalAlpha = Math.max(0, this.alpha);
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rot);
            ctx.font      = `${this.size}px sans-serif`;
            ctx.fillStyle = '#E8821A';
            ctx.textAlign = 'center';
            ctx.fillText(this.glyph, 0, 0);
            ctx.restore();
        }
    }

    const notes = Array.from({ length: 28 }, (_, i) => new MusicNote(i < 18));

    (function tick() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        notes.forEach(n => { n.update(); n.draw(); });
        requestAnimationFrame(tick);
    })();
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
