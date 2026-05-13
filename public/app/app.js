/* =========================================================
   APLICACION - Sistema de Gestion de Citas Medicas
   Cliente (capa de presentacion). Llama al backend REST.
   La capa de logica y datos vive en /server/ (Express).
   ========================================================= */

// ───────── Configuracion del backend ─────────
// Cuando se sirve desde localhost, apunta al backend local en :3000.
// En produccion, apunta a la URL del backend desplegado en Render.
const API_BASE = (() => {
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '') return 'http://localhost:3000/api';
  // ↓ Cambiar tras desplegar el backend en Render:
  return 'https://ingweb-citas-api.onrender.com/api';
})();

// ───────── Storage local (solo sesion) ─────────
const SESSION_KEY = 'cm_session';
const ST = {
  getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } },
  setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); BUS.publish(SESSION_KEY); },
  clearSession() { localStorage.removeItem(SESSION_KEY); BUS.publish(SESSION_KEY); },
};

// ───────── BroadcastChannel: avisa a otras pestañas que algo cambio ─────────
// Tras una operacion exitosa (agendar/cancelar) las otras pestañas refrescan.
const BUS = (() => {
  const channel = ('BroadcastChannel' in window) ? new BroadcastChannel('cm_sync') : null;
  const listeners = new Set();
  if (channel) channel.onmessage = (e) => listeners.forEach(fn => fn(e.data));
  window.addEventListener('storage', (e) => {
    if (e.key === SESSION_KEY) listeners.forEach(fn => fn(e.key));
  });
  return {
    publish(key) { if (channel) channel.postMessage(key); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();

// ───────── Fetch wrapper ─────────
async function apiCall(path, { method = 'GET', body = null, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const s = ST.getSession();
    if (s?.token) headers.Authorization = `Bearer ${s.token}`;
  }
  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (networkErr) {
    throw err('NETWORK', 'No se puede conectar con el servidor. Verifica que el backend este corriendo.');
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const e = err(data?.error?.codigo || 'HTTP_ERROR', data?.error?.mensaje || `Error ${res.status}`);
    throw e;
  }
  return data;
}
function err(codigo, mensaje) { const e = new Error(mensaje); e.codigo = codigo; e.mensaje = mensaje; return e; }

// ───────── API cliente (todo async ahora) ─────────
const API = {
  async register({ nombre, email, password }) {
    return apiCall('/auth/register', { method: 'POST', body: { nombre, email, password }, auth: false });
  },
  async login({ email, password }) {
    const data = await apiCall('/auth/login', { method: 'POST', body: { email, password }, auth: false });
    ST.setSession({ token: data.token, user: data.user, expiresAt: Date.now() + data.expiresIn * 1000 });
    return data;
  },
  async logout() {
    try { await apiCall('/auth/session', { method: 'DELETE' }); } catch {}
    ST.clearSession();
  },
  currentUser() {
    const s = ST.getSession();
    if (!s || s.expiresAt < Date.now()) { ST.clearSession(); return null; }
    return s.user;
  },
  async listMedicos(especialidad = null) {
    const q = especialidad ? `?especialidad=${encodeURIComponent(especialidad)}` : '';
    return apiCall('/medicos' + q, { auth: false });
  },
  async disponibilidad(medico_id, fecha) {
    return apiCall(`/disponibilidad?medico_id=${encodeURIComponent(medico_id)}&fecha=${encodeURIComponent(fecha)}`, { auth: false });
  },
  async agendarCita({ medico_id, fecha, hora, motivo }) {
    const cita = await apiCall('/citas', { method: 'POST', body: { medico_id, fecha, hora, motivo } });
    BUS.publish('cm_citas');
    return cita;
  },
  async misCitas() { return apiCall('/citas'); },
  async cancelarCita(id) {
    const cita = await apiCall('/citas/' + encodeURIComponent(id), { method: 'DELETE' });
    BUS.publish('cm_citas');
    return cita;
  },
  async todasLasCitas(filtros = {}) {
    const qs = new URLSearchParams(filtros).toString();
    return apiCall('/admin/citas' + (qs ? '?' + qs : ''));
  },
  async crearMedico({ nombre, especialidad }) {
    const m = await apiCall('/admin/medicos', { method: 'POST', body: { nombre, especialidad } });
    BUS.publish('cm_medicos');
    return m;
  },
  async reportes() { return apiCall('/admin/reportes'); },
  async resetData() {
    await apiCall('/admin/reset', { method: 'POST' });
    ST.clearSession();
    BUS.publish('cm_citas');
  },
};

// ───────── Sync entre pestañas ─────────
// Cuando otra pestaña hace agendar/cancelar, refrescamos la vista activa.
BUS.subscribe((key) => {
  if (key !== 'cm_citas' && key !== 'cm_medicos') return;
  const hash = window.location.hash.slice(1) || 'login';
  if (hash === 'agendar' && typeof window._refreshSlots === 'function') window._refreshSlots();
  else if (hash === 'dashboard') renderDashboard();
  else if (hash === 'admin') {
    if (adminTab === 'citas') renderAdminCitas();
    if (adminTab === 'reportes') renderAdminReportes();
  }
});

// ───────── UI helpers ─────────
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function show(viewId) {
  $$('.view').forEach(v => v.classList.remove('active'));
  const v = $('#' + viewId);
  if (v) v.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showAlert(container, type, message) {
  if (!container) return;
  container.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
  if (type === 'success') setTimeout(() => { container.innerHTML = ''; }, 3000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

// Cache ligero de medicos para mostrar nombre/especialidad en las cards.
let _medicosCache = [];
async function ensureMedicos() {
  if (_medicosCache.length === 0) {
    try { _medicosCache = await API.listMedicos(); } catch { _medicosCache = []; }
  }
  return _medicosCache;
}
function medicoNombre(id) { const m = _medicosCache.find(m => m.id === id); return m ? m.nombre : '—'; }
function especialidad(id) { const m = _medicosCache.find(m => m.id === id); return m ? m.especialidad : ''; }

// ───────── Router ─────────
async function route() {
  const hash = window.location.hash.slice(1) || 'login';
  const session = API.currentUser();

  if (!session && !['login', 'register'].includes(hash)) { window.location.hash = 'login'; return; }
  if (session && ['login', 'register'].includes(hash)) {
    window.location.hash = session.rol === 'paciente' ? 'dashboard' : 'admin'; return;
  }
  if (hash === 'admin' && session && session.rol === 'paciente') { window.location.hash = 'dashboard'; return; }

  renderUserBar(session);
  if (session) await ensureMedicos();

  switch (hash) {
    case 'login': renderLogin(); show('view-auth'); break;
    case 'register': renderRegister(); show('view-auth'); break;
    case 'dashboard': await renderDashboard(); show('view-dashboard'); break;
    case 'agendar': await renderAgendar(); show('view-agendar'); break;
    case 'admin': await renderAdmin(); show('view-admin'); break;
    default: window.location.hash = session ? (session.rol === 'paciente' ? 'dashboard' : 'admin') : 'login';
  }
}

// ───────── Renderers ─────────
function renderUserBar(session) {
  const bar = $('#user-bar');
  if (!session) { bar.innerHTML = ''; return; }
  bar.innerHTML = `
    <div class="user-info">
      <div class="user-avatar">${escapeHtml(session.nombre[0].toUpperCase())}</div>
      <div>
        <div class="user-name">${escapeHtml(session.nombre)}<span class="user-role ${session.rol}">${session.rol}</span></div>
        <div style="font-size:12px;color:var(--color-muted)">${escapeHtml(session.email)}</div>
      </div>
    </div>
    <div class="user-actions">
      ${session.rol === 'paciente' ? '<a class="btn btn-secondary" href="#dashboard">Mis citas</a><a class="btn btn-primary" href="#agendar">Agendar cita</a>' : '<a class="btn btn-primary" href="#admin">Panel admin</a>'}
      <button class="btn btn-secondary" id="btn-logout">Salir</button>
    </div>`;
  $('#btn-logout').onclick = async () => { await API.logout(); window.location.hash = 'login'; };
}

let authTab = 'login';

function renderLogin() {
  authTab = 'login';
  $('#view-auth').innerHTML = authShell(`
    <h1>Iniciar sesión</h1>
    <p class="lead">Accede al sistema con tus credenciales.</p>
    <div id="auth-alert"></div>
    <form id="form-login" autocomplete="on">
      <div class="form-row"><label>Email</label><input type="email" name="email" required placeholder="tu@email.com"></div>
      <div class="form-row"><label>Contraseña</label><input type="password" name="password" required placeholder="••••••••"></div>
      <button class="btn btn-primary btn-block" type="submit">Entrar</button>
    </form>
    <p style="text-align:center;margin-top:18px;font-size:13px;color:var(--color-text-soft)">¿No tienes cuenta? <a href="#register">Regístrate aquí</a></p>
  `);
  bindAuthTabs();
  $('#form-login').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await API.login({ email: f.email.value.trim(), password: f.password.value });
      window.location.hash = '';
      route();
    } catch (err) {
      showAlert($('#auth-alert'), 'error', err.mensaje || err.message);
    }
  };
}

function renderRegister() {
  authTab = 'register';
  $('#view-auth').innerHTML = authShell(`
    <h1>Crear cuenta</h1>
    <p class="lead">Regístrate como paciente para agendar citas.</p>
    <div id="auth-alert"></div>
    <form id="form-register" autocomplete="on">
      <div class="form-row"><label>Nombre completo</label><input type="text" name="nombre" required placeholder="Ana Pérez"></div>
      <div class="form-row"><label>Email</label><input type="email" name="email" required placeholder="ana@email.com"></div>
      <div class="form-row"><label>Contraseña</label><input type="password" name="password" required placeholder="••••••••"><span class="hint">Mínimo 8 caracteres con 1 mayúscula y 1 número</span></div>
      <button class="btn btn-primary btn-block" type="submit">Crear cuenta</button>
    </form>
    <p style="text-align:center;margin-top:18px;font-size:13px;color:var(--color-text-soft)">¿Ya tienes cuenta? <a href="#login">Inicia sesión</a></p>
  `);
  bindAuthTabs();
  $('#form-register').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await API.register({
        nombre: f.nombre.value.trim(),
        email: f.email.value.trim(),
        password: f.password.value,
      });
      await API.login({ email: f.email.value.trim(), password: f.password.value });
      window.location.hash = 'dashboard';
    } catch (err) {
      showAlert($('#auth-alert'), 'error', err.mensaje || err.message);
    }
  };
}

function authShell(inner) {
  return `
    <div class="auth-card">
      <div class="auth-tabs">
        <button class="auth-tab ${authTab === 'login' ? 'active' : ''}" data-tab="login">Iniciar sesión</button>
        <button class="auth-tab ${authTab === 'register' ? 'active' : ''}" data-tab="register">Registrarse</button>
      </div>
      ${inner}
    </div>`;
}

function bindAuthTabs() {
  $$('.auth-tab').forEach(t => { t.onclick = () => { window.location.hash = t.dataset.tab; }; });
}

async function renderDashboard() {
  let citas = [];
  try { citas = await API.misCitas(); } catch (e) {
    $('#view-dashboard').innerHTML = `<div class="alert alert-error">${escapeHtml(e.mensaje)}</div>`;
    return;
  }
  const proximas = citas.filter(c => c.estado === 'agendada' && new Date(c.fecha_hora) >= new Date());
  const pasadas = citas.filter(c => c.estado !== 'agendada' || new Date(c.fecha_hora) < new Date());

  $('#view-dashboard').innerHTML = `
    <div class="section-bar">
      <h2>Mis citas</h2>
      <a class="btn btn-primary" href="#agendar">+ Agendar nueva</a>
    </div>
    <div id="cita-alert"></div>

    <h3 style="font-size:14px;margin:20px 0 10px;color:var(--color-text-soft);text-transform:uppercase;letter-spacing:.06em">Próximas (${proximas.length})</h3>
    ${proximas.length === 0 ? emptyState('No tienes citas próximas.', 'Agendar cita', '#agendar') : `<div class="cita-list">${proximas.map(citaCard).join('')}</div>`}

    <h3 style="font-size:14px;margin:32px 0 10px;color:var(--color-text-soft);text-transform:uppercase;letter-spacing:.06em">Historial (${pasadas.length})</h3>
    ${pasadas.length === 0 ? '<p style="color:var(--color-muted);font-size:13px">Sin historial.</p>' : `<div class="cita-list">${pasadas.map(citaCard).join('')}</div>`}
  `;
  bindCancelButtons();
}

function citaCard(c) {
  return `
    <div class="cita ${c.estado}">
      <div class="cita-meta">
        <div class="cita-fecha">${fmtDate(c.fecha_hora)} · ${fmtTime(c.fecha_hora)}</div>
        <div class="cita-medico">${escapeHtml(medicoNombre(c.medico_id))} · ${escapeHtml(especialidad(c.medico_id))}</div>
        ${c.motivo ? `<div style="font-size:12px;color:var(--color-muted);margin-top:4px">"${escapeHtml(c.motivo)}"</div>` : ''}
        <span class="cita-status ${c.estado}">${c.estado}</span>
      </div>
      ${c.estado === 'agendada' && new Date(c.fecha_hora) > new Date() ?
        `<button class="btn btn-danger" data-cancel="${c.id}">Cancelar</button>` : ''}
    </div>`;
}

function bindCancelButtons() {
  $$('[data-cancel]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('¿Cancelar esta cita?')) return;
      try {
        await API.cancelarCita(btn.dataset.cancel);
        await renderDashboard();
        showAlert($('#cita-alert'), 'success', 'Cita cancelada correctamente.');
      } catch (e) {
        showAlert($('#cita-alert'), 'error', e.mensaje);
      }
    };
  });
}

function emptyState(msg, btnLabel, href) {
  return `
    <div class="empty-state">
      <div class="icon">📅</div>
      <p>${escapeHtml(msg)}</p>
      ${btnLabel ? `<a class="btn btn-primary" href="${href}">${btnLabel}</a>` : ''}
    </div>`;
}

async function renderAgendar() {
  const medicos = await API.listMedicos();
  _medicosCache = medicos;
  const minDate = new Date().toISOString().slice(0, 10);

  $('#view-agendar').innerHTML = `
    <div class="section-bar">
      <h2>Agendar nueva cita</h2>
      <a class="btn btn-secondary" href="#dashboard">← Volver</a>
    </div>
    <div id="agendar-alert"></div>
    <div class="auth-card" style="max-width:680px">
      <div class="form-row">
        <label>1. Selecciona médico</label>
        <select id="sel-medico">
          <option value="">— Elige un médico —</option>
          ${medicos.map(m => `<option value="${m.id}">${escapeHtml(m.nombre)} · ${escapeHtml(m.especialidad)}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label>2. Selecciona fecha</label>
        <input type="date" id="sel-fecha" min="${minDate}">
        <span class="hint">Atención de lunes a viernes, 8-12 y 14-18.</span>
      </div>
      <div class="form-row">
        <label>3. Selecciona horario disponible</label>
        <div id="slots-area"><p style="color:var(--color-muted);font-size:13px">Escoge médico y fecha primero.</p></div>
      </div>
      <div class="form-row">
        <label>4. Motivo (opcional)</label>
        <textarea id="motivo" rows="2" placeholder="Ej: Control anual"></textarea>
      </div>
      <button class="btn btn-primary btn-block" id="btn-confirmar" disabled>Confirmar cita</button>
    </div>`;

  let slotSeleccionado = null;

  async function refreshSlots() {
    const medico = $('#sel-medico')?.value;
    const fecha = $('#sel-fecha')?.value;
    const area = $('#slots-area');
    if (!area) return;
    slotSeleccionado = null;
    const btn = $('#btn-confirmar');
    if (btn) btn.disabled = true;
    if (!medico || !fecha) { area.innerHTML = '<p style="color:var(--color-muted);font-size:13px">Escoge médico y fecha primero.</p>'; return; }
    area.innerHTML = '<p style="color:var(--color-muted);font-size:13px">Consultando disponibilidad...</p>';
    let slots;
    try { slots = await API.disponibilidad(medico, fecha); }
    catch (e) { area.innerHTML = `<p style="color:var(--color-error);font-size:13px">${escapeHtml(e.mensaje)}</p>`; return; }
    if (slots.length === 0) {
      area.innerHTML = '<p style="color:var(--color-muted);font-size:13px">Sin horarios disponibles ese día. Prueba otra fecha.</p>';
      return;
    }
    area.innerHTML = `<div class="slots-grid">${slots.map(s => `<button class="slot-btn" data-slot="${s}">${s}</button>`).join('')}</div>`;
    $$('[data-slot]').forEach(b => {
      b.onclick = (e) => {
        e.preventDefault();
        $$('[data-slot]').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        slotSeleccionado = b.dataset.slot;
        $('#btn-confirmar').disabled = false;
      };
    });
  }

  $('#sel-medico').onchange = refreshSlots;
  $('#sel-fecha').onchange = refreshSlots;
  window._refreshSlots = refreshSlots;

  $('#btn-confirmar').onclick = async () => {
    const medico_id = $('#sel-medico').value;
    const fecha = $('#sel-fecha').value;
    if (!medico_id || !fecha || !slotSeleccionado) return;
    try {
      const cita = await API.agendarCita({ medico_id, fecha, hora: slotSeleccionado, motivo: $('#motivo').value.trim() });
      showAlert($('#agendar-alert'), 'success', `Cita agendada: ${fmtDate(cita.fecha_hora)} a las ${fmtTime(cita.fecha_hora)}`);
      setTimeout(() => { window.location.hash = 'dashboard'; }, 1500);
    } catch (e) {
      showAlert($('#agendar-alert'), 'error', e.mensaje);
      // Si fue CITA_DUPLICADA, refrescamos los slots para reflejar lo que tomo otro usuario.
      if (e.codigo === 'CITA_DUPLICADA') await refreshSlots();
    }
  };
}

let adminTab = 'citas';

async function renderAdmin() {
  $('#view-admin').innerHTML = `
    <div class="section-bar"><h2>Panel administrativo</h2></div>
    <div class="app-tabs">
      <button class="app-tab ${adminTab === 'citas' ? 'active' : ''}" data-atab="citas">Todas las citas</button>
      <button class="app-tab ${adminTab === 'medicos' ? 'active' : ''}" data-atab="medicos">Médicos</button>
      <button class="app-tab ${adminTab === 'reportes' ? 'active' : ''}" data-atab="reportes">Reportes</button>
    </div>
    <div id="admin-content"></div>`;
  $$('[data-atab]').forEach(b => { b.onclick = () => { adminTab = b.dataset.atab; renderAdmin(); }; });
  if (adminTab === 'citas') await renderAdminCitas();
  if (adminTab === 'medicos') await renderAdminMedicos();
  if (adminTab === 'reportes') await renderAdminReportes();
}

async function renderAdminCitas() {
  const c = $('#admin-content');
  let citas;
  try { citas = await API.todasLasCitas(); } catch (e) {
    c.innerHTML = `<div class="alert alert-error">${escapeHtml(e.mensaje)}</div>`; return;
  }
  c.innerHTML = `
    <div id="admin-alert"></div>
    <p style="font-size:13px;color:var(--color-text-soft)">Total: <strong>${citas.length}</strong> citas en el sistema.</p>
    ${citas.length === 0 ? emptyState('No hay citas todavía. Pide a un paciente que agende una.') :
      `<div class="cita-list">${citas.map(adminCitaCard).join('')}</div>`}
  `;
  $$('[data-cancel]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('¿Cancelar esta cita como administrador?')) return;
      try { await API.cancelarCita(btn.dataset.cancel); await renderAdminCitas(); showAlert($('#admin-alert'), 'success', 'Cita cancelada.'); }
      catch (e) { showAlert($('#admin-alert'), 'error', e.mensaje); }
    };
  });
}

function adminCitaCard(c) {
  return `
    <div class="cita ${c.estado}">
      <div class="cita-meta">
        <div class="cita-fecha">${fmtDate(c.fecha_hora)} · ${fmtTime(c.fecha_hora)}</div>
        <div class="cita-medico">
          <strong>${escapeHtml(c.usuario_nombre || c.usuario_id)}</strong> con ${escapeHtml(medicoNombre(c.medico_id))}
        </div>
        ${c.motivo ? `<div style="font-size:12px;color:var(--color-muted);margin-top:4px">"${escapeHtml(c.motivo)}"</div>` : ''}
        <span class="cita-status ${c.estado}">${c.estado}</span>
      </div>
      ${c.estado === 'agendada' ? `<button class="btn btn-danger" data-cancel="${c.id}">Cancelar</button>` : ''}
    </div>`;
}

async function renderAdminMedicos() {
  _medicosCache = await API.listMedicos();
  const medicos = _medicosCache;
  $('#admin-content').innerHTML = `
    <div id="med-alert"></div>
    <div class="auth-card" style="max-width:100%;margin:0 0 24px">
      <h3 style="margin:0 0 12px;font-size:16px">Agregar médico</h3>
      <form id="form-medico" style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">
        <div class="form-row" style="flex:2;margin:0"><label>Nombre</label><input name="nombre" required placeholder="Dr/Dra. Apellido"></div>
        <div class="form-row" style="flex:1;margin:0"><label>Especialidad</label>
          <select name="especialidad" required>
            <option value="">—</option>
            <option value="cardiologia">Cardiología</option>
            <option value="pediatria">Pediatría</option>
            <option value="general">Medicina general</option>
            <option value="dermatologia">Dermatología</option>
            <option value="ginecologia">Ginecología</option>
          </select>
        </div>
        <button class="btn btn-primary" type="submit">Agregar</button>
      </form>
    </div>
    <h3 style="font-size:14px;color:var(--color-text-soft);text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px">Médicos activos (${medicos.length})</h3>
    <div class="med-list">
      ${medicos.map(m => `
        <div class="med-list-row">
          <div><div class="med-name">${escapeHtml(m.nombre)}</div></div>
          <div class="med-spec">${escapeHtml(m.especialidad)}</div>
          <div><span class="cita-status ${m.activo ? 'agendada' : 'cancelada'}">${m.activo ? 'activo' : 'inactivo'}</span></div>
        </div>`).join('')}
    </div>`;
  $('#form-medico').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await API.crearMedico({ nombre: f.nombre.value.trim(), especialidad: f.especialidad.value });
      showAlert($('#med-alert'), 'success', 'Médico agregado con horarios L-V 8-12 y 14-18.');
      await renderAdminMedicos();
    } catch (e) { showAlert($('#med-alert'), 'error', e.mensaje); }
  };
}

async function renderAdminReportes() {
  let r;
  try { r = await API.reportes(); } catch (e) {
    $('#admin-content').innerHTML = `<div class="alert alert-error">${escapeHtml(e.mensaje)}</div>`; return;
  }
  $('#admin-content').innerHTML = `
    <div class="report-stats">
      <div class="report-stat"><span class="num">${r.totales.citas}</span><div class="lbl">Citas totales</div></div>
      <div class="report-stat"><span class="num">${r.totales.pacientes}</span><div class="lbl">Pacientes</div></div>
      <div class="report-stat"><span class="num">${r.totales.medicos}</span><div class="lbl">Médicos activos</div></div>
      <div class="report-stat"><span class="num">${r.ocupacion_pct}%</span><div class="lbl">Ocupación</div></div>
    </div>

    <h3 style="font-size:14px;color:var(--color-text-soft);text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px">Por estado</h3>
    <div class="med-list">
      ${Object.entries(r.por_estado).length === 0 ? '<div class="med-list-row"><span style="color:var(--color-muted)">Sin datos</span></div>' :
        Object.entries(r.por_estado).map(([k, v]) => `
          <div class="med-list-row" style="grid-template-columns:1fr auto">
            <span class="med-name" style="text-transform:capitalize">${k}</span>
            <span class="cita-status ${k === 'cancelada' ? 'cancelada' : 'agendada'}">${v}</span>
          </div>`).join('')}
    </div>

    <h3 style="font-size:14px;color:var(--color-text-soft);text-transform:uppercase;letter-spacing:.06em;margin:24px 0 10px">Por especialidad</h3>
    <div class="med-list">
      ${Object.entries(r.por_especialidad).length === 0 ? '<div class="med-list-row"><span style="color:var(--color-muted)">Sin datos</span></div>' :
        Object.entries(r.por_especialidad).map(([k, v]) => `
          <div class="med-list-row" style="grid-template-columns:1fr auto">
            <span class="med-name" style="text-transform:capitalize">${k}</span>
            <span class="cita-status agendada">${v}</span>
          </div>`).join('')}
    </div>`;
}

// ───────── Reset demo data (solo admin) ─────────
function bindResetLink() {
  const link = $('#reset-data');
  if (link) {
    link.onclick = async () => {
      const sess = API.currentUser();
      if (!sess || sess.rol !== 'admin') {
        alert('Solo un admin puede restablecer los datos. Inicia sesión con admin@clinica.com / Admin123!');
        return;
      }
      if (!confirm('Esto borrará todos los datos del servidor y los regenerará. ¿Continuar?')) return;
      try {
        await API.resetData();
        window.location.hash = 'login';
        window.location.reload();
      } catch (e) { alert('Error: ' + e.mensaje); }
    };
  }
}

// ───────── Boot ─────────
(function () {
  window.addEventListener('hashchange', route);
  bindResetLink();
  route();
})();
