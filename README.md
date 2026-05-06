# Sistema Web de Gestión de Citas Médicas

Proyecto académico de **Ingeniería Web · Corte III**.

> Docente: Ing. Jairo Armando Salcedo Aranda
> Entrega final: miércoles 6 de mayo de 2026

## Cómo se navega

El proyecto está pensado para evaluarse desde el **portal web** desplegado en
GitLab Pages. Cada fase produce un entregable visible y navegable.

- **Portal:** `public/index.html` — punto de entrada con tarjetas a cada fase.
- **Entregables:** `public/entregables/` — un HTML por fase con su contenido y diagramas SVG.
- **Aplicación:** `public/app/` — demo funcional del sistema.
- **Documentación de respaldo:** `docs/` — markdown con el origen de cada entregable.

## Despliegue

El pipeline `.gitlab-ci.yml` en la raíz publica el contenido de `public/` en
GitLab Pages cada vez que se hace push a `main`.

URL pública: `https://<usuario>.gitlab.io/<repo>`

## Fases del proyecto

| # | Fase | Entregable |
|---|------|-----------|
| 1 | Definición y arquitectura | [01-arquitectura.html](public/entregables/01-arquitectura.html) |
| 2-A | API y desarrollo | [02-api.html](public/entregables/02-api.html) |
| 2-B | Scrum y Git | [03-scrum.html](public/entregables/03-scrum.html) |
| 3 | Despliegue en la nube | [04-despliegue.html](public/entregables/04-despliegue.html) |
| 4 | Calidad ISO 25010 | [05-calidad.html](public/entregables/05-calidad.html) |
| 5 | Seguridad web | [06-seguridad.html](public/entregables/06-seguridad.html) |
| 6 | Gestión de riesgos | [07-riesgos.html](public/entregables/07-riesgos.html) |
| 7 | Evaluación final | [08-evaluacion.html](public/entregables/08-evaluacion.html) |

Ver `CONTEXTO.md` para el control y bitácora del proyecto.
