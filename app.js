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



/* O fundo animado (shader CRT) foi removido: o site usa preto sólido.
   Com isso saem um contexto WebGL, um laço de 30 quadros por segundo
   e ~350 linhas de shader — menos bateria e menos calor no celular. */


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


/* ══════════════════════════════════════════════════════════════
   🫧 GLASS SURFACE — porte do componente do ReactBits
   https://reactbits.dev/components/glass-surface

   COMO O VIDRO REFRATA. O truque é um mapa de deslocamento: um SVG
   desenhado na hora, do tamanho exato da barra, com um degradê
   vermelho na horizontal e um azul na vertical. O feDisplacementMap
   lê o canal R como "empurra em x" e o G como "empurra em y", então
   esse degradê vira a curvatura da lente — forte na borda, nula no
   meio, que é como vidro de verdade entorta a luz.

   A franja colorida sai de rodar o deslocamento TRÊS vezes, uma por
   canal, com escalas um pouco diferentes (-180, -170, -160). Cada
   passada guarda só a sua cor, e as três voltam somadas em `screen`.
   É aberração cromática de propósito, igual à borda de uma lente.

   O QUE O iPHONE VÊ. O componente original desliga tudo isto no
   Safari, porque o WebKit não aplica filtro SVG dentro de
   `backdrop-filter`. Mantive essa checagem: forçar o caminho SVG lá
   deixaria a barra INVISÍVEL, não "menos bonita".
══════════════════════════════════════════════════════════════ */
(function () {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;

    const ID = 'vidro-nav';
    const NS = 'http://www.w3.org/2000/svg';

    /* Valores do componente, com três ajustes de escala.

       O padrão `distortionScale: -180` é calibrado para a caixa de
       demonstração do site. Numa barra de 80px de altura ele desloca
       mais que o DOBRO do próprio tamanho: o resultado é um arco-íris
       que engolia os rótulos "Ranking" e "Regras". A distorção precisa
       ser uma fração da caixa, não um número solto — daí -55, e os
       desvios de canal reduzidos na mesma proporção.

       O raio tem que casar com o da barra, senão o mapa curva num
       canto que não existe. */
    const A = {
        raio: 26,
        larguraBorda: 0.07,
        brilho: 60,          /* 50 no original; subi porque o fundo é preto */
        opacidade: 0.93,
        desfoqueMapa: 11,
        deslocar: 0.4,
        escalaDistorcao: -55,
        desvioR: 0, desvioG: 6, desvioB: 12,
        canalX: 'R', canalY: 'G',
        mistura: 'difference',
    };

    function suportaFiltroSVG() {
        const ua = navigator.userAgent;
        /* TODO navegador no iOS é WebKit por baixo — Chrome, Firefox e
           Edge do iPhone são Safari com outra casca. Testar a marca
           deixaria passar o Chrome do iPhone para o caminho SVG, que
           lá não funciona. Por isso a checagem é pelo APARELHO. */
        const iOS = /iPad|iPhone|iPod/.test(ua) ||
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const webkit = iOS || (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua));
        if (webkit || /Firefox/.test(ua)) return false;
        const d = document.createElement('div');
        d.style.backdropFilter = 'url(#' + ID + ')';
        return d.style.backdropFilter !== '';
    }

    if (!suportaFiltroSVG()) {
        nav.classList.add('vidro-reserva');
        return;                       /* nada de SVG: não seria usado */
    }

    function tag(nome, attrs) {
        const n = document.createElementNS(NS, nome);
        for (const k in attrs) n.setAttribute(k, attrs[k]);
        return n;
    }

    /* o mapa precisa do tamanho REAL da barra; a barra nasce escondida,
       então há um palpite inicial e o ResizeObserver corrige depois */
    function mapaDeDeslocamento() {
        const r = nav.getBoundingClientRect();
        const L = Math.round(r.width) || 350;
        const H = Math.round(r.height) || 80;
        const borda = Math.min(L, H) * (A.larguraBorda * 0.5);
        const svg =
            '<svg viewBox="0 0 ' + L + ' ' + H + '" xmlns="' + NS + '">' +
              '<defs>' +
                '<linearGradient id="gr" x1="100%" y1="0%" x2="0%" y2="0%">' +
                  '<stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/>' +
                '</linearGradient>' +
                '<linearGradient id="gb" x1="0%" y1="0%" x2="0%" y2="100%">' +
                  '<stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/>' +
                '</linearGradient>' +
              '</defs>' +
              '<rect width="' + L + '" height="' + H + '" fill="black"/>' +
              '<rect width="' + L + '" height="' + H + '" rx="' + A.raio + '" fill="url(#gr)"/>' +
              '<rect width="' + L + '" height="' + H + '" rx="' + A.raio + '" fill="url(#gb)" ' +
                    'style="mix-blend-mode:' + A.mistura + '"/>' +
              '<rect x="' + borda + '" y="' + borda + '" ' +
                    'width="' + (L - borda * 2) + '" height="' + (H - borda * 2) + '" ' +
                    'rx="' + A.raio + '" fill="hsl(0 0% ' + A.brilho + '% / ' + A.opacidade + ')" ' +
                    'style="filter:blur(' + A.desfoqueMapa + 'px)"/>' +
            '</svg>';
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    const svg = tag('svg', { width: 0, height: 0, 'aria-hidden': 'true' });
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    const defs = tag('defs');
    const filtro = tag('filter', {
        id: ID, 'color-interpolation-filters': 'sRGB',
        x: '0%', y: '0%', width: '100%', height: '100%',
    });

    const feImage = tag('feImage', {
        x: 0, y: 0, width: '100%', height: '100%',
        preserveAspectRatio: 'none', result: 'map',
    });
    filtro.appendChild(feImage);

    /* uma passada de deslocamento por canal, cada uma guardando só a
       sua cor — é daqui que sai a franja das bordas */
    [
        ['R', A.desvioR, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'],
        ['G', A.desvioG, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],
        ['B', A.desvioB, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'],
    ].forEach(function (c) {
        filtro.appendChild(tag('feDisplacementMap', {
            in: 'SourceGraphic', in2: 'map',
            scale: A.escalaDistorcao + c[1],
            xChannelSelector: A.canalX, yChannelSelector: A.canalY,
            result: 'disp' + c[0],
        }));
        filtro.appendChild(tag('feColorMatrix', {
            in: 'disp' + c[0], type: 'matrix', values: c[2], result: 'cor' + c[0],
        }));
    });

    filtro.appendChild(tag('feBlend', { in: 'corR', in2: 'corG', mode: 'screen', result: 'rg' }));
    filtro.appendChild(tag('feBlend', { in: 'rg', in2: 'corB', mode: 'screen', result: 'saida' }));
    filtro.appendChild(tag('feGaussianBlur', { in: 'saida', stdDeviation: A.deslocar }));

    defs.appendChild(filtro);
    svg.appendChild(defs);
    document.body.appendChild(svg);

    function redesenhar() { feImage.setAttribute('href', mapaDeDeslocamento()); }
    redesenhar();
    nav.classList.add('vidro-svg');

    /* a barra muda de tamanho ao girar a tela e ao sair do `hidden` */
    if (window.ResizeObserver) new ResizeObserver(redesenhar).observe(nav);
})();


/* ══════════════════════════════════════════════════════════════
   🎬 INTRO — sai sozinha e entrega a tela
   Some em 2,2s, ou no primeiro toque pra quem não quer esperar.

   O prazo NÃO depende da imagem carregar: se a logo falhar, a
   intro sai do mesmo jeito. Tela preta presa é o pior desfecho
   possível numa tela de abertura.
══════════════════════════════════════════════════════════════ */
(function () {
    const intro = document.getElementById('intro');
    /* Sem intro no DOM, a página não pode ficar escondida esperando
       a trava de 4s do CSS. Devolve na hora. */
    if (!intro) { document.documentElement.classList.remove('intro-ativa'); return; }

    let saiu = false;
    function sair() {
        if (saiu) return;
        saiu = true;
        /* Devolve a página ANTES de começar o fade: assim ela aparece
           por baixo enquanto a intro se apaga, em vez de surgir seca
           quando o elemento some. */
        document.documentElement.classList.remove('intro-ativa');
        intro.classList.add('saindo');
        setTimeout(() => intro.remove(), 650);
    }

    const prazo = setTimeout(sair, 2200);
    intro.addEventListener('click', () => { clearTimeout(prazo); sair(); });
})();
