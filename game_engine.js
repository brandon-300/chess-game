// game_engine.js — Chess rules, AI, and Three.js rendering
// Assumes global THREE is already loaded (via <script> in index.html)

// ---------- Internal state ----------
let engineInitialized = false;

// Chess state
let brd = [];
let turn = 'w';
let cas = { wK: true, wQ: true, bK: true, bQ: true };
let ep = null;
let hist = [];
let capW = [];
let capB = [];
let mlog = [];

// UI interaction state
let selSq = null;
let curLM = [];
let lastMv = null;
let over = false;
let pendP = null;
let isAnim = false;
let aiThink = false;
let frozen = false;            // when true, no moves accepted

// Timer
let timerW = 60;
let timerB = 60;
let timerActive = false;
let lastTick = null;

// Game mode & AI
let gameMode = '2p';
let playerColor = 'w';
let myColor = 'w';
let aiDepth = 3;
let selDiff = 3;

// Callbacks
let moveExecutedCallback = null;
let frameCallback = null;

// Promotion
let promotionPending = false;
let pendingPromotionMove = null;

// Game over info
let gameOverInfo = null;

// Three.js objects
let renderer, scene, camera;
const BOARD_CENTER = new THREE.Vector3(4, 0, 4);
let camTheta = 0, camPhi = 0.78, camDist = 14;
let SQ3D = Array(64).fill(null);
let P3D = Array(64).fill(null);
const PY = 0.125;
let DOTS = [];
let TINTED = [];
let SQ_BASE_COL = [];

// Animation
let animQ = null;
const CLK = new THREE.Clock();
let boardBuilt = false;

// ---------- Chess constants ----------
const GLS = { wK:'\u2654', wQ:'\u2655', wR:'\u2656', wB:'\u2657', wN:'\u2658', wP:'\u2659', bK:'\u265A', bQ:'\u265B', bR:'\u265C', bB:'\u265D', bN:'\u265E', bP:'\u265F' };
const FILES = 'abcdefgh';
const rc = i => ({ r: i >> 3, c: i & 7 });
const ix = (r, c) => r * 8 + c;
const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const cl = p => p ? p[0] : null;
const tp = p => p ? p[1] : null;
const op = c => c === 'w' ? 'b' : 'w';

const PV = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
const PST = {
    P: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    N: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    B: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    R: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    Q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    K: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
};

// ---------- SFX ----------
const SFX = (() => {
    let ctx = null;
    function ac() { if (!ctx) try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} return ctx; }
    function hit(fr, Q, dur, vol, d = 0) {
        try {
            const c = ac(); if (!c) return;
            const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
            const da = buf.getChannelData(0);
            for (let i = 0; i < da.length; i++) da[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * dur * 0.4));
            const src = c.createBufferSource(); src.buffer = buf;
            const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fr; f.Q.value = Q;
            const g = c.createGain(); g.gain.value = vol;
            src.connect(f); f.connect(g); g.connect(c.destination);
            src.start(c.currentTime + d);
        } catch (e) {}
    }
    function tone(fr, type, dur, vol, d = 0) {
        try {
            const c = ac(); if (!c) return;
            const o = c.createOscillator(), g = c.createGain();
            o.type = type; o.frequency.value = fr;
            g.gain.setValueAtTime(vol, c.currentTime + d);
            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d + dur);
            o.connect(g); g.connect(c.destination);
            o.start(c.currentTime + d); o.stop(c.currentTime + d + dur + 0.05);
        } catch (e) {}
    }
    return {
        move() { hit(950, 1.1, 0.07, 0.42); },
        capture() { hit(280, 0.65, 0.15, 0.65); hit(720, 1.4, 0.055, 0.30, 0.022); },
        select() { tone(1400, 'sine', 0.07, 0.055); },
        check() { tone(900, 'sine', 0.16, 0.22); tone(680, 'sine', 0.20, 0.17, 0.14); },
        castle() { hit(950, 1.1, 0.07, 0.38); hit(950, 1.1, 0.06, 0.38, 0.14); },
        win() { [0, 0.14, 0.28, 0.46].forEach((d, i) => tone([523, 659, 784, 1047][i], 'sine', 0.65, 0.18, d)); },
        lose() { [440, 370, 330, 262].forEach((f, i) => tone(f, 'sine', 0.72, 0.15, i * 0.17)); },
        stale() { tone(350, 'sine', 0.5, 0.14); },
        tick() { tone(1600, 'sine', 0.055, 0.07); }
    };
})();

// ---------- Chess engine ----------
function initBrd() {
    const b = Array(64).fill(null);
    ['R','N','B','Q','K','B','N','R'].forEach((p, c) => {
        b[ix(0, c)] = 'b' + p;
        b[ix(7, c)] = 'w' + p;
    });
    for (let c = 0; c < 8; c++) {
        b[ix(1, c)] = 'bP';
        b[ix(6, c)] = 'wP';
    }
    return b;
}

function getRaw(board, fi, cas, ep) {
    const p = board[fi]; if (!p) return [];
    const pc = cl(p), pt = tp(p), { r, c } = rc(fi), mv = [];
    function push(nr, nc, f = {}) {
        if (!inB(nr, nc)) return;
        const ti = ix(nr, nc), tg = board[ti];
        if (tg && cl(tg) === pc) return;
        mv.push({ from: fi, to: ti, ...f });
    }
    function slide(ds) {
        for (const [dr, dc] of ds) {
            let nr = r + dr, nc = c + dc;
            while (inB(nr, nc)) {
                const ti = ix(nr, nc), tg = board[ti];
                if (tg) { if (cl(tg) !== pc) mv.push({ from: fi, to: ti }); break; }
                mv.push({ from: fi, to: ti });
                nr += dr; nc += dc;
            }
        }
    }
    if (pt === 'P') {
        const dir = pc === 'w' ? -1 : 1, sr = pc === 'w' ? 6 : 1, pr = pc === 'w' ? 0 : 7;
        const fr = r + dir, fi2 = ix(fr, c);
        if (inB(fr, c) && !board[fi2]) {
            if (fr === pr) ['Q','R','B','N'].forEach(x => mv.push({ from: fi, to: fi2, promo: x }));
            else {
                mv.push({ from: fi, to: fi2 });
                if (r === sr && !board[ix(r + dir * 2, c)]) mv.push({ from: fi, to: ix(r + dir * 2, c), dp: true });
            }
        }
        for (const dc of [-1, 1]) {
            const nc = c + dc; if (!inB(fr, nc)) continue;
            const ti = ix(fr, nc);
            if (board[ti] && cl(board[ti]) !== pc) {
                if (fr === pr) ['Q','R','B','N'].forEach(x => mv.push({ from: fi, to: ti, promo: x }));
                else mv.push({ from: fi, to: ti });
            }
            if (ep === ti) mv.push({ from: fi, to: ti, ep: true });
        }
    }
    if (pt === 'N') [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => push(r+dr, c+dc));
    if (pt === 'B') slide([[-1,-1],[-1,1],[1,-1],[1,1]]);
    if (pt === 'R') slide([[-1,0],[1,0],[0,-1],[0,1]]);
    if (pt === 'Q') slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
    if (pt === 'K') {
        [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc]) => push(r+dr, c+dc));
        if (pc === 'w') {
            if (cas.wK && !board[ix(7,5)] && !board[ix(7,6)]) mv.push({ from: fi, to: ix(7,6), castle: 'K' });
            if (cas.wQ && !board[ix(7,3)] && !board[ix(7,2)] && !board[ix(7,1)]) mv.push({ from: fi, to: ix(7,2), castle: 'Q' });
        } else {
            if (cas.bK && !board[ix(0,5)] && !board[ix(0,6)]) mv.push({ from: fi, to: ix(0,6), castle: 'K' });
            if (cas.bQ && !board[ix(0,3)] && !board[ix(0,2)] && !board[ix(0,1)]) mv.push({ from: fi, to: ix(0,2), castle: 'Q' });
        }
    }
    return mv;
}

function atk(board, sq, by) {
    for (let i = 0; i < 64; i++) {
        const p = board[i]; if (!p || cl(p) !== by) continue;
        if (getRaw(board, i, { wK: false, wQ: false, bK: false, bQ: false }, null).some(m => m.to === sq)) return true;
    }
    return false;
}

function applyM(board, mv, cas, ep) {
    const b = [...board], p = b[mv.from], pc = cl(p);
    b[mv.to] = b[mv.from]; b[mv.from] = null;
    if (mv.promo) b[mv.to] = pc + mv.promo;
    if (mv.ep) { const { r, c } = rc(mv.to); b[ix(r + (pc === 'w' ? 1 : -1), c)] = null; }
    if (mv.castle) {
        if (pc === 'w') {
            if (mv.castle === 'K') { b[ix(7,5)] = b[ix(7,7)]; b[ix(7,7)] = null; }
            else { b[ix(7,3)] = b[ix(7,0)]; b[ix(7,0)] = null; }
        } else {
            if (mv.castle === 'K') { b[ix(0,5)] = b[ix(0,7)]; b[ix(0,7)] = null; }
            else { b[ix(0,3)] = b[ix(0,0)]; b[ix(0,0)] = null; }
        }
    }
    const nc = { ...cas };
    if (tp(p) === 'K') { if (pc === 'w') { nc.wK = false; nc.wQ = false; } else { nc.bK = false; nc.bQ = false; } }
    if (tp(p) === 'R') {
        const { c: fc } = rc(mv.from);
        if (pc === 'w') { if (fc === 7) nc.wK = false; if (fc === 0) nc.wQ = false; }
        else { if (fc === 7) nc.bK = false; if (fc === 0) nc.bQ = false; }
    }
    const nep = mv.dp ? ix(rc(mv.from).r + (pc === 'w' ? -1 : 1), rc(mv.from).c) : null;
    return { brd: b, cas: nc, ep: nep };
}

function legalM(board, fi, cas, ep) {
    const p = board[fi]; if (!p) return [];
    const pc = cl(p);
    return getRaw(board, fi, cas, ep).filter(m => {
        if (m.castle) {
            const ps = m.castle === 'K' ? ix(rc(m.from).r, 5) : ix(rc(m.from).r, 3);
            if (atk(board, m.from, op(pc)) || atk(board, ps, op(pc))) return false;
        }
        const { brd: nb } = applyM(board, m, cas, ep);
        const ki = nb.findIndex(s => s === pc + 'K');
        return !atk(nb, ki, op(pc));
    });
}

function allM(board, pc, cas, ep) {
    const a = [];
    for (let i = 0; i < 64; i++) if (board[i] && cl(board[i]) === pc) legalM(board, i, cas, ep).forEach(m => a.push(m));
    return a;
}

function inCk(board, pc) {
    const ki = board.findIndex(s => s === pc + 'K');
    return ki >= 0 && atk(board, ki, op(pc));
}

function algN(board, mv) {
    const p = board[mv.from], pt = tp(p), { r: fr, c: fc } = rc(mv.from), { r: tr, c: tc } = rc(mv.to);
    const cap = board[mv.to] || mv.ep;
    if (mv.castle === 'K') return 'O-O';
    if (mv.castle === 'Q') return 'O-O-O';
    let s = '';
    if (pt !== 'P') s += pt;
    else if (cap) s += FILES[fc];
    if (cap) s += 'x';
    s += FILES[tc] + (8 - tr);
    if (mv.promo) s += '=' + mv.promo;
    return s;
}

function evalBrdRaw(board) {
    let s = 0;
    for (let i = 0; i < 64; i++) {
        const p = board[i]; if (!p) continue;
        const pc = cl(p), pt2 = tp(p), pi = pc === 'w' ? i : 63 - i;
        s += pc === 'w' ? (PV[pt2] + (PST[pt2] ? PST[pt2][pi] : 0)) : -(PV[pt2] + (PST[pt2] ? PST[pt2][pi] : 0));
    }
    return s;
}

function evaluate(board, color) {
    const raw = evalBrdRaw(board);
    return color === 'w' ? raw : -raw;
}

function smv(board, m) {
    let s = 0;
    if (board[m.to]) s += PV[tp(board[m.to])] * 10 - PV[tp(board[m.from])];
    if (m.promo) s += PV[m.promo];
    if (m.castle) s += 50;
    return s;
}

function minimax(board, depth, alpha, beta, maximizing, color, cas, ep) {
    if (depth === 0) return evaluate(board, color);
    const currentColor = maximizing ? color : op(color);
    const moves = allM(board, currentColor, cas, ep);
    if (!moves.length) {
        if (inCk(board, currentColor)) return maximizing ? -99999 : 99999;
        return 0;
    }
    moves.sort((a, b) => smv(board, b) - smv(board, a));
    if (maximizing) {
        let best = -Infinity;
        for (const m of moves) {
            const { brd: nb, cas: nc, ep: ne } = applyM(board, m, cas, ep);
            best = Math.max(best, minimax(nb, depth - 1, alpha, beta, false, color, nc, ne));
            alpha = Math.max(alpha, best);
            if (beta <= alpha) break;
        }
        return best;
    } else {
        let best = Infinity;
        for (const m of moves) {
            const { brd: nb, cas: nc, ep: ne } = applyM(board, m, cas, ep);
            best = Math.min(best, minimax(nb, depth - 1, alpha, beta, true, color, nc, ne));
            beta = Math.min(beta, best);
            if (beta <= alpha) break;
        }
        return best;
    }
}

function getBestMove(board, cas, ep, depth, color) {
    const moves = allM(board, color, cas, ep);
    if (!moves.length) return null;
    moves.sort((a, b) => smv(board, b) - smv(board, a));
    let bestMove = null, bestVal = -Infinity;
    for (const m of moves) {
        const { brd: nb, cas: nc, ep: ne } = applyM(board, m, cas, ep);
        const val = minimax(nb, depth - 1, -Infinity, Infinity, false, color, nc, ne);
        if (val > bestVal) { bestVal = val; bestMove = m; }
    }
    return bestMove;
}

// ---------- Three.js rendering (all guarded) ----------
function ensureEngineReady() {
    if (!engineInitialized) { console.error('Game engine not initialized.'); return false; }
    if (!scene) { console.error('Scene not created.'); return false; }
    return true;
}

function buildBoard() {
    if (!ensureEngineReady()) return;
    const woodMat = new THREE.MeshPhongMaterial({ color: 0x4a2810, shininess: 20 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.6, 10.6), woodMat);
    frame.position.set(4, -0.3, 4); frame.receiveShadow = true; scene.add(frame);

    const legMat = new THREE.MeshPhongMaterial({ color: 0x3a1c05 });
    [[0.6,0.6],[7.4,0.6],[0.6,7.4],[7.4,7.4]].forEach(([x,z]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.28,0.8,10), legMat);
        leg.position.set(x, -0.8, z); leg.castShadow = true; scene.add(leg);
    });

    const goldMat = new THREE.MeshPhongMaterial({ color: 0xc9a84c, shininess: 90 });
    const border = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.025, 10.6), goldMat);
    border.position.set(4, 0.013, 4); scene.add(border);
    const innerMat = new THREE.MeshPhongMaterial({ color: 0x3a1a08 });
    const inner = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.02, 9.0), innerMat);
    inner.position.set(4, 0.016, 4); scene.add(inner);

    const LIGHT_COL = 0xeee8d5, DARK_COL = 0x2a2018;
    for (let i = 0; i < 64; i++) {
        const { r, c } = rc(i), isLight = (r + c) % 2 === 0, col = isLight ? LIGHT_COL : DARK_COL;
        SQ_BASE_COL[i] = col;
        const mat = new THREE.MeshPhongMaterial({ color: col, shininess: isLight ? 32 : 6 });
        const sq = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 1.0), mat);
        sq.position.set(c + 0.5, 0.06, r + 0.5); sq.receiveShadow = true;
        sq.userData = { t: 'sq', si: i }; scene.add(sq); SQ3D[i] = sq;
    }

    for (let c = 0; c < 8; c++) {
        mkLabel(FILES[c], c + 0.5, 0.06, -0.65);
        mkLabel(FILES[c], c + 0.5, 0.06, 8.65);
    }
    for (let r = 0; r < 8; r++) {
        mkLabel(String(8 - r), -0.65, 0.06, r + 0.5);
        mkLabel(String(8 - r), 8.65, 0.06, r + 0.5);
    }
}

function mkLabel(text, x, y, z) {
    if (!ensureEngineReady()) return;
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(201,168,76,1)'; ctx.font = 'bold 70px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 64, 64);
    const tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.renderOrder = 999; scene.add(m);
}

function pMat(isLight) {
    return new THREE.MeshPhongMaterial({ color: isLight ? 0xcc0000 : 0x1a0e06, specular: isLight ? 0xff6666 : 0x553311, shininess: isLight ? 110 : 55 });
}

function cyl(g, mat, rt, rb, h, x, y, z, s = 14) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); }
function sph(g, mat, r, x, y, z, ws = 16, hs = 12) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); }
function box(g, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); }
function con(g, mat, r, h, x, y, z, s = 10) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, s), mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); }
function tor(g, mat, r, t, x, y, z, rx = 0) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 24), mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); }
function base(g, mat) { cyl(g, mat, 0.42, 0.45, 0.08, 0, 0.04, 0, 16); cyl(g, mat, 0.19, 0.40, 0.15, 0, 0.14, 0, 16); }

const PIECE_BUILDERS = {
    P: w => { const g = new THREE.Group(), m = pMat(w); base(g, m); cyl(g, m, 0.11, 0.18, 0.34, 0, 0.36, 0, 12); sph(g, m, 0.23, 0, 0.72, 0); return g; },
    R: w => { const g = new THREE.Group(), m = pMat(w); base(g, m); cyl(g, m, 0.18, 0.18, 0.48, 0, 0.42, 0, 14); cyl(g, m, 0.28, 0.19, 0.07, 0, 0.68, 0, 14); cyl(g, m, 0.28, 0.28, 0.24, 0, 0.82, 0, 14); for(let i=0;i<4;i++){const a=(i/4)*Math.PI*2; box(g,m,0.13,0.22,0.13,Math.cos(a)*0.19,1.02,Math.sin(a)*0.19);} return g; },
    N: w => { const g = new THREE.Group(), m = pMat(w); base(g, m); cyl(g, m, 0.11, 0.16, 0.30, 0.05, 0.32, 0, 12); const hd = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.37, 0.35), m); hd.position.set(0.08, 0.64, 0); hd.rotation.z = -0.18; hd.castShadow = true; g.add(hd); const sn = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.14, 0.29), m); sn.position.set(0.22, 0.52, 0); sn.castShadow = true; g.add(sn); sph(g, m, 0.09, 0.05, 0.87, 0.10, 10, 8); sph(g, m, 0.09, 0.05, 0.87, -0.10, 10, 8); return g; },
    B: w => { const g = new THREE.Group(), m = pMat(w); base(g, m); cyl(g, m, 0.11, 0.16, 0.52, 0, 0.46, 0, 12); cyl(g, m, 0.17, 0.11, 0.06, 0, 0.73, 0, 12); con(g, m, 0.18, 0.38, 0, 0.96, 0, 10); sph(g, m, 0.08, 0, 1.17, 0, 8, 6); return g; },
    Q: w => { const g = new THREE.Group(), m = pMat(w); base(g, m); cyl(g, m, 0.12, 0.18, 0.56, 0, 0.48, 0, 14); cyl(g, m, 0.23, 0.13, 0.07, 0, 0.77, 0, 14); tor(g, m, 0.20, 0.045, 0, 0.82, 0, Math.PI/2); for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2; sph(g, m, 0.07, Math.cos(a)*0.19, 0.90, Math.sin(a)*0.19, 10, 8);} sph(g, m, 0.13, 0, 1.04, 0); return g; },
    K: w => { const g = new THREE.Group(), m = pMat(w); base(g, m); cyl(g, m, 0.12, 0.18, 0.58, 0, 0.50, 0, 14); cyl(g, m, 0.23, 0.13, 0.07, 0, 0.80, 0, 14); tor(g, m, 0.20, 0.045, 0, 0.85, 0, Math.PI/2); for(let i=0;i<4;i++){const a=(i/4)*Math.PI*2; con(g, m, 0.045, 0.19, Math.cos(a)*0.18, 0.98, Math.sin(a)*0.18, 7);} box(g, m, 0.09, 0.44, 0.09, 0, 1.17, 0); box(g, m, 0.30, 0.08, 0.09, 0, 1.23, 0); return g; }
};

function placePiece(si, ps) {
    if (!ensureEngineReady()) return;
    const { r, c } = rc(si), isW = cl(ps) === 'w';
    const g = PIECE_BUILDERS[tp(ps)](isW);
    g.position.set(c + 0.5, PY, r + 0.5);
    g.userData = { si, isPG: true };
    g.traverse(m => { if (m.isMesh) m.userData = { si, isPiece: true }; });
    scene.add(g); P3D[si] = g;
}

function removePiece(si) {
    if (!ensureEngineReady()) return;
    if (!P3D[si]) return;
    scene.remove(P3D[si]);
    P3D[si].traverse(m => { if (m.geometry) m.geometry.dispose(); });
    P3D[si] = null;
}

function syncAll(board) {
    if (!ensureEngineReady()) return;
    for (let i = 0; i < 64; i++) removePiece(i);
    board.forEach((p, i) => { if (p) placePiece(i, p); });
}

function clearDots() {
    if (!ensureEngineReady()) return;
    DOTS.forEach(d => { scene.remove(d); if (d.geometry) d.geometry.dispose(); });
    DOTS.length = 0;
}

function clearTints() {
    if (!ensureEngineReady()) return;
    TINTED.forEach(({ si, oc }) => { if (SQ3D[si]) SQ3D[si].material.color.setHex(oc); });
    TINTED = [];
}

function tintSq(si, hex, blend) {
    if (!ensureEngineReady()) return;
    if (!SQ3D[si]) return;
    const orig = SQ_BASE_COL[si];
    SQ3D[si].material.color.copy(new THREE.Color(orig).lerp(new THREE.Color(hex), blend));
    TINTED.push({ si, oc: orig });
}

function showDots(mvs, board) {
    if (!ensureEngineReady()) return;
    clearDots();
    mvs.forEach(mv => {
        const { r, c } = rc(mv.to), isCap = !!(board[mv.to] || mv.ep);
        if (isCap) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.055, 8, 26), new THREE.MeshBasicMaterial({ color: 0xc9a84c, transparent: true, opacity: 0.7 }));
            ring.rotation.x = Math.PI / 2; ring.position.set(c + 0.5, 0.135, r + 0.5);
            ring.userData = { t: 'sq', si: mv.to }; scene.add(ring); DOTS.push(ring);
        } else {
            const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.016, 18), new THREE.MeshBasicMaterial({ color: 0xc9a84c, transparent: true, opacity: 0.75 }));
            dot.position.set(c + 0.5, 0.128, r + 0.5);
            dot.userData = { t: 'sq', si: mv.to }; scene.add(dot); DOTS.push(dot);
        }
    });
}

function updHL() {
    if (!ensureEngineReady()) return;
    clearTints(); clearDots();
    if (lastMv) { tintSq(lastMv.from, 0xc9a84c, 0.30); tintSq(lastMv.to, 0xc9a84c, 0.30); }
    if (inCk(brd, turn)) { const ki = brd.findIndex(s => s === turn + 'K'); if (ki >= 0) tintSq(ki, 0xff2020, 0.65); }
    if (selSq !== null) { tintSq(selSq, 0xc9a84c, 0.62); showDots(curLM, brd); }
}

function startAnim(g, tr, tc, onDone, dur = 0.32) {
    animQ = { g, from: g.position.clone(), to: new THREE.Vector3(tc + 0.5, PY, tr + 0.5), t0: CLK.getElapsedTime(), dur, onDone };
}

function tickAnim() {
    if (!animQ) return;
    const el = CLK.getElapsedTime() - animQ.t0, t = Math.min(el / animQ.dur, 1);
    const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    animQ.g.position.x = animQ.from.x + (animQ.to.x - animQ.from.x) * e;
    animQ.g.position.z = animQ.from.z + (animQ.to.z - animQ.from.z) * e;
    animQ.g.position.y = PY + Math.sin(t * Math.PI) * 1.6;
    if (t >= 1) {
        animQ.g.position.copy(animQ.to);
        animQ.g.position.y = PY;
        const d = animQ.onDone; animQ = null;
        if (d) d();
    }
}

// ---------- Move execution ----------
function execMove(mv) {
    if (!ensureEngineReady()) return;
    if (isAnim || over || frozen) return;
    const wt = turn, capP = brd[mv.to], { r: tr, c: tc } = rc(mv.to);
    hist.push({
        brd: [...brd], turn, cas: { ...cas }, ep,
        capW: [...capW], capB: [...capB],
        mlog: mlog.map(e => ({ ...e }))
    });
    const an = algN(brd, mv);
    if (capP) (wt === 'w' ? capW : capB).push(capP);
    if (mv.ep) {
        const { r, c } = rc(mv.to), e2 = brd[ix(r + (wt === 'w' ? 1 : -1), c)];
        if (e2) (wt === 'w' ? capW : capB).push(e2);
    }
    const { brd: nb, cas: nc, ep: ne } = applyM(brd, mv, cas, ep);
    brd = nb; cas = nc; ep = ne;

    if (wt === 'w') mlog.push({ w: an, b: '' });
    else {
        if (!mlog.length) mlog.push({ w: '', b: '' });
        mlog[mlog.length - 1].b = an;
    }
    turn = op(wt); lastMv = mv; selSq = null; curLM = [];
    timerW = 60; timerB = 60; timerActive = true; lastTick = performance.now();

    let pg = P3D[mv.from];
    if (capP) removePiece(mv.to);
    if (mv.ep) { const { r, c } = rc(mv.to); removePiece(ix(r + (wt === 'w' ? 1 : -1), c)); }
    if (mv.promo) {
        scene.remove(pg); pg.traverse(m => { if (m.geometry) m.geometry.dispose(); });
        pg = PIECE_BUILDERS[mv.promo](wt === 'w');
        pg.position.set(rc(mv.from).c + 0.5, PY, rc(mv.from).r + 0.5);
        pg.userData = { si: mv.to, isPG: true };
        pg.traverse(m => { if (m.isMesh) m.userData = { si: mv.to, isPiece: true }; });
        scene.add(pg);
    }
    P3D[mv.from] = null; P3D[mv.to] = pg;
    pg.userData.si = mv.to;
    pg.traverse(m => { if (m.isMesh) m.userData.si = mv.to; });

    if (mv.castle) {
        let rf, rt2;
        if (wt === 'w') {
            if (mv.castle === 'K') { rf = ix(7, 7); rt2 = ix(7, 5); }
            else { rf = ix(7, 0); rt2 = ix(7, 3); }
        } else {
            if (mv.castle === 'K') { rf = ix(0, 7); rt2 = ix(0, 5); }
            else { rf = ix(0, 0); rt2 = ix(0, 3); }
        }
        const rg = P3D[rf];
        if (rg) {
            const { r: rr, c: rc2 } = rc(rt2);
            rg.position.set(rc2 + 0.5, PY, rr + 0.5);
            P3D[rt2] = rg; P3D[rf] = null;
            rg.userData.si = rt2;
            rg.traverse(m => { if (m.isMesh) m.userData.si = rt2; });
        }
    }

    if (capP || mv.ep) SFX.capture();
    else if (mv.castle) SFX.castle();
    else SFX.move();

    isAnim = true;
    updHL();
    startAnim(pg, tr, tc, () => {
        isAnim = false;
        updHL();
        const am2 = allM(brd, turn, cas, ep);
        if (!am2.length) {
            const ck = inCk(brd, turn), winner = turn === 'w' ? 'Black' : 'Red';
            endGame(ck ? winner + ' Wins' : 'Stalemate', ck ? 'Checkmate' : 'Draw — no legal moves',
                ck ? (turn === playerColor ? SFX.lose : SFX.win) : SFX.stale);
            return;
        }
        if (inCk(brd, turn)) SFX.check();
        if (moveExecutedCallback) moveExecutedCallback(mv);
        if (gameMode === 'ai' && turn === (playerColor === 'w' ? 'b' : 'w') && !over) scheduleAI(100);
    });
}

function endGame(title, subtitle, sfx) {
    over = true; timerActive = false; aiThink = false;
    gameOverInfo = { title, subtitle, sfx };
}

// ---------- Timer ----------
function tickTimer() {
    if (!timerActive || over || isAnim || frozen) return;
    const now = performance.now();
    if (lastTick === null) { lastTick = now; return; }
    const dt = (now - lastTick) / 1000; lastTick = now;
    if (turn === 'w') {
        timerW = Math.max(0, timerW - dt);
        if (timerW <= 0) { timeOut('w'); return; }
    } else {
        timerB = Math.max(0, timerB - dt);
        if (timerB <= 0) { timeOut('b'); return; }
    }
}

function timeOut(loser) {
    if (gameMode === 'online') {
        turn = op(loser); timerW = 60; timerB = 60;
        selSq = null; curLM = []; updHL();
    } else {
        turn = op(loser); timerW = 60; timerB = 60; timerActive = true; lastTick = performance.now();
        selSq = null; curLM = []; updHL();
        if (gameMode === 'ai' && turn === (playerColor === 'w' ? 'b' : 'w')) scheduleAI(300);
    }
}

// ---------- AI scheduling ----------
function scheduleAI(delay = 80) {
    if (over || aiThink || gameMode !== 'ai' || turn === playerColor) return;
    aiThink = true;
    setTimeout(() => {
        if (over || !aiThink || gameMode !== 'ai') { aiThink = false; return; }
        const mv = getBestMove(brd, cas, ep, aiDepth, turn);
        aiThink = false;
        if (mv) execMove(mv);
        else {
            const ck = inCk(brd, turn), winner = turn === 'w' ? 'Black' : 'Red';
            endGame(ck ? winner + ' Wins' : 'Stalemate', ck ? 'Checkmate' : 'Draw — no legal moves',
                ck ? (turn === playerColor ? SFX.lose : SFX.win) : SFX.stale);
        }
    }, delay);
}

// ---------- Promotion ----------
function requestPromotion(mv) {
    promotionPending = true;
    pendingPromotionMove = mv;
}

export function completePromotion(piece) {
    if (!promotionPending) return;
    promotionPending = false;
    const mv = { ...pendingPromotionMove, promo: piece };
    pendingPromotionMove = null;
    execMove(mv);
}

// ---------- Public API ----------
export function initEngine(canvas, moveCallback) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0806);

    camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
    updateCamera();
    scene.add(new THREE.AmbientLight(0xfff8f0, 0.8));

    const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.2);
    keyLight.position.set(4, 16, 10); keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048); keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 40; keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10; keyLight.shadow.camera.top = 10; keyLight.shadow.camera.bottom = -10;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd0e8ff, 0.5);
    fillLight.position.set(-4, 10, -4); scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xc9a84c, 0.28);
    rimLight.position.set(8, 4, 0); scene.add(rimLight);

    window.addEventListener('resize', onResize);

    setupInputHandlers(canvas);
    moveExecutedCallback = moveCallback;
    boardBuilt = false;
    resetState();
    engineInitialized = true;
    startAnimationLoop();
}

function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}

function updateCamera() {
    if (!camera) return;
    const x = BOARD_CENTER.x + camDist * Math.sin(camPhi) * Math.sin(camTheta);
    const y = BOARD_CENTER.y + camDist * Math.cos(camPhi);
    const z = BOARD_CENTER.z + camDist * Math.sin(camPhi) * Math.cos(camTheta);
    camera.position.set(x, y, z);
    camera.lookAt(BOARD_CENTER);
}

function setupInputHandlers(canvas) {
    const ray = new THREE.Raycaster(), mp2 = new THREE.Vector2();
    let drag = false, prevX = 0, prevY = 0, dragDist = 0, touchStart = null, touchDrag = 0, pinchStart = 0;

    function pickAt(cx, cy) {
        const rect = canvas.getBoundingClientRect();
        mp2.x = ((cx - rect.left) / rect.width) * 2 - 1;
        mp2.y = -((cy - rect.top) / rect.height) * 2 + 1;
        ray.setFromCamera(mp2, camera);
        const flatObjs = [...SQ3D.filter(Boolean), ...DOTS];
        const flatHits = ray.intersectObjects(flatObjs, false);
        if (flatHits.length) {
            const si = flatHits[0].object.userData.si;
            if (si != null) { onSq(si); return; }
        }
        const pMeshes = [];
        P3D.forEach(g => { if (g) g.traverse(m => { if (m.isMesh) pMeshes.push(m); }); });
        const pHits = ray.intersectObjects(pMeshes, false);
        if (pHits.length) {
            const si = pHits[0].object.userData.si;
            if (si != null) onSq(si);
        }
    }

    canvas.addEventListener('mousedown', e => { drag = true; prevX = e.clientX; prevY = e.clientY; dragDist = 0; });
    window.addEventListener('mousemove', e => {
        if (!drag) return;
        const dx = e.clientX - prevX, dy = e.clientY - prevY;
        dragDist += Math.abs(dx) + Math.abs(dy);
        if (e.buttons === 1) { camTheta -= dx * 0.009; camPhi = Math.max(0.15, Math.min(1.30, camPhi + dy * 0.009)); }
        prevX = e.clientX; prevY = e.clientY; updateCamera();
    });
    window.addEventListener('mouseup', e => {
        if (drag && dragDist < 7 && e.button === 0) pickAt(e.clientX, e.clientY);
        drag = false;
    });
    canvas.addEventListener('wheel', e => { camDist = Math.max(7, Math.min(28, camDist + e.deltaY * 0.02)); updateCamera(); }, { passive: true });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        if (e.touches.length === 1) { const t = e.touches[0]; touchStart = { x: t.clientX, y: t.clientY }; touchDrag = 0; }
        else if (e.touches.length === 2) { pinchStart = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY); }
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        if (e.touches.length === 1 && touchStart) {
            const t = e.touches[0], dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
            touchDrag += Math.abs(dx) + Math.abs(dy);
            camTheta -= dx * 0.009; camPhi = Math.max(0.15, Math.min(1.30, camPhi + dy * 0.009));
            touchStart = { x: t.clientX, y: t.clientY }; updateCamera();
        } else if (e.touches.length === 2) {
            const d = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
            camDist = Math.max(7, Math.min(28, camDist - (d - pinchStart) * 0.05)); updateCamera();
        }
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
        e.preventDefault();
        if (e.changedTouches.length === 1 && touchStart && touchDrag < 14) pickAt(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        touchStart = null; touchDrag = 0;
    }, { passive: false });
}

export function startGame(mode) {
    if (!ensureEngineReady()) return;
    gameMode = mode;
    resetState();
    if (!boardBuilt) {
        buildBoard();
        boardBuilt = true;
    }
    syncAll(brd);
    clearDots(); clearTints();
    updHL();
    timerActive = true;
    lastTick = performance.now();
    if (mode === 'ai' && playerColor === 'b') {
        scheduleAI(500);
    }
}

export function newGame() {
    if (!ensureEngineReady()) return;
    resetState();
    syncAll(brd);
    clearDots(); clearTints();
    updHL();
    timerActive = true;
    lastTick = performance.now();
    if (gameMode === 'ai' && playerColor === 'b') {
        scheduleAI(500);
    }
}

export function undoMove() {
    if (!ensureEngineReady()) return;
    if (isAnim || aiThink || !hist.length) return;
    aiThink = false;
    const steps = (gameMode === 'ai' && hist.length >= 2) ? 2 : 1;
    for (let i = 0; i < steps; i++) {
        if (!hist.length) break;
        const s = hist.pop();
        brd = s.brd; turn = s.turn; cas = s.cas; ep = s.ep;
        capW = s.capW; capB = s.capB; mlog = s.mlog;
    }
    timerW = 60; timerB = 60;
    timerActive = hist.length > 0;
    lastTick = timerActive ? performance.now() : null;
    lastMv = null; selSq = null; curLM = []; over = false;
    syncAll(brd); updHL();
    if (gameMode === 'ai' && turn === (playerColor === 'w' ? 'b' : 'w') && !over && hist.length > 0) {
        timerActive = true; lastTick = performance.now(); scheduleAI(400);
    }
}

export function onSq(si) {
    if (over || isAnim || aiThink || frozen) return;
    if (gameMode === 'online' && turn !== myColor) return;
    SFX.select();
    const p = brd[si];
    if (p && cl(p) === turn) { selSq = si; curLM = legalM(brd, si, cas, ep); updHL(); return; }
    if (selSq !== null) {
        curLM = curLM || [];
        const mv = curLM.find(m => m.to === si);
        if (mv) {
            if (mv.promo) { requestPromotion(mv); return; }
            execMove(mv);
            return;
        }
    }
    selSq = null; curLM = []; updHL();
}

export function setMoveCallback(cb) { moveExecutedCallback = cb; }
export function setFrameCallback(cb) { frameCallback = cb; }

export function setPlayerColor(color) { playerColor = color; }
export function setMyColor(color) { myColor = color; }
export function setAiDepth(depth) { aiDepth = depth; selDiff = depth; }
export function setGameMode(mode) { gameMode = mode; }

// Frozen state for online
export function setFrozen(val) {
    frozen = val;
    if (val) {
        timerActive = false;
    } else {
        timerActive = true;
        lastTick = performance.now();
    }
}

export function getTurn() { return turn; }
export function getBoardArray() { return brd; }
export function getCastling() { return cas; }
export function getEnPassant() { return ep; }
export function getTimerW() { return timerW; }
export function getTimerB() { return timerB; }
export function getOver() { return over; }
export function getGameMode() { return gameMode; }
export function getPlayerColor() { return playerColor; }
export function getMyColor() { return myColor; }
export function isAiThinking() { return aiThink; }
export function isPromotionPending() { return promotionPending; }
export function getGameOverInfo() { const info = gameOverInfo; gameOverInfo = null; return info; }

export function syncBoardFromServer(newBoard, newTurn, newCas, newEp, tW, tB) {
    if (!ensureEngineReady()) return;
    if (!boardBuilt) {
        buildBoard();
        boardBuilt = true;
    }
    brd = newBoard; turn = newTurn; cas = newCas; ep = newEp;
    timerW = tW; timerB = tB;
    timerActive = true; lastTick = performance.now();
    syncAll(brd); updHL();
}

export function getBackupData() {
    return { brd: [...brd], turn, cas: { ...cas }, ep, hist: hist.map(h => ({
        brd: h.brd.slice(), turn: h.turn, cas: { ...h.cas }, ep: h.ep,
        capW: h.capW.slice(), capB: h.capB.slice(),
        mlog: h.mlog.map(m => ({ ...m }))
    })), capW: capW.slice(), capB: capB.slice(), mlog: mlog.map(m => ({ ...m })), timerW, timerB, playerColor, aiDepth };
}

export function restoreBackup(data) {
    if (!ensureEngineReady()) return;
    if (!boardBuilt) {
        buildBoard();
        boardBuilt = true;
    }
    brd = data.brd; turn = data.turn; cas = data.cas; ep = data.ep;
    hist = data.hist; capW = data.capW; capB = data.capB; mlog = data.mlog;
    timerW = data.timerW; timerB = data.timerB;
    playerColor = data.playerColor; aiDepth = data.aiDepth; selDiff = aiDepth;
    syncAll(brd); updHL();
    timerActive = true; lastTick = performance.now();
}

export function resetState() {
    brd = initBrd(); turn = 'w'; cas = { wK: true, wQ: true, bK: true, bQ: true }; ep = null;
    hist = []; capW = []; capB = []; mlog = [];
    selSq = null; curLM = []; lastMv = null; over = false; pendP = null; isAnim = false; aiThink = false; frozen = false;
    timerW = 60; timerB = 60; timerActive = false; lastTick = null;
    gameOverInfo = null; promotionPending = false; pendingPromotionMove = null;
}

export function resetTimers() { timerW = 60; timerB = 60; timerActive = true; lastTick = performance.now(); }

export function rotateForPlayer(color) {
    camTheta = (color === 'b') ? Math.PI : 0;
    updateCamera();
}

export function startAnimationLoop() {
    if (!engineInitialized) {
        console.error('Cannot start animation loop – engine not initialized.');
        return;
    }
    function animate() {
        requestAnimationFrame(animate);
        tickAnim();
        tickTimer();
        if (frameCallback) {
            const inCheck = inCk(brd, turn);
            frameCallback({
                turn, timerW, timerB, timerActive,
                aiThink, inCheck, over,
                promotionPending
            });
        }
        renderer.render(scene, camera);
    }
    animate();
}

export { scheduleAI };