# Smooth Flow

**Optimización de Agendamiento Clínico en Tiempo Real**

Sistema web para clínicas independientes de tamaño pequeño o mediano que automatiza la gestión de citas médicas con sincronización colaborativa en tiempo real. Facilita la coordinación entre secretarias, médicos de turno y pacientes, eliminando la desincronización entre agendas y reduciendo errores administrativos.

> Proyecto académico — Universidad de La Frontera, Ingeniería en Informática (2026).

## Actores del Sistema

| Rol | Descripción |
|---|---|
| **Paciente** | Reserva, reagenda y cancela citas a través del portal web de autogestión. |
| **Secretaria** | Gestiona la agenda desde un panel de control con vista diaria/semanal y notificaciones en tiempo real. |
| **Médico de Turno** | Visualiza su agenda del día actualizada en tiempo real y consulta historial de citas. |
| **Dueño de la Clínica** | Configura médicos, especialidades, horarios y gestiona usuarios del sistema (incluye desvincular usuarios secundarios). |

## Módulos Principales

- **Agendamiento Omnicanal** — Reserva, reagendamiento y cancelación de citas por parte de pacientes y secretarias, con validación de disponibilidad en tiempo real.
- **Gestión Administrativa de Agenda** — Panel de control para secretaría con propagación inmediata de cambios a todos los usuarios conectados.
- **Notificaciones en Tiempo Real** — Alertas instantáneas vía WebSocket al personal interno y correo electrónico transaccional a pacientes.

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Lenguaje | TypeScript (strict) |
| Frontend | React + Vite, Tailwind CSS v4 |
| Backend | Node.js + Express |
| Realtime | Yjs (CRDT) + y-websocket |
| Base de datos | PostgreSQL + Drizzle ORM |
| Containerización | Docker + Docker Compose |
| CI/CD | GitHub Actions → GHCR → VPS |

## Estructura del Monorepo

```
smoothflow/
├── apps/
│   ├── api/              # Backend (Express + Yjs + Drizzle)
│   │   ├── src/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/              # Frontend (React + Vite + Tailwind)
│       ├── src/
│       ├── Dockerfile
│       ├── package.json
│       └── tsconfig.json
├── docs/
│   └── SRS_SmoothFlow.md
├── .github/workflows/
│   └── deploy.yml
├── docker-compose.yml
├── tsconfig.base.json
├── pnpm-workspace.yaml
├── package.json
├── .env.example
└── .gitignore
```

## Requisitos Previos

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Docker](https://www.docker.com/) y Docker Compose

## Instalación y Desarrollo Local

```bash
# 1. Clonar el repositorio
git clone https://github.com/<owner>/smoothflow.git
cd smoothflow

# 2. Copiar variables de entorno
cp .env.example .env

# 3. Instalar dependencias
pnpm install

# 4. Levantar solo la base de datos
docker compose up -d postgres

# 5. Iniciar ambas apps en modo desarrollo
pnpm dev
```

- **API**: http://localhost:3000 (health check en `/health`)
- **Web**: http://localhost:5173

## Docker (Entorno Completo)

```bash
cp .env.example .env
docker compose up --build
```

Esto levanta tres servicios: `postgres` (puerto 5432), `api` (puerto 3000) y `web` (puerto 5173).

Para producción en la VPS se usa `docker-compose.prod.yml`, que consume las imágenes publicadas en GHCR (`ghcr.io/<owner>/smoothflow-api` y `smoothflow-web`).

## Pruebas BDD — Foro 4

La automatización BDD de **UC5 — Gestionar Agenda** usa Cucumber.js, glue code TypeScript y PostgreSQL real.

Se ejecutan **5 escenarios**: 2 positivos, 2 negativos y 1 de frontera. Para cumplir la distribución solicitada en Foro 4, el escenario negativo del Foro 3 que agrupaba creación/modificación sobre un horario no disponible se separó y **se agregó explícitamente el escenario negativo “Modificar una cita hacia un horario ocupado”**.

```bash
pnpm install
pnpm bdd:db:up
pnpm test:bdd
pnpm bdd:db:down
```

La base BDD está aislada en `smoothflow_bdd` (puerto 5434); no reutiliza la base normal de desarrollo. La documentación completa, trazabilidad y guía para el video están en [docs/Foro4_BDD.md](docs/Foro4_BDD.md).

## Deploy (CI/CD)

El pipeline de GitHub Actions (`.github/workflows/deploy.yml`) se ejecuta en cada push a `main`:

1. **Build** — Construye las imágenes Docker para `api` y `web` en paralelo y las publica en GitHub Container Registry (GHCR).
2. **Deploy** — Conecta a la VPS vía SSH, hace login en GHCR, `git pull` y ejecuta `docker compose -f docker-compose.prod.yml pull && up -d` con el tag del commit.

### Secrets requeridos en GitHub

| Secret | Descripción |
|---|---|
| `VPS_HOST` | IP o dominio de la VPS |
| `VPS_USER` | Usuario SSH |
| `VPS_SSH_KEY` | Clave privada SSH |
| `GHCR_TOKEN` | PAT con `read:packages` para que la VPS pueda hacer pull de imágenes privadas |

## Marco Legal

El sistema opera dentro de los márgenes legales chilenos para el manejo de información en salud:

- **Ley N.° 19.628** — Protección de la Vida Privada: datos sensibles cifrados en tránsito (TLS 1.2+) y en reposo.
- **Ley N.° 20.584** — Derechos y Deberes de los Pacientes: log de auditoría inmutable con retención mínima de 12 meses.
- **Ley N.° 21.541** — Salud Digital: equivalencia entre registros digitales y presenciales.
- **Autenticación stateful** — Sesiones server-side para revocar acceso al instante; ante desvinculación o desconexión WebSocket, los datos sensibles se purgan del cliente.

Consultar el [SRS completo](docs/SRS_SmoothFlow.md) para detalles de requisitos funcionales y no funcionales.

## Autores

- Enrique Andrés Pincheira Rey
- Sebastián Benjamín Bustos Beni
- Cristopher Bastián Gallegos Jiménez

Universidad de La Frontera — Facultad de Ingeniería y Ciencias, Ingeniería en Informática.
