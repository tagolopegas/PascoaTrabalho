// ── Storage ───────────────────────────────────────────────────────────────────
const getToken = () => localStorage.getItem('token');
const getUser  = () => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } };
const isLoggedIn = () => !!getToken();
const isAdmin = () => { const u = getUser(); return u && u.role === 'admin'; };
const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); location.href = 'index.html'; };

// ── API ───────────────────────────────────────────────────────────────────────
const API = 'http://localhost:3000';
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
}
async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, opts);
  if (res.status === 401) { logout(); return null; }
  return res;
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function buildNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const user = getUser();
  let html = `<a href="index.html" class="brand">🐾 PetApp</a>
    <a href="index.html">Início</a>
    <a href="about.html">Sobre</a>`;
  if (isLoggedIn()) {
    html += `<a href="create-listing.html" class="btn">+ Adicionar</a>`;
    if (isAdmin()) html += `<a href="admin.html">Admin</a>`;
    html += `<a href="#" onclick="logout()">Sair (${user.nome})</a>`;
  } else {
    html += `<a href="login.html">Login</a><a href="register.html">Registar</a>`;
  }
  nav.innerHTML = html;
}

// ── Page init ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildNav();
  const page = location.pathname.split('/').pop() || 'index.html';
  if (page === 'index.html' || page === '') initHome();
  else if (page === 'animal-detail.html') initDetail();
  else if (page === 'login.html') initLogin();
  else if (page === 'register.html') initRegister();
  else if (page === 'create-listing.html') initCreate();
  else if (page === 'admin.html') initAdmin();
});

// ── Home ──────────────────────────────────────────────────────────────────────
async function initHome() {
  const res = await fetch(API + '/api/animais');
  const animals = await res.json();
  const grid = document.getElementById('grid');
  const qName = document.getElementById('q-name');
  const qTipo = document.getElementById('q-tipo');
  const qRaca = document.getElementById('q-raca');
  const qLoc  = document.getElementById('q-loc');

  function render() {
    const name = qName.value.toLowerCase();
    const tipo = qTipo.value;
    const raca = qRaca.value.toLowerCase();
    const loc  = qLoc.value.toLowerCase();
    const filtered = animals.filter(a =>
      (!name || a.Nome.toLowerCase().includes(name)) &&
      (!tipo || a.Tipo === tipo) &&
      (!raca || (a.Raca||'').toLowerCase().includes(raca)) &&
      (!loc  || (a.Localizacao||'').toLowerCase().includes(loc))
    );
    if (!filtered.length) { grid.innerHTML = '<p class="no-results">Nenhum animal encontrado.</p>'; return; }
    grid.innerHTML = filtered.map(a => `
      <div class="card" onclick="location.href='animal-detail.html?id=${a.ID}'">
        <img src="${a.Imagem || 'https://images.unsplash.com/photo-1415369629372-26f2fe60c467?w=400'}" alt="${a.Nome}" loading="lazy">
        <div class="card-body">
          <span class="tag">${a.Tipo || 'Animal'}</span>
          <h3>${a.Nome}</h3>
          <p>${a.Raca || ''} ${a.Localizacao ? '· ' + a.Localizacao : ''}</p>
        </div>
      </div>`).join('');
  }

  [qName, qTipo, qRaca, qLoc].forEach(el => el.addEventListener('input', render));
  render();
}

// ── Detail ────────────────────────────────────────────────────────────────────
async function initDetail() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.href = 'index.html'; return; }
  const res = await fetch(API + '/api/animais/' + id);
  if (!res.ok) { document.getElementById('detail').innerHTML = '<p class="no-results">Animal não encontrado.</p>'; return; }
  const a = await res.json();
  document.getElementById('detail').innerHTML = `
    <img src="${a.Imagem || ''}" alt="${a.Nome}" onerror="this.style.display='none'">
    <div class="detail-body">
      <span class="tag">${a.Tipo || 'Animal'}</span>
      <h1>${a.Nome}</h1>
      <div class="meta">
        <span><strong>Raça:</strong> ${a.Raca || '—'}</span>
        <span><strong>Nascimento:</strong> ${a.Data_Nascimento || '—'}</span>
        <span><strong>Localização:</strong> ${a.Localizacao || '—'}</span>
      </div>
      <p>${a.Descricao || ''}</p>
    </div>`;
}

// ── Login ─────────────────────────────────────────────────────────────────────
function initLogin() {
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const msg = document.getElementById('msg');
    const res = await fetch(API + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { msg.className = 'msg error'; msg.textContent = data.error; return; }
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    location.href = 'index.html';
  });
}

// ── Register ──────────────────────────────────────────────────────────────────
function initRegister() {
  document.getElementById('reg-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = document.getElementById('msg');
    const payload = {
      nome: document.getElementById('nome').value,
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
      data_nascimento: document.getElementById('dob').value,
      morada: document.getElementById('morada').value,
    };
    const res = await fetch(API + '/api/clientes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) { msg.className = 'msg error'; msg.textContent = data.error; return; }
    msg.className = 'msg success'; msg.textContent = 'Conta criada! A redirecionar...';
    setTimeout(() => location.href = 'login.html', 1500);
  });
}

// ── Create listing ────────────────────────────────────────────────────────────
function initCreate() {
  if (!isLoggedIn()) { location.href = 'login.html'; return; }
  document.getElementById('create-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = document.getElementById('msg');
    const payload = {
      nome: document.getElementById('nome').value,
      tipo: document.getElementById('tipo').value,
      raca: document.getElementById('raca').value,
      data_nascimento: document.getElementById('dob').value,
      localizacao: document.getElementById('loc').value,
      descricao: document.getElementById('desc').value,
      imagem: document.getElementById('img').value,
    };
    const res = await apiFetch('/api/animais', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) { msg.className = 'msg error'; msg.textContent = data.error; return; }
    msg.className = 'msg success'; msg.textContent = 'Animal adicionado!';
    setTimeout(() => location.href = 'index.html', 1200);
  });
}

// ── Admin ─────────────────────────────────────────────────────────────────────
async function initAdmin() {
  const wrap = document.getElementById('admin-wrap');
  if (!isAdmin()) { wrap.innerHTML = '<p class="no-results">Acesso negado.</p>'; return; }
  async function load() {
    const res = await apiFetch('/api/animais');
    const animals = await res.json();
    wrap.innerHTML = `<table class="admin-table">
      <thead><tr><th>ID</th><th>Nome</th><th>Tipo</th><th>Raça</th><th>Localização</th><th>Ações</th></tr></thead>
      <tbody>${animals.map(a => `<tr>
        <td>${a.ID}</td><td>${a.Nome}</td><td>${a.Tipo||''}</td><td>${a.Raca||''}</td><td>${a.Localizacao||''}</td>
        <td>
          <button class="btn-sm btn-edit" onclick="editAnimal(${a.ID})">Editar</button>
          <button class="btn-sm btn-del" onclick="delAnimal(${a.ID})">Apagar</button>
        </td></tr>`).join('')}
      </tbody></table>`;
  }
  window.editAnimal = async (id) => {
    const nome = prompt('Novo nome:');
    if (!nome) return;
    const res = await apiFetch('/api/animais/' + id, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ nome, tipo: '', raca: '', data_nascimento: '', localizacao: '', descricao: '', imagem: '' })
    });
    if (res.ok) load(); else alert('Erro ao editar.');
  };
  window.delAnimal = async (id) => {
    if (!confirm('Apagar este animal?')) return;
    const res = await apiFetch('/api/animais/' + id, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) load(); else alert('Erro ao apagar.');
  };
  load();
}
