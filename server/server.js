// =========================================================
// Backend del Sistema de Gestion de Citas Medicas
// Ingenieria Web - Corte III
//
// Capa de logica/negocio segun la arquitectura cliente-servidor
// de 3 capas documentada en docs/01-arquitectura.md.
//
// Endpoints (REST sobre HTTPS, JSON, token Bearer):
//   POST   /api/auth/register
//   POST   /api/auth/login
//   DELETE /api/auth/session
//   GET    /api/usuarios/me
//   GET    /api/medicos
//   GET    /api/disponibilidad?medico_id=&fecha=
//   GET    /api/citas
//   POST   /api/citas
//   DELETE /api/citas/:id
//   GET    /api/admin/citas
//   POST   /api/admin/medicos
//   GET    /api/admin/reportes
//   POST   /api/admin/reset
// =========================================================

import express from 'express';
import cors from 'cors';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.DATA_FILE || join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;

// ───────── Persistencia ─────────
// JSON unico en disco. Una unica instancia del proceso => no hay carrera
// dentro del check-then-write (JS es single-threaded).
function defaultDB() {
  const adminSalt = randomUUID();
  const staffSalt = randomUUID();
  const horarios = [];
  const dias = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
  ['m_1', 'm_2', 'm_3'].forEach(med => dias.forEach(d => {
    horarios.push({ id: 'h_' + randomUUID().slice(0, 6), medico_id: med, dia_semana: d, hora_inicio: '08:00', hora_fin: '12:00' });
    horarios.push({ id: 'h_' + randomUUID().slice(0, 6), medico_id: med, dia_semana: d, hora_inicio: '14:00', hora_fin: '18:00' });
  }));
  return {
    users: [
      { id: 'u_admin', nombre: 'Admin Demo', email: 'admin@clinica.com', password_hash: sha256(adminSalt + 'Admin123!'), salt: adminSalt, rol: 'admin', creado_en: new Date().toISOString() },
      { id: 'u_staff', nombre: 'Staff Demo', email: 'staff@clinica.com', password_hash: sha256(staffSalt + 'Staff123!'), salt: staffSalt, rol: 'staff', creado_en: new Date().toISOString() },
    ],
    medicos: [
      { id: 'm_1', nombre: 'Dr. Lopez',    especialidad: 'cardiologia', activo: true },
      { id: 'm_2', nombre: 'Dra. Martinez', especialidad: 'pediatria',   activo: true },
      { id: 'm_3', nombre: 'Dr. Garcia',   especialidad: 'general',     activo: true },
    ],
    horarios,
    citas: [],
  };
}

let db = existsSync(DATA_FILE) ? JSON.parse(readFileSync(DATA_FILE, 'utf8')) : defaultDB();
function save() { writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
save();

// ───────── Tokens en memoria ─────────
// Map<token, { user_id, expiresAt }>. Para el academico no usamos JWT.
const tokens = new Map();
const TTL_MS = 1000 * 60 * 60; // 1h

function nuevoToken(user_id) {
  const token = randomUUID();
  tokens.set(token, { user_id, expiresAt: Date.now() + TTL_MS });
  return token;
}

function autenticar(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const entry = tokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) { tokens.delete(token); return null; }
  return db.users.find(u => u.id === entry.user_id) || null;
}

// ───────── Crypto ─────────
function sha256(text) { return createHash('sha256').update(text).digest('hex'); }
function publicUser(u) { return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, creado_en: u.creado_en }; }
function errorBody(codigo, mensaje, detalles = {}) { return { error: { codigo, mensaje, detalles } }; }

// ───────── App ─────────
const app = express();
app.use(cors());
app.use(express.json());

// Middlewares
function requireAuth(req, res, next) {
  const u = autenticar(req);
  if (!u) return res.status(401).json(errorBody('NO_AUTH', 'Token invalido o expirado'));
  req.user = u;
  next();
}
function requireRol(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.rol)) return res.status(403).json(errorBody('NO_AUTORIZADO', 'Permiso insuficiente'));
    next();
  };
}

// ───────── AUTH ─────────
app.post('/api/auth/register', (req, res) => {
  const { nombre, email, password } = req.body || {};
  if (!nombre || nombre.length < 2) return res.status(400).json(errorBody('NOMBRE_INVALIDO', 'El nombre es obligatorio'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) return res.status(400).json(errorBody('EMAIL_INVALIDO', 'Formato de email no valido'));
  if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password))
    return res.status(400).json(errorBody('PASSWORD_DEBIL', 'La contrasena requiere >= 8 caracteres con mayuscula y numero'));
  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase()))
    return res.status(409).json(errorBody('EMAIL_DUPLICADO', 'Ya existe una cuenta con ese email'));

  const salt = randomUUID();
  const user = {
    id: 'u_' + randomUUID().slice(0, 8),
    nombre, email,
    password_hash: sha256(salt + password),
    salt,
    rol: 'paciente',
    creado_en: new Date().toISOString(),
  };
  db.users.push(user); save();
  res.status(201).json(publicUser(user));
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());
  if (!user || sha256(user.salt + (password || '')) !== user.password_hash)
    return res.status(401).json(errorBody('CREDENCIALES_INVALIDAS', 'Email o contrasena incorrectos'));
  const token = nuevoToken(user.id);
  res.json({ token, expiresIn: TTL_MS / 1000, user: publicUser(user) });
});

app.delete('/api/auth/session', requireAuth, (req, res) => {
  const auth = req.headers.authorization.slice(7);
  tokens.delete(auth);
  res.status(204).end();
});

app.get('/api/usuarios/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

// ───────── MEDICOS ─────────
app.get('/api/medicos', (req, res) => {
  let medicos = db.medicos.filter(m => m.activo);
  if (req.query.especialidad) medicos = medicos.filter(m => m.especialidad === req.query.especialidad);
  res.json(medicos);
});

// ───────── DISPONIBILIDAD ─────────
app.get('/api/disponibilidad', (req, res) => {
  const { medico_id, fecha } = req.query;
  if (!medico_id || !fecha) return res.status(400).json(errorBody('PARAMS_INVALIDOS', 'medico_id y fecha son obligatorios'));
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const dia_semana = dias[new Date(fecha + 'T00:00:00').getDay()];
  const slots = new Set();
  db.horarios
    .filter(h => h.medico_id === medico_id && h.dia_semana === dia_semana)
    .forEach(h => {
      const [hi] = h.hora_inicio.split(':').map(Number);
      const [hf] = h.hora_fin.split(':').map(Number);
      for (let hr = hi; hr < hf; hr++) {
        slots.add(`${String(hr).padStart(2, '0')}:00`);
        slots.add(`${String(hr).padStart(2, '0')}:30`);
      }
    });
  db.citas
    .filter(c => c.medico_id === medico_id && c.fecha_hora.startsWith(fecha) && c.estado !== 'cancelada')
    .forEach(c => slots.delete(c.fecha_hora.slice(11, 16)));
  res.json([...slots].sort());
});

// ───────── CITAS ─────────
app.get('/api/citas', requireAuth, (req, res) => {
  const mis = db.citas
    .filter(c => c.usuario_id === req.user.id)
    .sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora));
  res.json(mis);
});

app.post('/api/citas', requireAuth, (req, res) => {
  const { medico_id, fecha, hora, motivo } = req.body || {};
  if (!medico_id || !fecha || !hora) return res.status(400).json(errorBody('PARAMS_INVALIDOS', 'medico_id, fecha y hora son obligatorios'));
  const fecha_hora = `${fecha}T${hora}:00`;
  // Margen de 24h para evitar falsos negativos por diferencia de TZ entre cliente y servidor.
  // El frontend ya filtra slots pasados con la TZ local del usuario.
  const margenMs = 24 * 60 * 60 * 1000;
  if (new Date(fecha_hora).getTime() + margenMs < Date.now())
    return res.status(400).json(errorBody('FECHA_PASADA', 'No puedes agendar en una fecha pasada'));
  // CHECK ATOMICO: dentro de un solo handler, no hay race condition (JS single-threaded).
  if (db.citas.some(c => c.medico_id === medico_id && c.fecha_hora === fecha_hora && c.estado !== 'cancelada'))
    return res.status(409).json(errorBody('CITA_DUPLICADA', 'Ese horario acaba de ocuparse, escoge otro'));
  const cita = {
    id: 'c_' + randomUUID().slice(0, 8),
    usuario_id: req.user.id,
    medico_id,
    fecha_hora,
    estado: 'agendada',
    motivo: motivo || '',
    creado_en: new Date().toISOString(),
  };
  db.citas.push(cita); save();
  res.status(201).json(cita);
});

app.delete('/api/citas/:id', requireAuth, (req, res) => {
  const cita = db.citas.find(c => c.id === req.params.id);
  if (!cita) return res.status(404).json(errorBody('CITA_NO_ENCONTRADA', 'Cita no existe'));
  if (cita.usuario_id !== req.user.id && !['admin', 'staff'].includes(req.user.rol))
    return res.status(403).json(errorBody('NO_AUTORIZADO', 'No puedes cancelar esa cita'));
  if (cita.estado === 'cancelada') return res.status(409).json(errorBody('YA_CANCELADA', 'Esa cita ya estaba cancelada'));
  const horasRestantes = (new Date(cita.fecha_hora) - new Date()) / 3600000;
  if (horasRestantes < 1 && cita.usuario_id === req.user.id)
    return res.status(409).json(errorBody('TARDE', 'Solo puedes cancelar con mas de 1 hora de anticipacion'));
  cita.estado = 'cancelada';
  cita.cancelada_en = new Date().toISOString();
  save();
  res.json(cita);
});

// ───────── ADMIN ─────────
app.get('/api/admin/citas', requireAuth, requireRol('admin', 'staff'), (req, res) => {
  let citas = db.citas.slice();
  if (req.query.estado) citas = citas.filter(c => c.estado === req.query.estado);
  if (req.query.medico_id) citas = citas.filter(c => c.medico_id === req.query.medico_id);
  citas.sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora));
  // Enriquecer con nombre del paciente para que la UI admin no tenga que pedirlo aparte.
  const conNombre = citas.map(c => {
    const u = db.users.find(u => u.id === c.usuario_id);
    return { ...c, usuario_nombre: u ? u.nombre : '—' };
  });
  res.json(conNombre);
});

app.post('/api/admin/medicos', requireAuth, requireRol('admin', 'staff'), (req, res) => {
  const { nombre, especialidad } = req.body || {};
  if (!nombre || nombre.length < 2) return res.status(400).json(errorBody('NOMBRE_INVALIDO', 'El nombre es obligatorio'));
  if (!especialidad) return res.status(400).json(errorBody('ESPECIALIDAD_INVALIDA', 'La especialidad es obligatoria'));
  const m = { id: 'm_' + randomUUID().slice(0, 6), nombre, especialidad, activo: true };
  db.medicos.push(m);
  ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'].forEach(d => {
    db.horarios.push({ id: 'h_' + randomUUID().slice(0, 6), medico_id: m.id, dia_semana: d, hora_inicio: '08:00', hora_fin: '12:00' });
    db.horarios.push({ id: 'h_' + randomUUID().slice(0, 6), medico_id: m.id, dia_semana: d, hora_inicio: '14:00', hora_fin: '18:00' });
  });
  save();
  res.status(201).json(m);
});

app.get('/api/admin/reportes', requireAuth, requireRol('admin', 'staff'), (req, res) => {
  const por_estado = db.citas.reduce((acc, c) => { acc[c.estado] = (acc[c.estado] || 0) + 1; return acc; }, {});
  const por_especialidad = {};
  db.citas.forEach(c => {
    const m = db.medicos.find(m => m.id === c.medico_id);
    if (m) por_especialidad[m.especialidad] = (por_especialidad[m.especialidad] || 0) + 1;
  });
  const slots_disponibles = db.medicos.length * 5 * 16;
  const ocupacion = slots_disponibles > 0 ? db.citas.filter(c => c.estado !== 'cancelada').length / slots_disponibles : 0;
  res.json({
    totales: {
      citas: db.citas.length,
      pacientes: db.users.filter(u => u.rol === 'paciente').length,
      medicos: db.medicos.filter(m => m.activo).length,
    },
    por_estado,
    por_especialidad,
    ocupacion_pct: Math.round(ocupacion * 1000) / 10,
  });
});

app.post('/api/admin/reset', requireAuth, requireRol('admin'), (req, res) => {
  db = defaultDB(); save(); tokens.clear();
  res.json({ ok: true });
});

// ───────── Health ─────────
app.get('/', (req, res) => res.json({ ok: true, name: 'ingweb-citas-api', endpoints: '/api/*' }));

app.listen(PORT, () => console.log(`API escuchando en http://localhost:${PORT}`));
