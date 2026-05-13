# Backend - Sistema de Citas Medicas

API REST en Node.js + Express. Capa de logica/negocio segun la arquitectura
cliente-servidor de 3 capas documentada en `docs/01-arquitectura.md`.

## Correr local

```bash
cd server
npm install
npm start
```

Por defecto escucha en `http://localhost:3000`. Persistencia en `data.json`.

## Endpoints

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| POST   | /api/auth/register | - | Crear cuenta de paciente |
| POST   | /api/auth/login    | - | Iniciar sesion -> token |
| DELETE | /api/auth/session  | Bearer | Cerrar sesion |
| GET    | /api/usuarios/me   | Bearer | Perfil del usuario actual |
| GET    | /api/medicos       | - | Listar medicos activos |
| GET    | /api/disponibilidad?medico_id=&fecha= | - | Slots libres |
| GET    | /api/citas         | Bearer | Mis citas |
| POST   | /api/citas         | Bearer | Agendar (rechaza si el slot esta tomado) |
| DELETE | /api/citas/:id     | Bearer | Cancelar (propietario o admin/staff) |
| GET    | /api/admin/citas   | admin/staff | Todas las citas |
| POST   | /api/admin/medicos | admin/staff | Alta de medico |
| GET    | /api/admin/reportes| admin/staff | Reportes operativos |
| POST   | /api/admin/reset   | admin | Limpiar y re-seedear |

## Deploy gratuito en Render.com

1. Crear cuenta en https://render.com (login con GitHub).
2. **New** > **Web Service** > conectar el repo `ingweb-corte3`.
3. Configuracion:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
4. **Create Web Service**. Render despliega y entrega una URL como
   `https://ingweb-citas-api-XXXX.onrender.com`.
5. Copiar esa URL y pegarla en `public/app/app.js` -> constante `API_BASE`.

> Nota: el plan gratuito de Render duerme tras 15 min de inactividad. La
> primera peticion despues del sueno tarda 30-60 segundos. Para el caso
> academico es aceptable.

## Cuentas seed

- admin: `admin@clinica.com` / `Admin123!`
- staff: `staff@clinica.com` / `Staff123!`
