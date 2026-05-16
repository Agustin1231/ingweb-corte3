// =========================================================
// Backend del Sistema de Gestion de Citas Medicas
// Ingenieria Web - Corte III
//
// Capa de logica/negocio segun la arquitectura cliente-servidor
// de 3 capas documentada en docs/01-arquitectura.md.
//
// Hardening v1.1 (2026-05-16):
//   - helmet: headers de seguridad (HSTS, CSP, X-Frame, etc.)
//   - express-rate-limit: 5 intentos/min en /auth/login y /auth/register
//   - CORS con allowlist por env (CORS_ORIGINS)
//   - bcrypt (cost=10) para passwords nuevas; compat con SHA-256 + salt legados
//   - crypto.timingSafeEqual en comparaciones de hash
//   - express.json({ limit: '10kb' }) y topes de longitud en campos
//   - Manejador global de errores que no filtra stack en produccion
// =========================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.DATA_FILE || join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const BCRYPT_COST = 10;
const MAX_LEN = { nombre: 80, motivo: 280, email: 254, password: 128 };

// ───────── CORS allowlist ─────────
// Por defecto: localhost (dev) + dominio publicado.
// En produccion ajustar via CORS_ORIGINS="https://a,https://b".
const DEFAULT_ORIGINS = [
  'http://localhost:8080', 'http://127.0.0.1:8080',
  'http://localhost:5500', 'http://127.0.0.1:5500',
  'https://agustinperalta2308.github.io',
  'https://agustinynatalia.gitlab.io',
];
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || DEFAULT_ORIGINS.join(','))
  .split(',').map(s => s.trim()).filter(Boolean);

// ───────── Persistencia ─────────
function defaultDB() {
  const horarios = [];
  const dias = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
  ['m_1', 'm_2', 'm_3'].forEach(med => dias.forEach(d => {
    horarios.push({ id: 'h_' + randomUUID().slice(0, 6), medico_id: med, dia_semana: d, hora_inicio: '08:00', hora_fin: '12:00' });
    horarios.push({ id: 'h_' + randomUUID().slice(0, 6), medico_id: med, dia_semana: d, hora_inicio: '14:00', hora_fin: '18:00' });
  }));
  return {
    users: [
      { id: 'u_admin', nombre: 'Admin Demo', email: 'admin@clinica.com', password_hash: bcrypt.hashSync('Admin123!', BCRYPT_COST), algo: 'bcrypt', rol: 'admin', creado_en: new Date().toISOString() },
      { id: 'u_staff', nombre: 'Staff Demo', email: 'staff@clinica.com', password_hash: bcrypt.hashSync('Staff123!', BCRYPT_COST), algo: 'bcrypt', rol: 'staff', creado_en: new Date().toISOString() },
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

// Verificacion timing-safe que cubre passwords nuevas (bcrypt) y heredadas (sha256+salt).
async function verificarPassword(user, plain) {
  if (user.algo === 'bcrypt') {
    return bcrypt.compare(plain, user.password_hash);
  }
  // Legado: sha256(salt + password). Comparamos en tiempo constante.
  const expected = Buffer.from(user.password_hash, 'hex');
  const got = Buffer.from(sha256((user.salt || '') + plain), 'hex');
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

// Migracion silenciosa: si el usuario aun tiene SHA-256, en el primer login exitoso
// re-hashea con bcrypt. Asi no rompemos cuentas existentes.
async function migrarABcryptSiHaceFalta(user, plain) {
  if (user.algo === 'bcrypt') return;
  user.password_hash = await bcrypt.hash(plain, BCRYPT_COST);
  user.algo = 'bcrypt';
  delete user.salt;
  save();
}

function publicUser(u) { return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, creado_en: u.creado_en }; }
function errorBody(codigo, mensaje, detalles = {}) { return { error: { codigo, mensaje, detalles } }; }

// ───────── App ─────────
const app = express();
app.set('trust proxy', 1); // Cloudflare/Coolify ponen X-Forwarded-For
app.disable('x-powered-by');

// Helmet: HSTS, X-Frame-Options:DENY, X-Content-Type-Options:nosniff, etc.
// CSP relajada para permitir estilos inline ya presentes en el frontend.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'https://ingweb3.agustinynatalia.site'],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin(origin, cb) {
    // Permitir requests sin Origin (curl, health-checks, server-to-server).
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS bloqueado: ${origin}`));
  },
  credentials: false,
}));

app.use(express.json({ limit: '10kb' }));

// Rate-limit en endpoints sensibles (login y register).
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json(errorBody('RATE_LIMITED', 'Demasiados intentos. Espera un minuto y vuelve a intentar.')),
});

// Middlewares de auth/rol
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
app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const { nombre, email, password } = req.body || {};
    if (!nombre || typeof nombre !== 'string' || nombre.length < 2 || nombre.length > MAX_LEN.nombre)
      return res.status(400).json(errorBody('NOMBRE_INVALIDO', `El nombre debe tener entre 2 y ${MAX_LEN.nombre} caracteres`));
    if (typeof email !== 'string' || email.length > MAX_LEN.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json(errorBody('EMAIL_INVALIDO', 'Formato de email no valido'));
    if (typeof password !== 'string' || password.length < 8 || password.length > MAX_LEN.password || !/[A-Z]/.test(password) || !/[0-9]/.test(password))
      return res.status(400).json(errorBody('PASSWORD_DEBIL', 'La contrasena requiere 8-128 caracteres con mayuscula y numero'));
    if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase()))
      return res.status(409).json(errorBody('EMAIL_DUPLICADO', 'Ya existe una cuenta con ese email'));

    const password_hash = await bcrypt.hash(password, BCRYPT_COST);
    const user = {
      id: 'u_' + randomUUID().slice(0, 8),
      nombre, email,
      password_hash,
      algo: 'bcrypt',
      rol: 'paciente',
      creado_en: new Date().toISOString(),
    };
    db.users.push(user); save();
    res.status(201).json(publicUser(user));
  } catch (e) { next(e); }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' ||
        email.length > MAX_LEN.email || password.length > MAX_LEN.password) {
      return res.status(401).json(errorBody('CREDENCIALES_INVALIDAS', 'Email o contrasena incorrectos'));
    }
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    // Si el usuario no existe igual hacemos una comparacion dummy para no filtrar via timing.
    if (!user) {
      await bcrypt.compare(password, '$2b$10$abcdefghijklmnopqrstuuW3xZGZbZ3rW2t4xZGZbZ3rW2t4xZGZbZ');
      return res.status(401).json(errorBody('CREDENCIALES_INVALIDAS', 'Email o contrasena incorrectos'));
    }
    const ok = await verificarPassword(user, password);
    if (!ok) return res.status(401).json(errorBody('CREDENCIALES_INVALIDAS', 'Email o contrasena incorrectos'));
    await migrarABcryptSiHaceFalta(user, password);
    const token = nuevoToken(user.id);
    res.json({ token, expiresIn: TTL_MS / 1000, user: publicUser(user) });
  } catch (e) { next(e); }
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
  if (motivo && (typeof motivo !== 'string' || motivo.length > MAX_LEN.motivo))
    return res.status(400).json(errorBody('MOTIVO_INVALIDO', `El motivo no puede superar ${MAX_LEN.motivo} caracteres`));
  const fecha_hora = `${fecha}T${hora}:00`;
  const margenMs = 24 * 60 * 60 * 1000;
  if (new Date(fecha_hora).getTime() + margenMs < Date.now())
    return res.status(400).json(errorBody('FECHA_PASADA', 'No puedes agendar en una fecha pasada'));
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
  const conNombre = citas.map(c => {
    const u = db.users.find(u => u.id === c.usuario_id);
    return { ...c, usuario_nombre: u ? u.nombre : '—' };
  });
  res.json(conNombre);
});

app.post('/api/admin/medicos', requireAuth, requireRol('admin', 'staff'), (req, res) => {
  const { nombre, especialidad } = req.body || {};
  if (!nombre || typeof nombre !== 'string' || nombre.length < 2 || nombre.length > MAX_LEN.nombre)
    return res.status(400).json(errorBody('NOMBRE_INVALIDO', `El nombre debe tener entre 2 y ${MAX_LEN.nombre} caracteres`));
  if (!especialidad || typeof especialidad !== 'string' || especialidad.length > 40)
    return res.status(400).json(errorBody('ESPECIALIDAD_INVALIDA', 'La especialidad es obligatoria'));
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

// ───────── Manejador global de errores ─────────
// Captura tanto el rechazo de CORS como cualquier excepcion no atrapada.
// En produccion no se devuelve el stack, en dev si.
app.use((err, req, res, next) => {
  if (err && err.message && err.message.startsWith('CORS bloqueado')) {
    return res.status(403).json(errorBody('CORS_BLOQUEADO', 'Origen no permitido'));
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json(errorBody('PAYLOAD_TOO_LARGE', 'Cuerpo de la peticion demasiado grande'));
  }
  const detalles = NODE_ENV === 'production' ? {} : { stack: err && err.stack };
  res.status(500).json(errorBody('ERROR_INTERNO', 'Algo salio mal', detalles));
});

app.listen(PORT, () => console.log(`API escuchando en http://localhost:${PORT}  [env=${NODE_ENV}]`));
