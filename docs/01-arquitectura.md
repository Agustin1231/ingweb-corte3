# 01 — Arquitectura del Sistema

> **Proyecto:** Sistema Web de Gestión de Citas Médicas
> **Fase:** 1 — Definición y arquitectura
> **Conceptos cubiertos:** Cliente-Servidor · Backend · Modularidad · API · W3C · Security by Design
> **Estado:** Versión 1.0

---

## 1. Propósito del documento

Este documento describe **la arquitectura de software** del Sistema Web de Gestión de Citas Médicas. Su objetivo es:

- Justificar el **estilo arquitectónico** elegido y sus alternativas.
- Definir las **vistas** que permiten razonar sobre el sistema (lógica, procesos, despliegue, datos).
- Establecer la **modularización** y los contratos entre módulos.
- Documentar los **principios de diseño** y **atributos de calidad** atendidos por la arquitectura.
- Servir como **fuente de verdad** para el resto de fases (calidad, seguridad, riesgos).

> La arquitectura precede al código. Cada decisión aquí condiciona qué tan mantenible, segura y escalable será la solución final.

---

## 2. Contexto del sistema

### 2.1 Problema

Una clínica gestiona sus citas médicas de forma **manual**, lo que produce:

- **Errores humanos** en agendamiento (doble booking, datos mal escritos).
- **Demoras** en atención telefónica y presencial.
- **Pérdida de información** por uso de papel y registros descentralizados.
- **Dificultad de auditoría** y reporte gerencial.

### 2.2 Solución propuesta

Una **aplicación web** que permita:

- A **pacientes**: registrarse, consultar disponibilidad, agendar y cancelar citas.
- A **personal administrativo**: gestionar médicos, horarios, ver agenda y generar reportes.
- A **administradores**: control total del sistema y de los usuarios.

### 2.3 Diagrama de contexto (C4 — Nivel 1)

```
                       ┌─────────────────────────┐
                       │       PACIENTE          │
                       │  (usuario externo)      │
                       └────────────┬────────────┘
                                    │ agenda / consulta citas
                                    ▼
┌─────────────────────────┐    HTTPS    ┌─────────────────────────┐
│  PERSONAL ADMINISTRATIVO│ ──────────► │   SISTEMA DE GESTIÓN    │
│  (usuario interno)      │             │   DE CITAS MÉDICAS      │
└─────────────────────────┘             │   (sistema en estudio)  │
                                        └────────────┬────────────┘
                                                     │
                       ┌─────────────────────────────┴───────────────┐
                       ▼                                              ▼
              ┌───────────────────┐                         ┌───────────────────┐
              │  Servicio Email   │                         │   Calendario      │
              │  (notificaciones) │                         │   externo (ICS)   │
              │  — opcional —     │                         │   — opcional —    │
              └───────────────────┘                         └───────────────────┘
```

### 2.4 Actores

| Actor | Tipo | Objetivo principal |
|-------|------|--------------------|
| Paciente | Externo | Agendar, consultar y cancelar sus citas. |
| Personal administrativo | Interno | Gestionar la operación diaria. |
| Administrador del sistema | Interno | Configurar usuarios, médicos y reglas. |

---

## 3. Estilo arquitectónico

### 3.1 Decisión: **Cliente-Servidor en 3 capas**

El sistema adopta una **arquitectura cliente-servidor de 3 capas**: presentación, lógica y datos.

```
┌──────────────────────────────────────────────────────────────┐
│   CAPA 1 — PRESENTACIÓN  (Cliente — navegador del usuario)   │
│   Vistas · Validación de UX · Consumo de la API              │
└─────────────────────────────┬────────────────────────────────┘
                              │ HTTPS / JSON
┌─────────────────────────────▼────────────────────────────────┐
│   CAPA 2 — LÓGICA / NEGOCIO  (Servidor — API)                │
│   Reglas de negocio · Validación · Autenticación · Autoriz.  │
└─────────────────────────────┬────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────┐
│   CAPA 3 — DATOS  (Persistencia)                             │
│   Almacenamiento de usuarios, citas, médicos, auditoría      │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 ¿Por qué cliente-servidor en 3 capas?

| Necesidad del caso | Cómo la atiende este estilo |
|--------------------|----------------------------|
| Múltiples usuarios concurrentes (pacientes + personal). | El servidor centraliza estado y reglas. |
| Acceso desde distintos dispositivos. | El cliente es web → navegador estándar (W3C). |
| Reglas de negocio críticas (no doble booking, validación). | Concentradas en la capa de lógica, no replicadas en el cliente. |
| Confidencialidad de datos personales. | La capa de datos nunca queda expuesta al cliente. |
| Mantenibilidad y evolución. | Cada capa puede cambiarse sin alterar las otras. |

### 3.3 Alternativas consideradas y descartadas

| Alternativa | Por qué se descarta |
|-------------|---------------------|
| **Aplicación monolítica de escritorio** | No cumple el requisito de ser web; no es accesible desde cualquier dispositivo. |
| **Arquitectura serverless / microservicios** | Sobre-ingeniería para el alcance del caso; añade complejidad que el equipo no requiere demostrar. |
| **Cliente "gordo" (toda la lógica en el navegador)** | Compromete la seguridad (reglas modificables por el usuario) y la integridad de datos. |
| **Arquitectura peer-to-peer** | No aplica a un dominio centralizado como una clínica. |

---

## 4. Vistas arquitectónicas (modelo 4+1 simplificado)

### 4.1 Vista lógica — módulos y componentes

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CAPA DE PRESENTACIÓN (FRONTEND)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │
│  │   Login /   │  │  Agendar    │  │  Mis citas  │  │   Panel    │  │
│  │  Registro   │  │   cita      │  │             │  │   Admin    │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │  API REST (JSON sobre HTTPS)
┌─────────────────────────────────▼───────────────────────────────────┐
│                       CAPA DE LÓGICA (BACKEND)                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  Módulo de      │  │  Módulo de      │  │  Módulo             │  │
│  │  USUARIOS       │  │  CITAS          │  │  ADMINISTRATIVO     │  │
│  │  - Registro     │  │  - Crear cita   │  │  - Gestión médicos  │  │
│  │  - Login        │  │  - Consultar    │  │  - Horarios         │  │
│  │  - Roles        │  │  - Cancelar     │  │  - Reportes         │  │
│  │  - Perfil       │  │  - Disponibil.  │  │  - Auditoría        │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Servicios transversales: Auth · Validación · Logging · Errs  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                          CAPA DE DATOS                              │
│   usuarios · citas · médicos · horarios · log_auditoría             │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Vista de procesos — flujo "Agendar cita"

```
Paciente            Frontend           API/Backend         Persistencia
   │                    │                    │                    │
   │ 1. Selecciona      │                    │                    │
   │    fecha/médico    │                    │                    │
   │ ──────────────────►│                    │                    │
   │                    │ 2. GET /disponib.  │                    │
   │                    │ ──────────────────►│                    │
   │                    │                    │ 3. consulta        │
   │                    │                    │ ──────────────────►│
   │                    │                    │ 4. horarios libres │
   │                    │                    │ ◄──────────────────│
   │                    │ 5. respuesta JSON  │                    │
   │                    │ ◄──────────────────│                    │
   │ 6. Confirma cita   │                    │                    │
   │ ──────────────────►│                    │                    │
   │                    │ 7. POST /citas     │                    │
   │                    │   (con token JWT)  │                    │
   │                    │ ──────────────────►│                    │
   │                    │                    │ 8. valida y guarda │
   │                    │                    │ ──────────────────►│
   │                    │                    │ 9. cita creada     │
   │                    │                    │ ◄──────────────────│
   │                    │ 10. 201 Created    │                    │
   │                    │ ◄──────────────────│                    │
   │ 11. Confirmación   │                    │                    │
   │ ◄──────────────────│                    │                    │
```

### 4.3 Vista de despliegue — GitLab Pages

```
┌─────────────────────────┐         ┌─────────────────────────┐
│   Repositorio GitLab    │  push   │     CI/CD Pipeline      │
│   (código + docs)       │ ──────► │   (.gitlab-ci.yml)      │
└─────────────────────────┘         └────────────┬────────────┘
                                                 │ artifacts
                                                 ▼
                                    ┌─────────────────────────┐
                                    │     GitLab Pages        │
                                    │  (CDN + HTTPS gratuito) │
                                    │  https://<user>         │
                                    │   .gitlab.io/<repo>     │
                                    └────────────┬────────────┘
                                                 │
                                                 ▼
                                    ┌─────────────────────────┐
                                    │  Navegadores (cualquier │
                                    │  dispositivo, cualquier │
                                    │  red)                   │
                                    └─────────────────────────┘
```

**Justificación del despliegue:**

- **GitLab Pages** entrega HTTPS automático → cubre el atributo de **confidencialidad en tránsito**.
- **CI/CD nativo** (`.gitlab-ci.yml`) → evidencia el concepto **Nube** y permite despliegue continuo.
- **CDN global** → mejora el atributo de **eficiencia de desempeño**.
- **Sin servidor propio** → reduce la superficie de ataque y costos operativos.

### 4.4 Vista de datos — modelo conceptual

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   USUARIO    │         │     CITA     │         │    MÉDICO    │
├──────────────┤         ├──────────────┤         ├──────────────┤
│ id (PK)      │ 1     N │ id (PK)      │ N     1 │ id (PK)      │
│ nombre       │ ──────► │ usuario_id   │ ◄────── │ nombre       │
│ email (UQ)   │         │ medico_id    │         │ especialidad │
│ password_hash│         │ fecha_hora   │         │ activo       │
│ rol          │         │ estado       │         └──────┬───────┘
│ creado_en    │         │ creado_en    │                │
└──────────────┘         └──────────────┘                │
                                                         │ 1
                                                         ▼ N
                                               ┌──────────────────┐
                                               │     HORARIO      │
                                               ├──────────────────┤
                                               │ id (PK)          │
                                               │ medico_id (FK)   │
                                               │ dia_semana       │
                                               │ hora_inicio      │
                                               │ hora_fin         │
                                               └──────────────────┘
```

**Reglas de integridad:**

- `usuario.email` es único.
- `usuario.password_hash` nunca almacena texto plano (cifrado con función de hash unidireccional + salt).
- `cita.estado ∈ {agendada, confirmada, cancelada, atendida}`.
- Una `(medico_id, fecha_hora)` no puede repetirse → previene doble booking.
- Toda operación crítica se registra en `log_auditoría` (no representado arriba).

---

## 5. Modularización

### 5.1 Criterios aplicados

- **Alta cohesión:** cada módulo agrupa funcionalidad de un mismo dominio.
- **Bajo acoplamiento:** los módulos se comunican vía contratos (API), no por estructuras internas.
- **Responsabilidad única:** cada módulo tiene una razón de cambio.

### 5.2 Módulos definidos

#### 5.2.1 Módulo de Usuarios

- **Responsabilidad:** registrar, autenticar y gestionar perfiles y roles.
- **Endpoints expuestos:**
  - `POST /auth/register` — crear cuenta de paciente.
  - `POST /auth/login` — iniciar sesión, devolver token.
  - `GET /usuarios/me` — perfil del usuario autenticado.
- **Reglas clave:**
  - Email único.
  - Contraseña con política mínima (longitud y complejidad).
  - Hash con salt antes de persistir.

#### 5.2.2 Módulo de Citas

- **Responsabilidad:** ciclo de vida completo de una cita.
- **Endpoints expuestos:**
  - `GET /disponibilidad?medico=&fecha=` — horarios libres.
  - `POST /citas` — agendar cita.
  - `GET /citas` — listar citas del usuario autenticado.
  - `DELETE /citas/:id` — cancelar cita propia.
- **Reglas clave:**
  - No se permite agendar en horarios ocupados.
  - No se permite agendar en fechas pasadas.
  - El usuario solo puede cancelar sus propias citas (excepto rol admin).

#### 5.2.3 Módulo Administrativo

- **Responsabilidad:** operación interna de la clínica.
- **Endpoints expuestos:**
  - `GET /admin/citas` — todas las citas con filtros.
  - `POST /admin/medicos` — alta de médicos.
  - `POST /admin/horarios` — definir horarios de atención.
  - `GET /admin/reportes` — métricas operativas.
- **Reglas clave:**
  - Acceso exclusivo a roles `admin` o `staff`.
  - Toda acción queda registrada en auditoría.

### 5.3 Servicios transversales

| Servicio | Función |
|----------|---------|
| **Autenticación** | Emisión y validación de tokens, control de sesión. |
| **Autorización** | Verificación de rol antes de permitir acciones. |
| **Validación** | Reglas de formato y negocio sobre los inputs. |
| **Logging / Auditoría** | Registro de operaciones críticas. |
| **Manejo de errores** | Respuestas uniformes y mensajes seguros (sin filtrar internals). |

---

## 6. Comunicación entre componentes

### 6.1 Contrato general

- **Protocolo:** HTTPS (TLS 1.2+).
- **Formato:** JSON.
- **Estilo:** REST — recursos identificables por URL, verbos HTTP semánticos.
- **Autenticación:** token (Bearer) en header `Authorization`.

### 6.2 Convenciones de respuesta

| Código | Significado |
|--------|-------------|
| 200 OK | Operación exitosa con cuerpo. |
| 201 Created | Recurso creado correctamente. |
| 400 Bad Request | Datos inválidos del cliente. |
| 401 Unauthorized | Falta autenticación. |
| 403 Forbidden | Autenticado pero sin permiso. |
| 404 Not Found | Recurso inexistente. |
| 409 Conflict | Conflicto de estado (p. ej., doble booking). |
| 500 Internal Server Error | Error no controlado del servidor. |

### 6.3 Esquema de error uniforme

```json
{
  "error": {
    "codigo": "CITA_DUPLICADA",
    "mensaje": "Ya existe una cita en ese horario",
    "detalles": {}
  }
}
```

> El detalle del contrato completo de la API se desarrolla en `02-api.md`.

---

## 7. Principios de diseño aplicados

| Principio | Cómo se aplica en este sistema |
|-----------|-------------------------------|
| **Separación de responsabilidades (SoC)** | Tres capas claramente delimitadas (presentación / lógica / datos). |
| **Bajo acoplamiento, alta cohesión** | Cada módulo (usuarios/citas/admin) tiene un dominio único y se comunica por contratos. |
| **Modularidad** | Módulos independientes, sustituibles y testeables por separado. |
| **Security by Design** | Autenticación, validación de entradas y manejo de errores definidos desde el diseño, no añadidos al final. |
| **Principio de menor privilegio** | Roles diferenciados (paciente, staff, admin); cada uno solo accede a lo necesario. |
| **Defensa en profundidad** | Validación tanto en cliente (UX) como en servidor (autoritativa). |
| **Estandarización (W3C)** | HTML semántico, accesibilidad, formularios bien etiquetados. |
| **Idempotencia** | Operaciones de consulta no producen efectos colaterales; las de escritura están protegidas contra duplicación. |

---

## 8. Atributos de calidad atendidos por la arquitectura

> Mapeo a las características de la norma **ISO/IEC 25010** (se profundizan en `05-calidad.md`).

| Atributo (ISO 25010) | Cómo lo atiende esta arquitectura |
|----------------------|----------------------------------|
| **Adecuación funcional** | Los módulos cubren los casos de uso del problema (registro, agendamiento, gestión). |
| **Eficiencia de desempeño** | Frontend estático en CDN + API liviana basada en JSON. |
| **Compatibilidad** | Estándares W3C → funciona en cualquier navegador moderno. |
| **Usabilidad** | Capa de presentación dedicada exclusivamente a la experiencia. |
| **Fiabilidad** | Validación autoritativa en servidor + manejo uniforme de errores. |
| **Seguridad** | HTTPS, autenticación con token, hashing de contraseñas, control de acceso por roles. |
| **Mantenibilidad** | Modularidad y separación de capas → cambios localizados. |
| **Portabilidad** | Cliente web estándar; backend agnóstico de plataforma. |

---

## 9. Decisiones arquitectónicas (ADR — registro corto)

### ADR-001 — Estilo cliente-servidor en 3 capas
- **Estado:** Aceptada.
- **Contexto:** Sistema multiusuario con reglas de negocio críticas y datos sensibles.
- **Decisión:** Cliente-servidor con capas de presentación, lógica y datos.
- **Consecuencias:** Mayor mantenibilidad y seguridad; requiere disciplina para no mezclar responsabilidades.

### ADR-002 — Comunicación vía API REST sobre JSON
- **Estado:** Aceptada.
- **Contexto:** Necesidad de un contrato simple, ampliamente soportado y testeable.
- **Decisión:** REST + JSON sobre HTTPS.
- **Consecuencias:** Curva de aprendizaje baja; herramientas estándar (Postman, navegador); sencillo de versionar.

### ADR-003 — Despliegue en GitLab Pages
- **Estado:** Aceptada.
- **Contexto:** Requisito explícito de despliegue en la nube; entrega académica con tiempo limitado.
- **Decisión:** Servir el frontend desde GitLab Pages mediante pipeline CI/CD.
- **Consecuencias:** HTTPS gratuito, despliegue continuo; el backend, de existir, requerirá un servicio externo (no Pages).

### ADR-004 — Autenticación basada en token
- **Estado:** Aceptada.
- **Contexto:** Necesidad de identificar al usuario en cada request sin sesiones del lado del servidor.
- **Decisión:** Token (Bearer) emitido al login y validado en cada request.
- **Consecuencias:** Backend sin estado; rotación y expiración del token deben gestionarse cuidadosamente.

### ADR-005 — Hashing de contraseñas con salt
- **Estado:** Aceptada.
- **Contexto:** Confidencialidad de credenciales (OWASP A02:2021 — Cryptographic Failures).
- **Decisión:** Las contraseñas se almacenan con hash unidireccional y salt único por usuario.
- **Consecuencias:** No se pueden recuperar contraseñas, solo restablecer; protección frente a fuga de la base.

---

## 10. Restricciones

### 10.1 Restricciones técnicas
- Despliegue obligatorio en **GitLab** (Pages + CI/CD).
- Acceso solo vía **HTTPS**.
- Compatibilidad con navegadores modernos (estándares W3C).

### 10.2 Restricciones académicas
- Entrega final: **miércoles 6 de mayo de 2026**.
- Evaluación por **checklist** del docente.
- Trabajo demostrable en metodología **Scrum** con sprints visibles.

### 10.3 Restricciones de seguridad
- Cumplir lineamientos generales de **OWASP Top 10**.
- Datos personales tratados bajo principio de **confidencialidad**.

---

## 11. Trazabilidad — requisito ↔ componente arquitectónico

| Requisito funcional | Módulo / componente que lo satisface |
|--------------------|--------------------------------------|
| Registrar paciente | Módulo de Usuarios → `POST /auth/register`. |
| Iniciar sesión | Módulo de Usuarios → `POST /auth/login`. |
| Consultar disponibilidad | Módulo de Citas → `GET /disponibilidad`. |
| Agendar cita | Módulo de Citas → `POST /citas`. |
| Cancelar cita | Módulo de Citas → `DELETE /citas/:id`. |
| Listar mis citas | Módulo de Citas → `GET /citas`. |
| Gestionar médicos y horarios | Módulo Administrativo → `/admin/medicos`, `/admin/horarios`. |
| Generar reportes | Módulo Administrativo → `/admin/reportes`. |

---

## 12. Riesgos arquitectónicos identificados

> Se desarrollan en la matriz de riesgos (`07-riesgos.md`).

| Riesgo | Origen arquitectónico | Mitigación arquitectónica |
|--------|----------------------|---------------------------|
| Doble booking de cita | Concurrencia en módulo de Citas. | Restricción única `(medico_id, fecha_hora)` + transacción. |
| Acceso indebido a datos | Falla de autorización entre módulos. | Validación de rol en cada endpoint. |
| Fuga de credenciales | Almacenamiento incorrecto de contraseñas. | Hash + salt obligatorio en módulo de Usuarios. |
| Indisponibilidad del sistema | Punto único de fallo en backend. | Frontend en CDN sigue sirviendo modo lectura/aviso. |

---

## 13. Glosario arquitectónico mínimo

| Término | Definición operativa en este proyecto |
|---------|---------------------------------------|
| **Capa** | Agrupación horizontal de responsabilidades (presentación, lógica, datos). |
| **Módulo** | Agrupación vertical por dominio (usuarios, citas, admin). |
| **Endpoint** | URL expuesta por la API que representa una operación sobre un recurso. |
| **Recurso** | Entidad del dominio identificable por URL (`/citas/123`). |
| **Token** | Credencial firmada que el cliente presenta en cada request autenticado. |
| **CDN** | Red de distribución de contenido; aquí, GitLab Pages. |
| **CI/CD** | Integración y despliegue continuos automatizados desde el repositorio. |

---

## 14. Próximo documento

Continuar con **`02-api.md`** — contrato detallado de la API: endpoints, parámetros, respuestas, códigos de error y ejemplos. Esta arquitectura define el "qué"; la API define el "cómo se invoca".

---

> **Última revisión:** 2026-05-05
> **Versión:** 1.0
> **Autor:** Equipo de Ingeniería Web — Corte III
