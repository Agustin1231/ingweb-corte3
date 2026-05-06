/* =========================================================
   APLICACIÓN · Sistema de Gestión de Citas Médicas
   SPA estática con LocalStorage como persistencia.
   Implementa los módulos descritos en la arquitectura:
     - Usuarios (auth, register, login, perfil)
     - Citas (disponibilidad, agendar, listar, cancelar)
     - Administrativo (todas las citas, médicos, reportes)
   ========================================================= */

// ───────── Storage helpers ─────────
const KEY = {
  users: 'cm_users',
  medicos: 'cm_medicos',
  horarios: 'cm_horarios',
  citas: 'cm_citas',
  session: 'cm_session',
};

const ST = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem(k); },
};

// ───────── Crypto helpers (hash + salt) ─────────
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

// ───────── Seed inicial ─────────
async function seed() {
  if (!ST.get(KEY.users)) {
    const adminSalt = uuid();
    const staffSalt = uuid();
    ST.set(KEY.users, [
      {
        id: 'u_admin',
        nombre: 'Admin Demo',
        email: 'admin@clinica.com',
        password_hash: await sha256(adminSalt + 'Admin123!'),
        salt: adminSalt,
        rol: 'admin',
        creado_en: new Date().toISOString(),
      },
      {
        id: 'u_staff',
        nombre: 'Staff Demo',
        email: 'staff@clinica.com',
        password_hash: await sha256(staffSalt + 'Staff123!'),
        salt: staffSalt,
        rol: 'staff',
        creado_en: new Date().toISOString(),
      },
    ]);
  }

  if (!ST.get(KEY.medicos)) {
    ST.set(KEY.medicos, [
      { id: 'm_1', nombre: 'Dr. López', especialidad: 'cardiologia', activo: true },
      { id: 'm_2', nombre: 'Dra. Martínez', especialidad: 'pediatria', activo: true },
      { id: 'm_3', nombre: 'Dr. García', especialidad: 'general', activo: true },
    ]);
  }

  if (!ST.get(KEY.horarios)) {
    const horarios = [];
    const dias = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
    ['m_1', 'm_2', 'm_3'].forEach(med => {
      dias.forEach(d => {
        horarios.push({ id: 'h_' + uuid().slice(0, 6), medico_id: med, dia_semana: d, hora_inicio: '08:00', hora_fin: '12:00' });
        horarios.push({ id: 'h_' + uuid().slice(0, 6), medico_id: med, dia_semana: d, hora_inicio: '14:00', hora_fin: '18:00' });
      });
    });
    ST.set(KEY.horarios, horarios);
  }

  if (!ST.get(KEY.citas)) ST.set(KEY.citas, []);
}

// ───────── API mock ─────────
const API = {
  async register({ nombre, email, password }) {
    if (!nombre || nombre.length < 2) throw err('NOMBRE_INVALIDO', 'El nombre es obligatorio');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err('EMAIL_INVALIDO', 'Formato de email no válido');
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password))
      throw err('PASSWORD_DEBIL', 'La contraseña requiere ≥ 8 caracteres con mayúscula y número');
    const users = ST.get(KEY.users) || [];
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase()))
      throw err('EMAIL_DUPLICADO', 'Ya existe una cuenta con ese email');

    const salt = uuid();
    const user = {
      id: 'u_' + uuid().slice(0, 8),
      nombre,
      email,
      password_hash: await sha256(salt + password),
      salt,
      rol: 'paciente',
      creado_en: new Date().toISOString(),
    };
    users.push(user);
    ST.set(KEY.users, users);
    return publicUser(user);
  },

  async login({ email, password }) {
    const users = ST.get(KEY.users) || [];
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    const generic = err('CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos');
    if (!user) throw generic;
    const hash = await sha256(user.salt + password);
    if (hash !== user.password_hash) throw generic;
    const session = {
      token: uuid(),
      user_id: user.id,
      rol: user.rol,
      expiresAt: Date.now() + 3600000,
    };
    ST.set(KEY.session, session);
    return { token: session.token, expiresIn: 3600, user: publicUser(user) };
  },

  logout() { ST.del(KEY.session); },

  currentUser() {
    const s = ST.get(KEY.session);
    if (!s || s.expiresAt < Date.now()) { ST.del(KEY.session); return null; }
    const user = (ST.get(KEY.users) || []).find(u => u.id === s.user_id);
    return user ? publicUser(user) : null;
  },

  // ── Citas ──
  listMedicos(filtro = null) {
    let medicos = (ST.get(KEY.medicos) || []).filter(m => m.activo);
    if (filtro) medicos = medicos.filter(m => m.especialidad === filtro);
    return medicos;
  },

  disponibilidad(medico_id, fecha) {
    const horarios = ST.get(KEY.horarios) || [];
    const citas = ST.get(KEY.citas) || [];
    const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const dia_semana = dias[new Date(fecha + 'T00:00:00').getDay()];
    const slots = new Set();
    horarios
      .filter(h => h.medico_id === medico_id && h.dia_semana === dia_semana)
      .forEach(h => {
        const [hi] = h.hora_inicio.split(':').map(Number);
        const [hf] = h.hora_fin.split(':').map(Number);
        for (let hr = hi; hr < hf; hr++) {
          slots.add(`${String(hr).padStart(2, '0')}:00`);
          slots.add(`${String(hr).padStart(2, '0')}:30`);
        }
      });
    const ocupados = citas
      .filter(c => c.medico_id === medico_id && c.fecha_hora.startsWith(fecha) && c.estado !== 'cancelada')
      .map(c => c.fecha_hora.slice(11, 16));
    ocupados.forEach(o => slots.delete(o));
    return [...slots].sort();
  },

  agendarCita({ medico_id, fecha, hora, motivo }) {
    const session = ST.get(KEY.session);
    if (!session) throw err('NO_AUTH', 'Sesión expirada');
    const fecha_hora = `${fecha}T${hora}:00`;
    if (new Date(fecha_hora) < new Date()) throw err('FECHA_PASADA', 'No puedes agendar en el pasado');
    const citas = ST.get(KEY.citas) || [];
    if (citas.some(c => c.medico_id === medico_id && c.fecha_hora === fecha_hora && c.estado !== 'cancelada'))
      throw err('CITA_DUPLICADA', 'Ese horario acaba de ocuparse, escoge otro');

    const cita = {
      id: 'c_' + uuid().slice(0, 8),
      usuario_id: session.user_id,
      medico_id,
      fecha_hora,
      estado: 'agendada',
      motivo: motivo || '',
      creado_en: new Date().toISOString(),
    };
    citas.push(cita);
    ST.set(KEY.citas, citas);
    return cita;
  },

  misCitas() {
    const session = ST.get(KEY.session);
    if (!session) return [];
    return (ST.get(KEY.citas) || [])
      .filter(c => c.usuario_id === session.user_id)
      .sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora));
  },

  cancelarCita(cita_id) {
    const session = ST.get(KEY.session);
    if (!session) throw err('NO_AUTH', 'Sesión expirada');
    const citas = ST.get(KEY.citas) || [];
    const cita = citas.find(c => c.id === cita_id);
    if (!cita) throw err('CITA_NO_ENCONTRADA', 'Cita no existe');
    if (cita.usuario_id !== session.user_id && !['admin', 'staff'].includes(session.rol))
      throw err('NO_AUTORIZADO', 'No puedes cancelar esa cita');
    if (cita.estado === 'cancelada') throw err('YA_CANCELADA', 'Esa cita ya estaba cancelada');
    const horasRestantes = (new Date(cita.fecha_hora) - new Date()) / 3600000;
    if (horasRestantes < 1 && cita.usuario_id === session.user_id)
      throw err('TARDE', 'Solo puedes cancelar con más de 1 hora de anticipación');
    cita.estado = 'cancelada';
    cita.cancelada_en = new Date().toISOString();
    ST.set(KEY.citas, citas);
    return cita;
  },

  // ── Admin ──
  todasLasCitas(filtros = {}) {
    let citas = ST.get(KEY.citas) || [];
    if (filtros.estado) citas = citas.filter(c => c.estado === filtros.estado);
    if (filtros.medico_id) citas = citas.filter(c => c.medico_id === filtros.medico_id);
    return citas.sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora));
  },

  crearMedico({ nombre, especialidad }) {
    if (!nombre || nombre.length < 2) throw err('NOMBRE_INVALIDO', 'El nombre es obligatorio');
    if (!especialidad) throw err('ESPECIALIDAD_INVALIDA', 'La especialidad es obligatoria');
    const medicos = ST.get(KEY.medicos) || [];
    const m = { id: 'm_' + uuid().slice(0, 6), nombre, especialidad, activo: true };
    medicos.push(m);
    ST.set(KEY.medicos, medicos);
    // horarios por defecto
    const horarios = ST.get(KEY.horarios) || [];
    ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'].forEach(d => {
      horarios.push({ id: 'h_' + uuid().slice(0, 6), medico_id: m.id, dia_semana: d, hora_inicio: '08:00', hora_fin: '12:00' });
      horarios.push({ id: 'h_' + uuid().slice(0, 6), medico_id: m.id, dia_semana: d, hora_inicio: '14:00', hora_fin: '18:00' });
    });
    ST.set(KEY.horarios, horarios);
    return m;
  },

  reportes() {
    const citas = ST.get(KEY.citas) || [];
    const medicos = ST.get(KEY.medicos) || [];
    const usuarios = (ST.get(KEY.users) || []).filter(u => u.rol === 'paciente');
    const por_estado = citas.reduce((acc, c) => { acc[c.estado] = (acc[c.estado] || 0) + 1; return acc; }, {});
    const por_especialidad = {};
    citas.forEach(c => {
      const m = medicos.find(m => m.id === c.medico_id);
      if (m) por_especialidad[m.especialidad] = (por_especialidad[m.especialidad] || 0) + 1;
    });
    const slots_disponibles = medicos.length * 5 * 16;
    const ocupacion = slots_disponibles > 0 ? citas.filter(c => c.estado !== 'cancelada').length / slots_disponibles : 0;
    return {
      totales: { citas: citas.length, pacientes: usuarios.length, medicos: medicos.filter(m => m.activo).length },
      por_estado,
      por_especialidad,
      ocupacion_pct: Math.round(ocupacion * 1000) / 10,
    };
  },

  resetData() {
    Object.values(KEY).forEach(k => ST.del(k));
    return seed();
  },
};

function err(codigo, mensaje) { const e = new Error(mensaje); e.codigo = codigo; e.mensaje = mensaje; return e; }
function publicUser(u) { return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, creado_en: u.creado_en }; }

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
  container.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
  if (type === 'success') setTimeout(() => { container.innerHTML = ''; }, 3000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function medicoNombre(id) {
  const m = (ST.get(KEY.medicos) || []).find(m => m.id === id);
  return m ? m.nombre : '—';
}

function especialidad(id) {
  const m = (ST.get(KEY.medicos) || []).find(m => m.id === id);
  return m ? m.especialidad : '';
}

function userNombre(id) {
  const u = (ST.get(KEY.users) || []).find(u => u.id === id);
  return u ? u.nombre : '—';
}

// ───────── Router ─────────
function route() {
  const hash = window.location.hash.slice(1) || 'login';
  const session = API.currentUser();

  if (!session && !['login', 'register'].includes(hash)) {
    window.location.hash = 'login';
    return;
  }

  if (session && ['login', 'register'].includes(hash)) {
    window.location.hash = session.rol === 'paciente' ? 'dashboard' : 'admin';
    return;
  }

  if (hash === 'admin' && session && session.rol === 'paciente') {
    window.location.hash = 'dashboard';
    return;
  }

  renderUserBar(session);

  switch (hash) {
    case 'login': renderLogin(); show('view-auth'); break;
    case 'register': renderRegister(); show('view-auth'); break;
    case 'dashboard': renderDashboard(); show('view-dashboard'); break;
    case 'agendar': renderAgendar(); show('view-agendar'); break;
    case 'admin': renderAdmin(); show('view-admin'); break;
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
  $('#btn-logout').onclick = () => { API.logout(); window.location.hash = 'login'; };
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
  $$('.auth-tab').forEach(t => {
    t.onclick = () => { window.location.hash = t.dataset.tab; };
  });
}

function renderDashboard() {
  const citas = API.misCitas();
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
    btn.onclick = () => {
      if (!confirm('¿Cancelar esta cita?')) return;
      try {
        API.cancelarCita(btn.dataset.cancel);
        renderDashboard();
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

function renderAgendar() {
  const medicos = API.listMedicos();
  const today = new Date();
  const minDate = today.toISOString().slice(0, 10);

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

  function refreshSlots() {
    const medico = $('#sel-medico').value;
    const fecha = $('#sel-fecha').value;
    const area = $('#slots-area');
    slotSeleccionado = null;
    $('#btn-confirmar').disabled = true;
    if (!medico || !fecha) { area.innerHTML = '<p style="color:var(--color-muted);font-size:13px">Escoge médico y fecha primero.</p>'; return; }
    const slots = API.disponibilidad(medico, fecha);
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
  $('#btn-confirmar').onclick = () => {
    try {
      const cita = API.agendarCita({
        medico_id: $('#sel-medico').value,
        fecha: $('#sel-fecha').value,
        hora: slotSeleccionado,
        motivo: $('#motivo').value.trim(),
      });
      showAlert($('#agendar-alert'), 'success', `Cita agendada: ${fmtDate(cita.fecha_hora)} a las ${fmtTime(cita.fecha_hora)}`);
      setTimeout(() => { window.location.hash = 'dashboard'; }, 1500);
    } catch (e) {
      showAlert($('#agendar-alert'), 'error', e.mensaje);
    }
  };
}

let adminTab = 'citas';

function renderAdmin() {
  $('#view-admin').innerHTML = `
    <div class="section-bar"><h2>Panel administrativo</h2></div>
    <div class="app-tabs">
      <button class="app-tab ${adminTab === 'citas' ? 'active' : ''}" data-atab="citas">Todas las citas</button>
      <button class="app-tab ${adminTab === 'medicos' ? 'active' : ''}" data-atab="medicos">Médicos</button>
      <button class="app-tab ${adminTab === 'reportes' ? 'active' : ''}" data-atab="reportes">Reportes</button>
    </div>
    <div id="admin-content"></div>`;
  $$('[data-atab]').forEach(b => {
    b.onclick = () => { adminTab = b.dataset.atab; renderAdmin(); };
  });
  if (adminTab === 'citas') renderAdminCitas();
  if (adminTab === 'medicos') renderAdminMedicos();
  if (adminTab === 'reportes') renderAdminReportes();
}

function renderAdminCitas() {
  const citas = API.todasLasCitas();
  const c = $('#admin-content');
  c.innerHTML = `
    <div id="admin-alert"></div>
    <p style="font-size:13px;color:var(--color-text-soft)">Total: <strong>${citas.length}</strong> citas en el sistema.</p>
    ${citas.length === 0 ? emptyState('No hay citas todavía. Pide a un paciente que agende una.') :
      `<div class="cita-list">${citas.map(adminCitaCard).join('')}</div>`}
  `;
  $$('[data-cancel]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('¿Cancelar esta cita como administrador?')) return;
      try { API.cancelarCita(btn.dataset.cancel); renderAdminCitas(); showAlert($('#admin-alert'), 'success', 'Cita cancelada.'); }
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
          <strong>${escapeHtml(userNombre(c.usuario_id))}</strong> con ${escapeHtml(medicoNombre(c.medico_id))}
        </div>
        ${c.motivo ? `<div style="font-size:12px;color:var(--color-muted);margin-top:4px">"${escapeHtml(c.motivo)}"</div>` : ''}
        <span class="cita-status ${c.estado}">${c.estado}</span>
      </div>
      ${c.estado === 'agendada' ? `<button class="btn btn-danger" data-cancel="${c.id}">Cancelar</button>` : ''}
    </div>`;
}

function renderAdminMedicos() {
  const medicos = ST.get(KEY.medicos) || [];
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
  $('#form-medico').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      API.crearMedico({ nombre: f.nombre.value.trim(), especialidad: f.especialidad.value });
      showAlert($('#med-alert'), 'success', 'Médico agregado con horarios L-V 8-12 y 14-18.');
      renderAdminMedicos();
    } catch (e) { showAlert($('#med-alert'), 'error', e.mensaje); }
  };
}

function renderAdminReportes() {
  const r = API.reportes();
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

// ───────── Reset demo data ─────────
function bindResetLink() {
  const link = $('#reset-data');
  if (link) {
    link.onclick = async () => {
      if (!confirm('Esto borrará todos los datos de demostración (citas, usuarios, médicos) y los regenerará. ¿Continuar?')) return;
      await API.resetData();
      window.location.hash = 'login';
      window.location.reload();
    };
  }
}

// ───────── Boot ─────────
(async function () {
  await seed();
  window.addEventListener('hashchange', route);
  bindResetLink();
  route();
})();
