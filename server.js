const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const readline = require('readline');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const PORT = 3000;
const JWT_SECRET = 'your-secret-key-change-in-production';
const DB_FILE = 'db.sqlite';
const PUBLIC_DIR = path.join(__dirname, 'public');

let paused = false;

// ── Database ──────────────────────────────────────────────────────────────────
const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS T_Animais (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Nome TEXT NOT NULL, Data_Nascimento TEXT, Tipo TEXT,
    Raca TEXT, Localizacao TEXT, Descricao TEXT, Imagem TEXT)`);

  db.run(`CREATE TABLE IF NOT EXISTS T_Clientes (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Nome TEXT NOT NULL, Data_Nascimento TEXT, Morada TEXT,
    Email TEXT UNIQUE, Password TEXT NOT NULL, Role TEXT DEFAULT 'user')`);

  // Add Role column if missing
  db.all("PRAGMA table_info(T_Clientes)", (_, cols) => {
    if (cols && !cols.find(c => c.name === 'Role'))
      db.run("ALTER TABLE T_Clientes ADD COLUMN Role TEXT DEFAULT 'user'");
  });
});

const dbGet  = (sql, p=[]) => new Promise((res,rej) => db.get(sql,p,(e,r)=>e?rej(e):res(r)));
const dbAll  = (sql, p=[]) => new Promise((res,rej) => db.all(sql,p,(e,r)=>e?rej(e):res(r)));
const dbRun  = (sql, p=[]) => new Promise((res,rej) => db.run(sql,p,function(e){e?rej(e):res(this)}));

// ── Auth helpers ──────────────────────────────────────────────────────────────
function verifyToken(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

function requireAuth(req, res) {
  const user = verifyToken(req);
  if (!user) { json(res, 401, { error: 'Unauthorized' }); return null; }
  return user;
}

function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin') { json(res, 403, { error: 'Forbidden' }); return null; }
  return user;
}

// ── Response helpers ──────────────────────────────────────────────────────────
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders() });
  res.end(JSON.stringify(data));
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };
}

function body(req) {
  return new Promise((res, rej) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { res(JSON.parse(d||'{}')); } catch { res({}); } });
    req.on('error', rej);
  });
}

// ── Static files ──────────────────────────────────────────────────────────────
const MIME = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript',
               '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon' };

function serveStatic(req, res) {
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain', ...corsHeaders() });
    res.end(data);
  });
}

// ── API Routes ────────────────────────────────────────────────────────────────
async function handleAPI(req, res, pathname, method) {
  // Login
  if (pathname === '/api/login' && method === 'POST') {
    const { email, password } = await body(req);
    const user = await dbGet('SELECT * FROM T_Clientes WHERE Email=?', [email]);
    if (!user || !(await bcrypt.compare(password, user.Password)))
      return json(res, 401, { error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.ID, email: user.Email, role: user.Role }, JWT_SECRET, { expiresIn: '24h' });
    return json(res, 200, { token, user: { id: user.ID, nome: user.Nome, email: user.Email, role: user.Role } });
  }

  // Register
  if (pathname === '/api/clientes' && method === 'POST') {
    const { nome, email, password, data_nascimento, morada } = await body(req);
    if (!nome || !email || !password) return json(res, 400, { error: 'Missing fields' });
    const hash = await bcrypt.hash(password, 10);
    try {
      const r = await dbRun('INSERT INTO T_Clientes (Nome,Email,Password,Data_Nascimento,Morada,Role) VALUES (?,?,?,?,?,?)',
        [nome, email, hash, data_nascimento||null, morada||null, 'user']);
      return json(res, 201, { id: r.lastID });
    } catch (e) {
      return json(res, 400, { error: 'Email already exists' });
    }
  }

  // GET animals (public)
  if (pathname === '/api/animais' && method === 'GET') {
    const animals = await dbAll('SELECT * FROM T_Animais');
    return json(res, 200, animals);
  }

  // GET animal by ID (public)
  const animalMatch = pathname.match(/^\/api\/animais\/(\d+)$/);
  if (animalMatch && method === 'GET') {
    const animal = await dbGet('SELECT * FROM T_Animais WHERE ID=?', [animalMatch[1]]);
    if (!animal) return json(res, 404, { error: 'Not found' });
    return json(res, 200, animal);
  }

  // POST animal (auth)
  if (pathname === '/api/animais' && method === 'POST') {
    if (!requireAuth(req, res)) return;
    const { nome, data_nascimento, tipo, raca, localizacao, descricao, imagem } = await body(req);
    if (!nome) return json(res, 400, { error: 'Nome required' });
    const r = await dbRun('INSERT INTO T_Animais (Nome,Data_Nascimento,Tipo,Raca,Localizacao,Descricao,Imagem) VALUES (?,?,?,?,?,?,?)',
      [nome, data_nascimento||null, tipo||null, raca||null, localizacao||null, descricao||null, imagem||null]);
    return json(res, 201, { id: r.lastID });
  }

  // PUT animal (admin)
  if (animalMatch && method === 'PUT') {
    if (!requireAdmin(req, res)) return;
    const { nome, data_nascimento, tipo, raca, localizacao, descricao, imagem } = await body(req);
    await dbRun('UPDATE T_Animais SET Nome=?,Data_Nascimento=?,Tipo=?,Raca=?,Localizacao=?,Descricao=?,Imagem=? WHERE ID=?',
      [nome, data_nascimento, tipo, raca, localizacao, descricao, imagem, animalMatch[1]]);
    return json(res, 200, { success: true });
  }

  // DELETE animal (admin)
  if (animalMatch && method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    await dbRun('DELETE FROM T_Animais WHERE ID=?', [animalMatch[1]]);
    return json(res, 200, { success: true });
  }

  json(res, 404, { error: 'Not found' });
}

// ── Server ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (paused) { res.writeHead(503); res.end('Server paused'); return; }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders()); res.end(); return;
  }

  const { pathname } = url.parse(req.url);

  try {
    if (pathname.startsWith('/api/')) {
      await handleAPI(req, res, pathname, req.method);
    } else {
      serveStatic(req, res);
    }
  } catch (e) {
    console.error(e);
    json(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

// ── CLI ───────────────────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', async (line) => {
  const cmd = line.trim().toLowerCase();
  switch (cmd) {
    case 'stop':
      console.log('Shutting down...');
      server.close(() => { db.close(); rl.close(); process.exit(0); });
      break;
    case 'pause':
      paused = true; console.log('Server paused.'); break;
    case 'resume':
      paused = false; console.log('Server resumed.'); break;
    case 'display':
      const animals = await dbAll('SELECT * FROM T_Animais');
      const clients = await dbAll('SELECT ID,Nome,Email,Role FROM T_Clientes');
      console.log('=== T_Animais ==='); console.table(animals);
      console.log('=== T_Clientes ==='); console.table(clients);
      break;
    case 'clear':
      rl.question('Delete all rows? (yes/no): ', async (ans) => {
        if (ans.toLowerCase() === 'yes') {
          await dbRun('DELETE FROM T_Animais');
          await dbRun('DELETE FROM T_Clientes');
          console.log('All rows deleted.');
        } else console.log('Cancelled.');
      });
      break;
    case 'populate':
      const samples = [
        ['Rex',   '2020-03-15','Cão','Labrador','Lisboa','Friendly dog','https://images.unsplash.com/photo-1552053831-71594a27632d?w=400'],
        ['Mia',   '2021-06-01','Gato','Siamês','Porto','Calm cat','https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400'],
        ['Luna',  '2019-11-20','Gato','Persa','Braga','Fluffy and cute','https://images.unsplash.com/photo-1495360010541-f48722b34f7d?w=400'],
        ['Simba', '2022-01-10','Cão','Golden Retriever','Faro','Loves to play','https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400'],
        ['Bella', '2020-08-05','Outro','Coelho','Coimbra','Quiet and sweet','https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=400'],
      ];
      for (const s of samples)
        await dbRun('INSERT INTO T_Animais (Nome,Data_Nascimento,Tipo,Raca,Localizacao,Descricao,Imagem) VALUES (?,?,?,?,?,?,?)', s);
      console.log('5 animals inserted.');
      break;
    case 'help':
      console.log('Commands: stop | pause | resume | display | clear | populate | help');
      break;
    default:
      console.log('Unknown command. Type "help".');
  }
});
