const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const PF = path.join(process.env.DATA_DIR || __dirname, 'placar.json');
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png' };

let placar = {};
try { placar = JSON.parse(fs.readFileSync(PF, 'utf8')); } catch (e) {}
const save = () => { try { fs.writeFileSync(PF, JSON.stringify(placar)); } catch (e) {} };
const top = () => Object.values(placar).sort((a, b) => b.w - a.w).slice(0, 8);

const srv = http.createServer((q, s) => {
  let f = decodeURIComponent(q.url.split('?')[0]);
  if (f === '/') f = '/index.html';
  const p = path.join(PUB, path.normalize(f));
  if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('404'); }
  s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(s);
});
const wss = new WebSocketServer({ server: srv });

const rooms = {};
const find = id => Object.values(rooms).find(R => R.ps.some(p => p.id === id));
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join(''); } while (rooms[c]); return c; };
const out = (p, o) => { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(o)); };
const err = (ws, m) => ws.send(JSON.stringify({ t: 'err', m }));

function view(R, id) {
  const n = R.ps.length;
  return {
    code: R.code, ph: R.ph, r: R.r, me: R.ps.findIndex(p => p.id === id), host: R.host === id,
    ps: R.ps.map(p => ({ n: p.name, s: p.s, on: p.on, w: p.wins, uf: p.uf, ci: p.ci, cel: R.host === id ? p.cel : '' })),
    done: R.ps.map(p => R.ch[p.id] !== undefined), mine: R.ch[id], gs: R.gs,
    turn: (R.first + R.t) % n, res: R.res, plc: top()
  };
}
function push(R) { R.at = Date.now(); R.ps.forEach(p => out(p, { t: 'v', v: view(R, p.id) })); }

function clean(pf) {
  if (!pf || typeof pf.name !== 'string') return null;
  const name = pf.name.trim().split(/\s+/)[0].slice(0, 20);
  if (!name) return null;
  const s = (v, n) => String(v || '').slice(0, n);
  return { name, cel: s(pf.cel, 20), uf: s(pf.uf, 2), ci: s(pf.ci, 40) };
}
function leave(id) {
  const R = find(id); if (!R) return;
  if (R.ph === 'lobby') {
    R.ps = R.ps.filter(p => p.id !== id);
    if (!R.ps.length) { delete rooms[R.code]; return; }
    if (R.host === id) R.host = R.ps[0].id;
    push(R);
  } else {
    R.ps.filter(p => p.id !== id).forEach(p => out(p, { t: 'none', m: 'Alguém saiu e a partida foi encerrada.', p: top() }));
    delete rooms[R.code];
  }
}
function begin(R) { R.ph = 'choose'; R.ch = {}; R.gs = {}; R.t = 0; R.res = null; }
function reveal(R) {
  const ch = R.ps.map(p => R.ch[p.id]), tot = ch.reduce((a, b) => a + b, 0), w = R.gs[tot];
  R.res = { tot, ch, w: w === undefined ? null : w, gs: R.gs };
  R.ph = 'reveal';
  if (w !== undefined) {
    const p = R.ps[w]; p.s--;
    if (p.s === 0) {
      R.ph = 'end'; p.wins++;
      const k = p.name.toLowerCase();
      placar[k] = placar[k] || { n: p.name, w: 0 }; placar[k].w++; save();
    }
  }
}

function handle(ws, m) {
  const id = m.id; let R = find(id);
  if (m.t === 'hello') {
    if (R) { const p = R.ps.find(p => p.id === id); p.ws = ws; p.on = true; push(R); }
    else ws.send(JSON.stringify({ t: 'none', p: top() }));
    return;
  }
  if (m.t === 'leave') { leave(id); ws.send(JSON.stringify({ t: 'none', p: top() })); return; }
  if (m.t === 'create' || m.t === 'join') {
    const pr = clean(m.pf); if (!pr) return err(ws, 'Preencha seu nome.');
    if (m.t === 'join') {
      const T = rooms[String(m.code || '').toUpperCase().trim()];
      if (!T) return err(ws, 'Sala não encontrada.');
      if (T.ph !== 'lobby') return err(ws, 'A partida já começou.');
      if (T.ps.length >= 4) return err(ws, 'Sala cheia (máximo 4).');
    }
    if (R) leave(id);
    if (m.t === 'create') {
      const c = newCode();
      R = rooms[c] = { code: c, ps: [], host: id, ph: 'lobby', r: 1, ch: {}, gs: {}, t: 0, first: 0, res: null, at: Date.now() };
    } else R = rooms[String(m.code).toUpperCase().trim()];
    R.ps.push({ id, ...pr, s: 3, wins: 0, ws, on: true });
    return push(R);
  }
  if (!R) return;
  const n = R.ps.length, i = R.ps.findIndex(p => p.id === id), host = R.host === id;
  const num = Number.isInteger(m.n) ? m.n : -1;
  const sum = R.ps.reduce((a, p) => a + p.s, 0);
  if (m.t === 'start' && host && R.ph === 'lobby' && n >= 2) { R.ps.forEach(p => p.s = 3); R.r = 1; begin(R); }
  else if (m.t === 'choose' && R.ph === 'choose' && num >= 0 && num <= R.ps[i].s && R.ch[id] === undefined) {
    R.ch[id] = num;
    if (R.ps.every(p => R.ch[p.id] !== undefined)) { R.ph = 'guess'; R.t = 0; R.first = (R.r - 1) % n; }
  } else if (m.t === 'guess' && R.ph === 'guess' && (R.first + R.t) % n === i && num >= 0 && num <= sum && R.gs[num] === undefined) {
    R.gs[num] = i; R.t++;
    if (R.t === n) reveal(R);
  } else if (m.t === 'next' && host && R.ph === 'reveal') { R.r++; begin(R); }
  else if (m.t === 'again' && host && R.ph === 'end') { R.ps.forEach(p => p.s = 3); R.r = 1; begin(R); }
  else return;
  push(R);
}

wss.on('connection', ws => {
  ws.alive = true; ws.on('pong', () => ws.alive = true);
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.id !== 'string' || m.id.length > 40) return;
    ws.pid = m.id; handle(ws, m);
  });
  ws.on('close', () => {
    const R = find(ws.pid); if (!R) return;
    const p = R.ps.find(p => p.id === ws.pid);
    if (p && p.ws === ws) { p.on = false; push(R); }
  });
});
setInterval(() => wss.clients.forEach(ws => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); }), 30000);
setInterval(() => { for (const c in rooms) if (Date.now() - rooms[c].at > 3 * 3600e3) delete rooms[c]; }, 600000);
srv.listen(PORT, () => console.log('Porrinha Digital na porta ' + PORT));
