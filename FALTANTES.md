# FALTANTES — contexto para la próxima sesión

> Snapshot al cierre de la sesión del **2026-05-16**.
> Si retomamos este proyecto en otra conversación, este archivo te pone al día sin que tengas que reconstruir nada desde cero.

---

## 1. Lo que está hecho (no tocar a menos que lo pidas)

### 1.1 Hardening del backend (`server/server.js`)
- `helmet()` con CSP, HSTS, X-Frame, X-Content-Type-Options, Referrer-Policy.
- `app.disable('x-powered-by')`.
- `express-rate-limit` 5/min en `/auth/login` y `/auth/register`.
- `cors()` con allowlist por env `CORS_ORIGINS` (default: localhost + GitHub Pages + GitLab Pages).
- `bcrypt` cost=10 reemplaza SHA-256 + salt. **Migración silenciosa**: usuarios viejos se re-hashean al primer login exitoso.
- `crypto.timingSafeEqual` para comparar hashes legados; `bcrypt.compare` dummy cuando el email no existe (anti-enumeración por timing).
- `express.json({ limit: '10kb' })` + validación de longitud por campo (nombre 80, motivo 280, email 254, password 128).
- Manejador global de errores que no filtra `stack` en `NODE_ENV=production`.
- Dependencias nuevas: `bcrypt ^6.0.0`, `helmet ^8.1.0`, `express-rate-limit ^8.5.2`. `npm audit` reporta 0 vulnerabilidades.

### 1.2 SAST en GitLab CI (`.gitlab-ci.yml`)
- Stage `sast` añadida entre `validate` y `build`.
- Corre `semgrep/semgrep` Docker con rulesets: `p/javascript`, `p/nodejsscan`, `p/xss`, `p/expressjs`, `p/jwt`, `p/secrets`.
- Output JSON guardado como artifact por 1 mes.
- `allow_failure: true` — informa pero no bloquea el deploy.
- **Validar al hacer push**: el job debe aparecer en el pipeline de GitLab y producir `semgrep-report.json` descargable.

### 1.3 Entregables HTML publicados
Todos en `public/entregables/` y enlazados desde el portal `public/index.html`:

| Archivo | Tema | Status |
|---|---|---|
| `06-seguridad.html` | Modelo teórico OWASP (entregable original) | Sin tocar |
| `investigacion-seguridad.html` | Auditoría + pen-test + hardening con capturas | Creado en sesión previa |
| `09-analisis-seguridad.html` | **Guía práctica final (7 temas)** | Creado en esta sesión |

### 1.4 Documentación de respaldo (Markdown)
- `docs/seguridad/investigacion-seguridad.md` — fuente del HTML de hardening
- `docs/seguridad/analisis-seguridad.md` — fuente del HTML de la guía práctica
- `docs/seguridad/evidencia/*.txt` — 11 archivos con request/response curl crudos
- `docs/seguridad/capturas/*.png` — 13 capturas Playwright + ZAP
- `docs/seguridad/sast/` — JSON y texto crudo de Semgrep
- `docs/seguridad/dast/` — reportes ZAP HTML + JSON

### 1.5 Tooling instalado localmente
- Node 22.11 en `~/.local/node/bin/` (sin tocar el sistema).
- Playwright + Chromium portable en `~/.cache/ms-playwright/chromium-portable/`.
- Imágenes Docker: `semgrep/semgrep`, `zaproxy/zap-stable`.
- Script de capturas: `scripts/capturas.mjs`.

---

## 2. Lo que quedó como DEUDA documentada

Estos hallazgos están **identificados, evidenciados y priorizados** pero no se cerraron. La razón en cada uno está en la matriz V-### del entregable `09-analisis-seguridad.html`.

| ID | Hallazgo | Severidad | Por qué no se cerró | Cómo cerrarlo cuando se retome |
|---|---|---|---|---|
| **V-17** | Sin logging estructurado de seguridad | Media | Fuera de alcance de esta iteración | Añadir `pino` middleware a `server.js`. Emitir `request_id`, `user_id`, `endpoint`, `status`, `ip_truncada`. Coolify ya captura stdout |
| **V-10** | Header `Permissions-Policy` ausente | Baja | Fix simple pendiente | En `server.js` configurar `helmet` con `permittedCrossDomainPolicies` y `permissionsPolicy: { features: { camera: ["'none'"], microphone: ["'none'"], geolocation: ["'none'"] } }` |
| **V-18** | Token en `localStorage` (vulnerable a XSS) | Media | Requiere cambios coordinados frontend+backend | Cambiar `/api/auth/login` para emitir cookie `HttpOnly` `SameSite=Strict`. Reescribir `apiCall` en `app.js` para confiar en la cookie en vez del header `Authorization` |
| **V-19** | Sin verificación de email en registro | Baja | Requiere proveedor SMTP | Generar token de confirmación al registrarse, enviar correo, requerir verificación antes de permitir login. SMTP libre: Brevo / Resend / SendGrid free tier |
| **V-11** | CSP fallback ausente en 404 | Media (cosmético) | Impacto bajo | Añadir CSP también en el manejador 404 / global de errores en `server.js` |

---

## 3. Lo que queda pendiente del trabajo

### 3.1 Acciones que sí o sí requieren al usuario (yo no puedo)
- [ ] **Hacer `git push` para que el job SAST corra en GitLab CI**. Ya está commiteado y subido a GitHub; falta empujar a GitLab también si querés ver el pipeline ejecutándose con la nueva etapa.
- [ ] **Capturar el pipeline ejecutado en GitLab** y guardarlo como evidencia adicional (la guía pide "capturas del proceso de ejecución"). Se puede embeber esa captura en `09-analisis-seguridad.html` luego.
- [ ] **Redeploy del backend en Coolify** con el código hardened. Hoy el backend en `ingweb3.agustinynatalia.site` sigue siendo la versión **anterior** sin hardening — sólo el repo y el código local están hardened.

### 3.2 Mejoras opcionales para la próxima sesión
- [ ] Correr `zap-full-scan` (activo, ~5 min) en vez del baseline pasivo. Probablemente encuentre cosas que el baseline no.
- [ ] Excluir paths de ruido en ZAP con `-c .zap-config` (no escanear `.git/`, `node_modules/`, `docs/`).
- [ ] Configurar el deploy a GitHub Pages también si se quiere doble despliegue (hoy solo hay GitLab Pages workflow).
- [ ] Añadir `npm audit --audit-level=high` al `.gitlab-ci.yml` como step rápido en la stage `sast`.

---

## 4. Estructura final del proyecto (para orientarse rápido)

```
ingweb-corte3/
├── .gitlab-ci.yml              ← stage 'sast' añadida
├── README.md
├── CONTEXTO.md                 ← bitácora general del proyecto
├── FALTANTES.md                ← este archivo
│
├── public/                     ← se publica en GitLab Pages
│   ├── index.html              ← portal con tarjetas a cada entregable
│   ├── css/styles.css
│   ├── app/                    ← SPA cliente
│   └── entregables/
│       ├── 01-arquitectura.html
│       ├── 02-api.html
│       ├── 03-scrum.html
│       ├── 04-despliegue.html
│       ├── 05-calidad.html
│       ├── 06-seguridad.html
│       ├── 07-riesgos.html
│       ├── 08-evaluacion.html
│       ├── investigacion-seguridad.html   ← Fase 5 ampliada (sesión previa)
│       ├── 09-analisis-seguridad.html     ← Guía práctica final (esta sesión)
│       ├── capturas-seguridad/            ← imágenes para investigacion-seguridad.html
│       └── analisis-seguridad/            ← imágenes + reportes ZAP HTML
│
├── server/                     ← backend Node.js + Express
│   ├── server.js               ← hardened
│   ├── package.json            ← +helmet, +rate-limit, +bcrypt
│   ├── package-lock.json
│   └── data.json               ← gitignore (datos de demo)
│
├── docs/                       ← Markdown de respaldo
│   ├── 01-arquitectura.md
│   └── seguridad/
│       ├── investigacion-seguridad.md
│       ├── analisis-seguridad.md
│       ├── evidencia/          ← 11 .txt con curl crudo
│       ├── capturas/           ← 13 .png Playwright + ZAP
│       ├── sast/               ← semgrep-*.json + console output
│       └── dast/               ← zap_report.html + zap_api_report.html + JSONs
│
└── scripts/
    ├── package.json
    ├── package-lock.json
    └── capturas.mjs            ← script Playwright para regenerar capturas
```

---

## 5. Comandos clave para retomar rápido

```bash
# Levantar backend hardened
export PATH="$HOME/.local/node/bin:$PATH"
cd server && PORT=3030 NODE_ENV=development \
  CORS_ORIGINS="http://localhost:8080,http://127.0.0.1:8080" \
  node server.js

# Servir el frontend
python3 -m http.server 8080
# Abrir http://localhost:8080/public/index.html

# Regenerar capturas
cd scripts && node capturas.mjs

# Correr SAST de nuevo
docker run --rm -v "$PWD":/src:ro semgrep/semgrep semgrep scan \
  --config=p/javascript --config=p/nodejsscan --config=p/xss --config=p/expressjs \
  --severity WARNING --severity ERROR server/ public/

# Correr DAST de nuevo
cd docs/seguridad/dast
docker run --rm --network=host -v "$PWD":/zap/wrk/:rw -t zaproxy/zap-stable \
  zap-baseline.py -t http://localhost:3030/ \
  -r zap_api_report.html -J zap_api_report.json -I
```

---

## 6. Decisiones tomadas (para no volver a discutirlas)

1. **Stack de herramientas**: OWASP ZAP (DAST) + Semgrep (SAST). Descartado SonarQube por sobredimensionado.
2. **Hashing**: bcrypt cost=10 con migración silenciosa. Descartado Argon2 por ser overkill y agregar una dep extra.
3. **CORS**: allowlist por env, default cubre localhost + dominios `*.gitlab.io` y `*.github.io` del proyecto.
4. **Logging**: pendiente — opción favorita es `pino` a stdout. NO se usará logging dual a archivo + stdout.
5. **Token storage**: pendiente migrar a cookie `HttpOnly`. Por ahora `localStorage` se acepta como deuda consciente.
6. **CI**: SAST `allow_failure: true` para no bloquear deploy. La decisión de cerrar hallazgos es del equipo.

---

## 7. Si algo no funciona

| Síntoma | Causa probable | Solución |
|---|---|---|
| `node: command not found` | PATH no exportado | `export PATH="$HOME/.local/node/bin:$PATH"` |
| `EADDRINUSE` en puerto 3000 | Coolify proxy local | Usar `PORT=3030` |
| ZAP `network unreachable` | Olvido `--network=host` | Añadir el flag |
| Semgrep `error: unknown option` | Imagen vieja | `docker pull semgrep/semgrep` |
| Capturas Playwright fallan | Chromium portable no descargado | Re-descargar de Playwright Azure CDN |
| Pipeline SAST falla | Imagen `returntocorp/semgrep` deprecada | Cambiar a `semgrep/semgrep` |
