# INGENIERÍA WEB — CORTE III
## Sistema Web de Gestión de Citas Médicas para una Clínica

> **Docente:** Ing. Jairo Armando Salcedo Aranda
> **Entrega final:** Miércoles 6 de mayo de 2026
> **Evaluación:** Checklist por fases
> **Despliegue:** GitLab Pages
> **Enfoque del proyecto:** la **ingeniería detrás de la web** (arquitectura, calidad, seguridad, riesgos, metodología). El stack es solo un vehículo — lo que se evalúa es **cómo está pensado y documentado** el sistema.

---

## 0. Filosofía del proyecto

Este proyecto NO se evalúa por la sofisticación del código ni por el framework usado. Se evalúa por:

1. **Arquitectura clara** y bien justificada (cliente-servidor, modularidad, separación de responsabilidades).
2. **Documentación de ingeniería** (diagramas, decisiones, trazabilidad).
3. **Aplicación de estándares** (ISO 25010, OWASP, Security by Design).
4. **Metodología visible** (Scrum, sprints, control de versiones con Git).
5. **Análisis de riesgos** y medidas preventivas.
6. **Calidad y seguridad** demostrables, no solo declaradas.

> Regla de oro: cada decisión técnica debe poder justificarse desde la **ingeniería de software**, no desde la moda tecnológica.

---

## 1. Resumen del caso

Una clínica necesita digitalizar su proceso manual de asignación de citas. La solución web debe permitir:

- Registro / autenticación de pacientes.
- Agendamiento, consulta y cancelación de citas.
- Panel administrativo para gestionar la operación.

El producto final es **la documentación de ingeniería + una aplicación funcional desplegada** que evidencie esos conceptos.

---

## 2. Mapa de conceptos de ingeniería web a evidenciar

Cada concepto del crucigrama se traduce en un **artefacto de ingeniería** dentro del proyecto:

| Concepto | Cómo se evidencia en el proyecto |
|----------|----------------------------------|
| Web 2.0 | Aplicación dinámica con interacción usuario-servidor (no sitio estático). |
| Cliente-Servidor | Diagrama de arquitectura con frontend y backend separados. |
| W3C | Uso de HTML semántico, validación W3C, accesibilidad. |
| Modularidad | Separación en módulos (usuarios, citas, admin) documentada. |
| Backend | Capa de lógica/datos descrita en el diagrama y en el código. |
| API | Documento con endpoints (`/auth`, `/citas`, `/admin`) tipo contrato. |
| Git | Historial de commits + ramas por sprint en GitLab. |
| Scrum | Tablero/lista de sprints con historias de usuario y entregables. |
| Nube | Despliegue real en GitLab Pages con URL pública. |
| Mantenibilidad | Código modular + README + convenciones documentadas. |
| ISO 25010 | Informe de calidad cubriendo las 8 características. |
| Análisis de riesgos | Matriz de riesgos (probabilidad × impacto + mitigación). |
| UX | Flujo de usuario documentado + criterios de usabilidad. |
| Testing | Plan de pruebas + casos ejecutados + resultados. |
| Confidencialidad | Política de manejo de datos personales documentada. |
| OWASP | Revisión del Top 10 con estado en el proyecto. |
| Security by Design | Decisiones de seguridad desde el diseño, no parches. |
| Cifrado | Hash de contraseñas + HTTPS documentado. |
| Autenticación | Flujo de login + control de acceso por roles. |
| Prevención | Validación de inputs + manejo de errores + backups. |

---

## 3. Arquitectura (Fase 1)

### 3.1 Vista general (cliente-servidor)

```
┌────────────────────────┐    HTTPS / JSON     ┌────────────────────────┐
│      FRONTEND          │ ──────────────────► │      BACKEND / API     │
│  (capa de presentación)│                     │  (capa de lógica)      │
│  - Vistas              │ ◄────────────────── │  - Reglas de negocio   │
│  - Validación de UX    │                     │  - Validación de datos │
│  - Consumo de API      │                     │  - Autenticación       │
└────────────────────────┘                     └───────────┬────────────┘
                                                           │
                                                           ▼
                                               ┌────────────────────────┐
                                               │     PERSISTENCIA       │
                                               │  (capa de datos)       │
                                               └────────────────────────┘
```

### 3.2 Modularidad

| Módulo | Responsabilidad | Endpoints clave |
|--------|----------------|-----------------|
| Usuarios | Registro, login, perfil, roles | `/auth/register`, `/auth/login`, `/usuarios/:id` |
| Citas | CRUD de citas, validación de disponibilidad | `/citas`, `/citas/:id`, `/disponibilidad` |
| Administrativo | Gestión de horarios, médicos, reportes | `/admin/citas`, `/admin/medicos`, `/admin/reportes` |

### 3.3 Principios de diseño aplicados

- **Separación de responsabilidades** (presentación / lógica / datos).
- **Bajo acoplamiento, alta cohesión** (cada módulo independiente).
- **Security by Design** (autenticación y validación desde el inicio).
- **Escalabilidad horizontal** (frontend estático + API independiente).

**Entregable:** `/docs/arquitectura.md` con diagrama + justificación.

---

## 4. Roadmap por fases (lo que evalúa el docente)

### Fase 0 — Setup
- [ ] Repositorio en GitLab inicializado.
- [ ] Estructura de carpetas (`/app`, `/docs`, `/public`).
- [ ] `README.md` con descripción de ingeniería.
- [ ] `.gitlab-ci.yml` con job `pages`.

### Fase 1 — Definición y arquitectura
- [x] Diagrama cliente-servidor.
- [x] Definición de módulos y responsabilidades.
- [x] Justificación de decisiones arquitectónicas.
- **Entregable:** `/docs/01-arquitectura.md` ✅

### Fase 2 — Desarrollo (Scrum + Git + API)
- [x] **Contrato de la API** (`02-api.html`): endpoints, auth, errores, modelos.
- [x] **Scrum + Git** (`03-scrum.html`): roles, sprints, 14 historias, branching, kanban.
- [x] Sprint 1 — Autenticación (4 historias, 12 SP).
- [x] Sprint 2 — Citas (5 historias, 18 SP).
- [x] Sprint 3 — Panel admin (5 historias, 17 SP).
- **Entregable:** dos páginas web (API + Scrum) + historial Git por sprint. ✅

### Fase 3 — Despliegue (Nube)
- [x] Pipeline `.gitlab-ci.yml` listo (3 stages: validate, build, deploy).
- [x] Página `04-despliegue.html` con SVG del pipeline.
- [x] Documentar el proceso de despliegue (modelo, costos, rollback, monitoreo).
- **Entregable:** `04-despliegue.html` ✅

### Fase 4 — Calidad del software (ISO 25010)
- [x] Las 8 características evaluadas con score (radar SVG).
- [x] Plan de pruebas (4 niveles).
- [x] 15 casos de prueba ejecutados (todos PASS).
- [x] Métricas Lighthouse, TTFB, validación W3C.
- [x] UX y accesibilidad documentadas.
- **Entregable:** `05-calidad.html` ✅

### Fase 5 — Seguridad web (OWASP + Security by Design)
- [x] OWASP Top 10 analizado (10 riesgos con estado).
- [x] Defensa en profundidad (SVG con 7 capas).
- [x] Autenticación, autorización RBAC, cifrado, headers.
- [x] Plan de respuesta a incidentes.
- **Entregable:** `06-seguridad.html` ✅

### Fase 6 — Gestión de riesgos
- [x] 8 riesgos identificados y clasificados.
- [x] Matriz visual SVG 5×5 (probabilidad × impacto).
- [x] Plan de mitigación por riesgo + riesgos residuales.
- **Entregable:** `07-riesgos.html` ✅

### Fase 7 — Evaluación final
- [x] Checklist consolidado de las 7 fases.
- [x] Trazabilidad de los 20 conceptos del crucigrama.
- [x] Cumplimiento global con barras SVG.
- [x] Repo con README, .gitignore y .gitlab-ci.yml.
- **Entregable:** `08-evaluacion.html` ✅

---

## 5. Glosario del crucigrama (Quiz I)

| # | Pista | Término |
|---|-------|---------|
| 1 | Evolución de la web hacia aplicaciones dinámicas | **Web 2.0** |
| 2 | Arquitectura que separa cliente y servidor | **Cliente-Servidor** |
| 3 | Organización que regula estándares web | **W3C** |
| 4 | Técnica de reutilización de código en componentes | **Modularidad** |
| 5 | Parte del desarrollo encargada de la lógica del sistema | **Backend** |
| 6 | Interfaz que permite comunicación entre sistemas | **API** |
| 7 | Sistema para gestionar versiones de código | **Git** |
| 8 | Metodología basada en iteraciones y mejora continua | **Scrum** |
| 9 | Tecnología que permite desplegar aplicaciones en internet | **Nube** |
| 10 | Cualidad del software fácil de mantener | **Mantenibilidad** |
| 11 | Norma que define calidad del software | **ISO 25010** |
| 12 | Proceso de identificación de amenazas | **Análisis de riesgos** |
| 13 | Experiencia centrada en el usuario | **UX** |
| 14 | Pruebas para validar funcionamiento del software | **Testing** |
| 15 | Principio de protección de datos (confidencialidad) | **Confidencialidad** |
| 16 | Organización que identifica vulnerabilidades web | **OWASP** |
| 17 | Seguridad aplicada desde el diseño | **Security by Design** |
| 18 | Técnica de protección mediante codificación de datos | **Cifrado** |
| 19 | Control de acceso a sistemas | **Autenticación** |
| 20 | Enfoque que previene errores desde el inicio | **Prevención** |

---

## 6. Estructura de carpetas

> **Importante:** los entregables deben ser **navegables desde la URL desplegada**.
> `/docs/` queda como fuente de verdad en Markdown; `/public/` es el **portal web**
> que renderiza cada entregable como página visible para el docente.

```
ingweb/
├── CONTEXTO.md                          ← control del proyecto (este archivo)
├── README.md                            ← portada del repositorio
├── .gitignore
├── .gitlab-ci.yml                       ← pipeline GitLab Pages
│
├── public/                              ← lo que GitLab Pages publica
│   ├── index.html                       ← portal: navegación a todos los entregables
│   ├── css/
│   │   └── styles.css                   ← estilos compartidos del portal
│   ├── js/                              ← scripts mínimos
│   ├── entregables/                     ← cada fase como página HTML navegable
│   │   ├── 01-arquitectura.html         ✅ Fase 1
│   │   ├── 02-api.html                  ⏳ Fase 2
│   │   ├── 03-scrum.html                ⏳ Fase 2
│   │   ├── 04-despliegue.html           ⏳ Fase 3
│   │   ├── 05-calidad.html              ⏳ Fase 4
│   │   ├── 06-seguridad.html            ⏳ Fase 5
│   │   └── 07-riesgos.html              ⏳ Fase 6
│   └── app/                             ← aplicación funcional (demo)
│       └── index.html
│
└── docs/                                ← Markdown como fuente de verdad
    ├── 01-arquitectura.md               ✅
    ├── 02-api.md                        ⏳
    ├── 03-scrum.md                      ⏳
    ├── 04-despliegue.md                 ⏳
    ├── 05-calidad.md                    ⏳
    ├── 06-seguridad.md                  ⏳
    ├── 07-riesgos.md                    ⏳
    └── diagramas/
```

---

## 7. Despliegue en GitLab — esquema mínimo

Pipeline base (`.gitlab-ci.yml`) que sirve `public/` como sitio:

```yaml
pages:
  stage: deploy
  script:
    - echo "Publicando sitio en GitLab Pages"
  artifacts:
    paths:
      - public
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

> El docente ve: pipeline verde → URL pública → documentación visible → ingeniería evidenciada.

---

## 8. Próximos pasos

1. **Llenar `/docs/01-arquitectura.md`** con el diagrama y la justificación.
2. **Crear el repositorio en GitLab** y configurar el pipeline para tener URL desde el día 1 (deploy temprano = riesgo bajo).
3. **Ir completando los 7 documentos de `/docs/`** en orden de fase.
4. **La aplicación funcional puede ser mínima** — basta con que evidencie los módulos y endpoints definidos.

---

## 9. Estado actual

- [x] Análisis de la guía completado.
- [x] Documento de contexto creado y reorientado al enfoque de ingeniería.
- [x] Estructura de carpetas creada (`/docs`, `/public/{css,js,entregables,app}`).
- [x] Documento `docs/01-arquitectura.md` redactado.
- [x] **Portal web** `public/index.html` con navegación a entregables.
- [x] **Página HTML** `public/entregables/01-arquitectura.html` (Fase 1 visible).
- [x] **Página HTML** `public/entregables/02-api.html` (Fase 2-A visible).
- [x] **Página HTML** `public/entregables/03-scrum.html` (Fase 2-B).
- [x] **Página HTML** `public/entregables/04-despliegue.html` (Fase 3).
- [x] **Página HTML** `public/entregables/05-calidad.html` (Fase 4).
- [x] **Página HTML** `public/entregables/06-seguridad.html` (Fase 5).
- [x] **Página HTML** `public/entregables/07-riesgos.html` (Fase 6).
- [x] **Página HTML** `public/entregables/08-evaluacion.html` (Fase 7).
- [x] Estilos compartidos `public/css/styles.css` con todos los componentes.
- [x] **Aplicación funcional** `public/app/` (SPA con login, agendar, mis citas, admin).
- [x] **Repositorio listo:** `.gitlab-ci.yml`, `README.md`, `.gitignore` en raíz.
- [x] **Portal con las 8 tarjetas activas.**
- [ ] Push al repositorio GitLab y verificación de URL pública.
- [ ] Repositorio en GitLab + pipeline funcionando.
- [ ] Aplicación funcional (demo) en `/public/app/`.

> **Última actualización:** 2026-05-05
