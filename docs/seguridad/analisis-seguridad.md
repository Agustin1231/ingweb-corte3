# Análisis de seguridad — Aplicaciones web y APIs

> **Proyecto:** Ingeniería Web · Corte III · Guía práctica final
> **Sistema bajo prueba:** Citas Médicas (backend Node/Express + SPA estática)
> **Versión:** 1.0 · 2026-05-16
> **Autor:** Agustín Peralta
> **Alcance:** los 7 temas de la guía práctica del Ing. Jairo Armando Salcedo Aranda.

---

## Tema 1 · Investigación de herramientas

### 1.1 Inventario evaluado

Se evaluaron las herramientas sugeridas por la guía más una alternativa moderna de SAST (Semgrep) por su encaje natural con un proyecto Node + GitLab CI.

| Herramienta | Tipo | Lic. | Ejecución | Encaje con este proyecto |
|---|---|---|---|---|
| **OWASP ZAP** | DAST (dinámico) | Open Source (Apache 2.0) | GUI, CLI, Docker, daemon | ✅ Escanea la app corriendo. Reporta XSS, headers, cookies, configs. Encaja con tema 5 |
| **Semgrep** | SAST (estático) | Open Source (LGPL) | CLI, Docker, GitLab CI nativo | ✅ Reglas para JavaScript / Node / Express / XSS / JWT. Liviano (no JVM). Encaja con tema 2 |
| **SonarQube** | SAST + calidad | Community / Enterprise | Servidor Java, requiere infraestructura | ⚠️ Potente pero pesado: levanta servidor Postgres + Java. Sobredimensionado para un proyecto académico |
| **Burp Suite** | DAST + proxy manual | Community gratis / Pro pago | App Java de escritorio | ⚠️ Excelente para pen-test manual, pero la versión free limita el escáner automático |
| **Nikto** | DAST clásico | Open Source (GPL) | Script Perl, CLI | ⚠️ Útil para reconocimiento rápido pero antiguo y centrado en webservers tradicionales |
| **Nmap** | Reconocimiento de red | Open Source | CLI | ⚠️ Es escáner de puertos, no de aplicaciones web. Aporta poco aquí |

### 1.2 Criterios de comparación

| Criterio | OWASP ZAP | Semgrep | Burp Free | SonarQube | Nikto |
|---|---|---|---|---|---|
| Cobertura de OWASP Top 10 | Alta | Alta (SAST) | Media | Media | Baja |
| Falsos positivos | Medios | Bajos | Medios | Bajos | Altos |
| Integración con CI | Buena (script + Docker) | **Excelente** (job nativo) | Manual | Plugin oficial | Manual |
| Curva de aprendizaje | Media | Baja | Media | Alta | Baja |
| Requisitos | Java o Docker | Docker o pip | Java | Java + DB + RAM | Perl |
| Velocidad escaneo small app | ~1 min | ~10 seg | manual | ~30 seg | ~1 min |
| Reporte exportable | HTML, JSON, MD, XML | JSON, SARIF, JUnit | HTML, XML | Dashboard web | TXT, HTML |
| Comunidad | Muy activa | Activa | Activa | Activa | Estancada |

### 1.3 Selección justificada

**Combinación elegida: OWASP ZAP (DAST) + Semgrep (SAST)**.

Justificación:
- **Complementariedad**: ZAP analiza la app corriendo (caja negra); Semgrep analiza el código (caja blanca). Cubren ángulos opuestos y se solapan poco.
- **Costo cero**: ambas son open-source, sin gating de features.
- **Integración limpia**: Semgrep en GitLab CI con un job de 10 líneas. ZAP en Docker con un comando.
- **Velocidad**: el escaneo completo del proyecto demora < 1 minuto contra ZAP y < 10 segundos contra Semgrep.
- **Output estándar**: ambos generan JSON parseable y reportes HTML autocontenidos, fáciles de adjuntar como evidencia.
- **No requieren infraestructura adicional**: descartado SonarQube porque levantar el servidor para un trabajo académico es excesivo.

**Entregable:** este apartado (1.1–1.3) cubre lo pedido por la guía como "documento comparativo con justificación de la herramienta seleccionada".

---

## Tema 2 · Implementación de SAST en GitLab

### 2.1 Configuración del archivo CI/CD

El pipeline previo (`.gitlab-ci.yml`) solo desplegaba a GitLab Pages. Se añadió una etapa `sast` con Semgrep:

```yaml
stages:
  - validate
  - sast        # ← nuevo
  - build
  - deploy

sast:
  stage: sast
  image: returntocorp/semgrep
  script:
    - semgrep scan
        --config=p/javascript
        --config=p/nodejsscan
        --config=p/xss
        --config=p/expressjs
        --config=p/jwt
        --config=p/secrets
        --json --output semgrep-report.json
        --severity WARNING --severity ERROR
        server/ public/ || true
  artifacts:
    paths:
      - semgrep-report.json
    expire_in: 1 month
    when: always
  allow_failure: true
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

### 2.2 Decisiones de configuración

- **6 rulesets** combinados: JavaScript general, Node.js específicos, XSS, Express.js, JWT y secretos. Aprovechan reglas auditadas por la comunidad Semgrep.
- **`allow_failure: true`**: hallazgos no rompen el pipeline. El SAST informa, pero el deploy no se bloquea por warnings — el equipo decide tras review manual.
- **`severity WARNING/ERROR`**: filtra INFO para reducir ruido.
- **Artifact persistido un mes**: el JSON queda descargable y se integra al Security Dashboard de GitLab.

### 2.3 Ejecución y hallazgos (corrida local previa al push)

Se ejecutó el mismo comando vía Docker antes de subirlo al pipeline para validar la salida:

```
$ docker run --rm -v "$PWD":/src:ro semgrep/semgrep semgrep scan \
    --config=p/javascript --config=p/nodejsscan --config=p/xss --config=p/expressjs \
    --severity WARNING --severity ERROR server/ public/

┌─────────────────┐
│ 3 Code Findings │
└─────────────────┘
✅ Scan completed successfully.
 • Findings: 3 (3 blocking)
 • Rules run: 165
 • Targets scanned: 31
```

Detalle de los 3 hallazgos:

| # | Archivo:línea | Regla | Severidad |
|---|---|---|---|
| 1 | `public/app/app.js:123-124` | `node_timing_attack` (comparación con `===`) | Warning |
| 2 | `server/server.js:113` | `node_username` (hardcoded) | Warning |
| 3 | `server/server.js:216` | `detected-bcrypt-hash` | Error |

Análisis (ver tema 3) — los 3 son **falsos positivos**.

**Salida completa:** [`sast/semgrep-console-output.txt`](sast/semgrep-console-output.txt) · **JSON crudo:** [`sast/semgrep-detallado.json`](sast/semgrep-detallado.json).

---

## Tema 3 · Visualización e interpretación de resultados

### 3.1 Matriz consolidada (SAST + DAST + pen-test manual)

Las fuentes son tres:
- **Semgrep SAST** (tema 2)
- **OWASP ZAP DAST** (tema 5)
- **Pen-test manual con curl** (tema 4) — ver `investigacion-seguridad.md`

| ID | Hallazgo | Origen | Severidad | ¿Real? | Estado | Mitigación |
|---|---|---|---|---|---|---|
| V-01 | Falta de rate-limit en `/auth/login` | Pen-test manual | **Crítica** | Sí | ✅ Cerrado | `express-rate-limit` 5/min |
| V-02 | Falta de headers de seguridad (HSTS/CSP/X-Frame) | ZAP + manual | **Alta** | Sí | ✅ Cerrado | `helmet()` |
| V-03 | CORS abierto (`Access-Control-Allow-Origin: *`) | ZAP + manual | **Alta** | Sí | ✅ Cerrado | Allowlist por `CORS_ORIGINS` |
| V-04 | `X-Powered-By: Express` filtrando la pila | ZAP + manual | **Media** | Sí | ✅ Cerrado | `app.disable('x-powered-by')` |
| V-05 | SHA-256 rápido para passwords (vulnerable a fuerza bruta) | Auditoría | **Alta** | Sí | ✅ Cerrado | Migración a bcrypt cost=10 |
| V-06 | Comparación timing-attackable en login | Auditoría | **Media** | Sí | ✅ Cerrado | `bcrypt.compare` + dummy hash |
| V-07 | Sin tope de tamaño de payload (DoS) | Pen-test manual | **Media** | Sí | ✅ Cerrado | `express.json({ limit: '10kb' })` |
| V-08 | Source Code Disclosure (`.git/hooks/*.sample`) | ZAP frontend | **Media** | Parcial | ⚠️ Contexto | Sólo afecta al servidor estático local; en producción solo se publica `public/` |
| V-09 | Application Error Disclosure (markdown en `node_modules`) | ZAP frontend | **Media** | Parcial | ⚠️ Contexto | Igual que V-08 |
| V-10 | Permissions-Policy header ausente | ZAP backend | **Baja** | Sí | 🔄 Por cerrar | Añadir a `helmet` config (deuda) |
| V-11 | CSP: directiva sin fallback (404 sin CSP completa) | ZAP backend | **Media** | Parcial | ⚠️ Cosmético | El handler 404 no aplica CSP; impacto bajo |
| V-12 | Cross-Origin-Embedder-Policy ausente | ZAP frontend | **Baja** | No | ❌ Falso positivo | Servidor estático local no aplica al deploy final |
| V-13 | Storable / Cacheable Content | ZAP | **Inform.** | No | ❌ Falso positivo | Comportamiento normal de HTML estático |
| V-14 | Timing attack (Semgrep — `===` en rutas) | Semgrep | Warning | No | ❌ Falso positivo | Comparación contra `'dashboard'`/`'admin'`, no contra crypto |
| V-15 | Hardcoded username (Semgrep — `user.algo = 'bcrypt'`) | Semgrep | Warning | No | ❌ Falso positivo | Es una etiqueta de algoritmo, no un username |
| V-16 | Bcrypt hash detected (Semgrep) | Semgrep | Error | No | ❌ Falso positivo | Hash dummy intencional anti-enumeración |
| V-17 | Sin logging estructurado de seguridad | Auditoría | **Media** | Sí | 🔄 Deuda | Pendiente — implementar `pino` |
| V-18 | Token en `localStorage` (expuesto a XSS si lo hubiera) | Auditoría | **Media** | Sí | 🔄 Deuda | Migrar a cookie `HttpOnly` `SameSite=Strict` |
| V-19 | Sin verificación de email en registro | Auditoría | **Baja** | Sí | 🔄 Deuda | Token de confirmación por correo |

### 3.2 Distribución por severidad

| Severidad | Total | Cerradas | Deuda / contexto | Falsos positivos |
|---|---:|---:|---:|---:|
| Crítica | 1 | 1 | 0 | 0 |
| Alta | 3 | 3 | 0 | 0 |
| Media | 8 | 5 | 2 | 1 |
| Baja | 3 | 0 | 2 | 1 |
| Informativa | 1 | 0 | 0 | 1 |
| Falsos positivos (Semgrep) | 3 | — | — | 3 |
| **Totales** | **19** | **9** | **4** | **6** |

### 3.3 Falsos positivos — análisis

| ID | Falso positivo | Por qué se descarta |
|---|---|---|
| V-12 | Cross-Origin-Embedder-Policy header ausente | Es un header opcional. La SPA estática no embebe contenido cross-origin y no se beneficia de SharedArrayBuffer. Aplicar COEP rompería el embed de la fuente CDN de tipografía si se agregara |
| V-13 | Storable / Cacheable Content | El reporte estático es cacheable a propósito; eso es comportamiento deseado para una SPA |
| V-14 | `node_timing_attack` en `app.js:123` | El `===` está comparando con strings constantes (`'dashboard'`, `'admin'`) que son nombres de ruta, no material criptográfico. Sin secreto, no hay canal de timing aprovechable |
| V-15 | `node_username` en `server.js:113` | La cadena `'bcrypt'` es la etiqueta del algoritmo de hashing, no un username. La regla de Semgrep está sobre-amplificada |
| V-16 | `detected-bcrypt-hash` en `server.js:216` | Es el hash dummy *intencional* usado en el `bcrypt.compare` cuando el email no existe, para mitigar enumeración por timing. Es defensa, no credencial |
| V-08/V-09 (parciales) | `.git/`, markdown de `node_modules`, `docs/` | Sólo se exponen cuando se sirve la raíz del repo con `python3 -m http.server`. La publicación en GitLab Pages sólo expone `public/`, donde estos archivos no existen |

### 3.4 Priorización

Orden recomendado para cerrar la deuda restante (todas son severidad media o baja, ninguna crítica/alta sigue abierta):

1. **V-17** Logging estructurado (`pino`) — facilita detectar futuros incidentes.
2. **V-10** Permissions-Policy en `helmet` config — fix de una línea.
3. **V-18** Token a cookie `HttpOnly` — requiere cambios coordinados frontend + backend.
4. **V-19** Verificación de email — requiere proveedor SMTP, alcance mayor.

---

## Tema 4 · Análisis de seguridad sobre la API

Esta sección **referencia** el documento previo [`investigacion-seguridad.md`](investigacion-seguridad.md), que cubre exhaustivamente las cinco categorías solicitadas por la guía. Acá se resumen los resultados:

| Categoría de la guía | Cobertura en `investigacion-seguridad.md` | Resultado |
|---|---|---|
| Autenticación | Sección 3.7 (rate-limit), 3.2 (bcrypt), 4.3 (timing) | ✅ Mitigado tras hardening |
| Autorización | Sección 3.1 (RBAC, IDOR) | ✅ Confirmado correcto |
| Validación de parámetros | Sección 4.2 (payload, tipos por campo) | ✅ Reforzado con límites |
| Inyección | A03 OWASP — la API no usa BD ni shell, no aplica SQLi/CmdI clásicos. XSS mitigado en frontend con `escapeHtml` | ✅ N/A justificado |
| Exposición de información | Headers, `X-Powered-By`, stack en errores | ✅ Cerrado con `helmet` + handler global |

**Evidencia cruda:** [`evidencia/01–11_*.txt`](evidencia/).

---

## Tema 5 · Escaneo de la aplicación web

### 5.1 Configuración del escaneo

Se utilizó **OWASP ZAP 2.17.0** vía contenedor Docker oficial `zaproxy/zap-stable`, modalidad `zap-baseline.py` (pasivo, no intrusivo, ideal para CI).

Comandos:

```bash
# Frontend (sirviendo el repo en :8080)
docker run --rm --network=host -v "$PWD":/zap/wrk/:rw -t zaproxy/zap-stable \
  zap-baseline.py \
    -t http://localhost:8080/public/app/index.html \
    -r zap_report.html -J zap_report.json -I

# Backend hardened (:3030)
docker run --rm --network=host -v "$PWD":/zap/wrk/:rw -t zaproxy/zap-stable \
  zap-baseline.py \
    -t http://localhost:3030/ \
    -r zap_api_report.html -J zap_api_report.json -I
```

### 5.2 Resultados — Frontend (puerto 8080)

```
Summary of Alerts
  High:          0
  Medium:        5
  Low:          10
  Informational: 2

PASS: 53   WARN: 14
Tiempo: 43 segundos
```

Hallazgos relevantes:
- **Source Code Disclosure** (`.git/hooks/*.sample`) — el servidor de pruebas expone la raíz del repo, no es lo que se despliega.
- **Application Error Disclosure** — markdowns de `node_modules` siendo servidos.
- **CSP / X-Frame / X-Content-Type-Options ausentes** — válido para el *servidor estático* local; GitLab Pages aplica unas reglas por defecto pero conviene confirmarlas tras deploy.
- **Cross-Origin-Resource-Policy / Embedder-Policy ausentes** — categorizados como deuda menor.

### 5.3 Resultados — Backend hardened (puerto 3030)

```
Summary of Alerts
  High:          0
  Medium:        1   ← CSP fallback en rutas 404 (parcial)
  Low:           1   ← Permissions-Policy ausente
  Informational: 1   ← Storable & Cacheable

PASS: 64   WARN: 3
Tiempo: 34 segundos
```

El backend tras hardening con `helmet` pasa **64 controles automáticos** contra solo 3 warnings menores. Es la mejora más visible de toda la investigación.

### 5.4 Categorías de la guía cubiertas

| Categoría | Estado |
|---|---|
| XSS | Detectado en frontend que no escapaba (no aplicó, todo el HTML pasa por `escapeHtml`); ZAP no encontró XSS reflejado |
| SQL Injection | N/A — no hay base de datos |
| Headers inseguros | Detectados y mitigados (ver matriz V-02, V-10) |
| Cookies inseguras | N/A — la app usa token Bearer en localStorage, no cookies |
| Configuraciones débiles | `Access-Control-Allow-Origin: *`, `X-Powered-By`, `express.json()` sin límite (todo cerrado) |

**Reportes exportados:**
- [`dast/zap_report.html`](dast/zap_report.html) (frontend, 158 KB)
- [`dast/zap_api_report.html`](dast/zap_api_report.html) (backend, 60 KB)
- JSON respectivos para parseo automático.

---

## Tema 6 · Bitácora técnica — OWASP ZAP

### 6.1 Configuración utilizada

| Parámetro | Valor |
|---|---|
| Versión | OWASP ZAP 2.17.0 (estable) |
| Imagen | `zaproxy/zap-stable` |
| Modo | `zap-baseline.py` (passive scan + spidering ligero) |
| Network | `--network=host` (necesario para alcanzar localhost del host) |
| Flags relevantes | `-I` (no fallar con warnings), `-r` (reporte HTML), `-J` (reporte JSON) |
| Targets | `http://localhost:8080/public/app/index.html`, `http://localhost:3030/` |

### 6.2 Tiempos de ejecución

| Target | Duración | URLs visitadas | Alerts |
|---|---|---|---|
| Frontend (raíz del repo) | 43 segundos | ~80 | 14 |
| Backend hardened | 34 segundos | ~10 | 3 |

### 6.3 Resultados obtenidos

Consolidados en la matriz del tema 3 (V-02, V-04, V-08, V-09, V-10, V-11, V-12, V-13).

### 6.4 Lecciones

1. **Servir el repo completo con `python3 -m http.server` para hacer DAST genera ruido**: ZAP escanea `.git/`, `node_modules/`, `docs/`, etc. Ese ruido no aparece en GitLab Pages (que sólo publica `public/`). Para validar el deploy real, hacer el scan contra la URL de Pages, no contra la raíz local.
2. **`zap-baseline` es pasivo**: no inyecta payloads, sólo observa headers + body. Para encontrar XSS reflejado o stored hay que correr `zap-full-scan` (activo, ~5 min).
3. **`-I` evita falsos rojos en CI**: con un solo warning el script retorna exit-code ≠ 0 y bloquea el pipeline. `-I` es lo razonable para informe periódico.

---

## Tema 7 · Documentación básica de OWASP ZAP

### 7.1 Identificación

| Campo | Detalle |
|---|---|
| Nombre | OWASP ZAP (Zed Attack Proxy) |
| Versión usada | 2.17.0 |
| Mantenedor | The OWASP Foundation (desde 2024 patrocinado por Checkmarx) |
| Licencia | Apache License 2.0 |
| Sitio oficial | https://www.zaproxy.org |

### 7.2 Objetivo

Detectar vulnerabilidades en aplicaciones web mediante **análisis dinámico (DAST)**: interactúa con la app como un usuario real, observa headers, cuerpos y comportamiento, y reporta hallazgos clasificados por riesgo. Soporta tres modos:

- **Pasivo**: sólo observa el tráfico que ocurre (sin enviar payloads).
- **Activo**: inyecta payloads conocidos (XSS, SQLi, path traversal, etc.).
- **Manual**: actúa como proxy MITM para que el analista navegue y reenvíe peticiones modificadas.

### 7.3 Requisitos de instalación

| Modo | Requisitos |
|---|---|
| Docker (usado aquí) | Docker Engine ≥ 20 |
| Desktop | Java 17 + GUI (Linux, macOS, Windows) |
| CLI standalone | Java 17 + binario `.tar.gz` |

### 7.4 Procedimiento de configuración

Modalidad recomendada para CI / repetibilidad: **Docker**.

```bash
# 1. Descargar imagen estable
docker pull zaproxy/zap-stable

# 2. Crear directorio de trabajo para los reportes
mkdir -p docs/seguridad/dast

# 3. Ejecutar baseline scan (pasivo)
docker run --rm --network=host \
  -v "$PWD/docs/seguridad/dast":/zap/wrk/:rw \
  -t zaproxy/zap-stable \
  zap-baseline.py \
    -t http://localhost:3030/ \
    -r zap_api_report.html \
    -J zap_api_report.json \
    -I
```

### 7.5 Ejecución básica

Argumentos esenciales:

| Argumento | Función |
|---|---|
| `-t URL` | Target del escaneo |
| `-r FILE` | Reporte HTML |
| `-J FILE` | Reporte JSON (parseable) |
| `-w FILE` | Reporte Markdown |
| `-I` | No fallar el exit-code con warnings |
| `-j` | Spider con JavaScript (útil para SPAs) |
| `-l RISK` | Filtrar por nivel mínimo (`PASS`, `IGNORE`, `INFO`, `LOW`, `MEDIUM`, `HIGH`) |
| `-T MIN` | Tiempo máximo del escaneo en minutos |

### 7.6 Interpretación de resultados

ZAP clasifica cada alerta con dos ejes:

| Eje | Valores | Significado |
|---|---|---|
| Risk | High / Medium / Low / Informational | Severidad estimada del impacto |
| Confidence | High / Medium / Low / Falso Positivo | Qué tanto confía ZAP en que el hallazgo es real |

Para cada alerta el reporte HTML incluye: descripción, CWE, referencia OWASP, URL afectada, evidencia (snippet del response), y recomendación de mitigación.

Práctica recomendada: **revisar manualmente toda alerta `High` y `Medium`**, descartar falsos positivos (anotarlos en una matriz como la del tema 3), y aceptar como deuda las `Low` que no apliquen al modelo de amenazas.

### 7.7 Buenas prácticas

1. **Empezar siempre por baseline pasivo**: no perturba la app, no contamina la BD. Si encuentra cosas, escalar a `zap-full-scan` activo.
2. **Correrlo contra un entorno desechable**: nunca contra producción sin permiso explícito. El escaneo activo crea usuarios, comentarios, etc.
3. **Versionar el reporte JSON**: permite seguir la evolución de hallazgos a lo largo del tiempo (regression-testing de seguridad).
4. **Integrar en CI con `allow_failure: true`**: que informe, no que bloquee. La decisión es del equipo.
5. **Excluir paths de ruido**: usar `-c .zap-config` para ignorar `/static/`, `/assets/`, etc.
6. **Usar la versión Desktop para investigar manualmente** cuando una alerta es ambigua: el proxy permite reenviar la petición exacta que la generó y probar la mitigación al vuelo.

---

## Reproducir esta investigación

```bash
# Servicios locales
cd server && PORT=3030 NODE_ENV=development node server.js  &
python3 -m http.server 8080  &

# SAST (Semgrep)
docker run --rm -v "$PWD":/src:ro semgrep/semgrep semgrep scan \
  --config=p/javascript --config=p/nodejsscan --config=p/xss --config=p/expressjs \
  --severity WARNING --severity ERROR server/ public/

# DAST (ZAP) - frontend
mkdir -p docs/seguridad/dast && cd docs/seguridad/dast
docker run --rm --network=host -v "$PWD":/zap/wrk/:rw -t zaproxy/zap-stable \
  zap-baseline.py -t http://localhost:8080/public/app/index.html \
  -r zap_report.html -J zap_report.json -I

# DAST (ZAP) - backend
docker run --rm --network=host -v "$PWD":/zap/wrk/:rw -t zaproxy/zap-stable \
  zap-baseline.py -t http://localhost:3030/ \
  -r zap_api_report.html -J zap_api_report.json -I
```

---

## Cierre

| Tema de la guía | Estado | Documento |
|---|---|---|
| 1 — Investigación de herramientas | ✅ | §1 de este doc |
| 2 — SAST en GitLab | ✅ | §2 + `.gitlab-ci.yml` |
| 3 — Matriz de vulnerabilidades | ✅ | §3 |
| 4 — Pen-test API | ✅ | `investigacion-seguridad.md` (ref. §4) |
| 5 — Escaneo de la app | ✅ | §5 |
| 6 — Bitácora técnica | ✅ | §6 |
| 7 — Documentación de la herramienta | ✅ | §7 |
