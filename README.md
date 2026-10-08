<div align="center">

# Eduban Backend

**API & services layer for Eduban — decentralized learning & credential verification on Stellar.**

[![CI](https://github.com/millystellar/Eduban_backend/actions/workflows/ci.yml/badge.svg)](https://github.com/millystellar/Eduban_backend/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-18%2B-green?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Report a bug](https://github.com/millystellar/Eduban_backend/issues/new?labels=bug) ·
[Request a feature](https://github.com/millystellar/Eduban_backend/issues/new?labels=enhancement) ·
[Contribute](CONTRIBUTING.md)

</div>

---

## Table of Contents

- [About](#about)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Repository Layout](#repository-layout)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database & Migrations](#database--migrations)
- [Available Scripts](#available-scripts)
- [API Overview](#api-overview)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Related Repositories](#related-repositories)
- [License](#license)

## About

This repository is the **backend** for Eduban — an open-source platform for issuing and
verifying tamper-proof educational credentials on the [Stellar](https://stellar.org)
blockchain. It exposes a REST API (with realtime support) consumed by the
[Eduban frontend](https://github.com/millystellar/Eduban_frontend) and coordinates
on-chain operations against the
[Eduban smart contracts](https://github.com/millystellar/Eduban_contract).

The core API in `src/` runs standalone. Optional microservices in `services/` exist for
horizontal scale-out and are **not** required for local development.

## Features

- 🎓 **Credential API** — issue, verify, and manage on-chain educational credentials
- 📚 **Course management** — CRUD, enrollment, content, and a moderation workflow
- 🔎 **Search & recommendations** — full-text search with personalized recommendations
  (see [docs/COURSE_DISCOVERY.md](docs/COURSE_DISCOVERY.md))
- 📈 **Analytics** — enrollment/completion aggregation with PII-safe reporting
- ✉️ **Email notifications** — pluggable provider (SendGrid / AWS SES / SMTP) with templates
- 🔗 **Transaction queue** — reliable Stellar transaction submission with retries & backoff
- 🔐 **Auth & security** — JWT auth, rate limiting, Helmet, bcrypt
- 🧩 **Modular services** — optional gateway/auth/courses/analytics microservices

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Language | TypeScript 5 |
| Framework | Express |
| Datastores | PostgreSQL, Redis (queues/cache), MongoDB (select modules) |
| Blockchain | Stellar SDK / Soroban |
| Auth | JWT, bcrypt |
| Realtime | Socket.io |
| Media | FFmpeg, Sharp |
| Testing | Jest |
| Tooling | ESLint, ts-node, nodemon |

## Repository Layout

```
src/            # Core Express API — primary entry point
services/       # Optional scale-out microservices (gateway, auth, courses, analytics)
apps/           # Companion apps: developer portal + content-player components
migrations/     # SQL database migrations
scripts/        # Operational & maintenance scripts
tests/          # Test suites (unit, integration, api, performance)
docs/           # Architecture & system documentation
```

See [`services/README.md`](services/README.md) and [`apps/README.md`](apps/README.md) for
details on the optional pieces.

## Getting Started

### Prerequisites

- **Node.js** v18+
- **PostgreSQL** v13+
- **Redis** v6+
- A Stellar keypair for on-chain operations (testnet is fine for development)
- *(optional)* Docker, for running Postgres/Redis locally

### Installation

```bash
# 1. Clone
git clone https://github.com/millystellar/Eduban_backend.git
cd Eduban_backend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# edit .env — see the Environment Variables section

# 4. Apply database migrations
npm run migrate:up

# 5. Start the API in watch mode
npm run dev
```

The API listens on **http://localhost:3001** by default.

> 💡 Need Postgres & Redis quickly?
> ```bash
> docker run -d --name eduban-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=eduban -p 5432:5432 postgres:15
> docker run -d --name eduban-redis -p 6379:6379 redis:7
> ```

## Environment Variables

A complete reference lives in [`.env.example`](.env.example) and
[SETUP_GUIDE.md](SETUP_GUIDE.md). The essentials:

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `PORT` | API port | `3001` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `REDIS_HOST` / `REDIS_PORT` | Redis connection | `localhost` / `6379` |
| `JWT_SECRET` | Signing secret (use a strong value) | — |
| `JWT_EXPIRES_IN` | Token lifetime | `24h` |
| `STELLAR_NETWORK` | `testnet` or `public` | `testnet` |
| `STELLAR_HORIZON_URL` | Horizon endpoint | — |
| `EMAIL_PROVIDER` | `smtp` / `sendgrid` / `ses` | — |
| `EMAIL_FROM` | Sender address | — |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:3000` |

## Database & Migrations

Migrations live in `migrations/` and are applied with the migrate scripts:

```bash
npm run migrate:up       # apply pending migrations
npm run migrate:down     # roll back the last migration
npm run migrate:status   # show migration status
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start API with hot reload (nodemon + ts-node) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm run lint` / `lint:fix` | Lint (and auto-fix) |
| `npm run typecheck` | TypeScript type checking |
| `npm test` | Run the full test suite |
| `npm run test:coverage` | Tests with coverage |
| `npm run test:api` | API/route tests only |
| `npm run test:integration` | Integration tests only |
| `npm run migrate:up` / `:down` / `:status` | Database migrations |

## API Overview

Common endpoints (see route modules under `src/routes` for the full surface):

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Service health check |
| `GET` | `/api/v1/public/stats` | Public aggregate stats (learners, credentials, courses) — cached, rate-limited, no auth |
| `POST` | `/api/auth/login` | Authenticate and receive a JWT |
| `GET` | `/api/courses` | List / search courses |
| `POST` | `/api/credentials` | Issue a credential |
| `GET` | `/api/credentials/:id/verify` | Verify a credential |
| `GET` | `/api/v1/analytics/enrollment-trends` | Enrollment aggregation |
| `POST` | `/api/transactions/submit` | Submit a Stellar transaction |

## Testing

```bash
npm test                    # everything
npm run test:coverage       # with coverage
npm run test:api            # route/API tests
npm run test:integration    # integration tests
```

Tests requiring a database expect a reachable Postgres/Redis (the CI workflow spins these
up as service containers). New features should include tests — see
[CONTRIBUTING.md](CONTRIBUTING.md#testing).

## Deployment

```bash
npm run build      # produces dist/
npm start          # node dist/index.js
```

A `Dockerfile` is provided for container deployments. Production guidance (Nginx, SSL,
PM2, scaling) is documented in [SETUP_GUIDE.md](SETUP_GUIDE.md).

## Contributing

Contributions are welcome! Please read the **[Contributing Guide](CONTRIBUTING.md)** and
**[Code of Conduct](CODE_OF_CONDUCT.md)** first.

1. Fork and branch: `git checkout -b feat/short-description`
2. Ensure `npm run lint && npm run typecheck && npm test` pass
3. Use [Conventional Commits](https://www.conventionalcommits.org/)
4. Open a PR with a clear description and linked issue

## Related Repositories

- 🖥️ [Eduban_frontend](https://github.com/millystellar/Eduban_frontend) — web dashboard
- ⚙️ [Eduban_backend](https://github.com/millystellar/Eduban_backend) — this repo
- 📜 [Eduban_contract](https://github.com/millystellar/Eduban_contract) — Soroban contracts

## License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

© 2026 Meshmulla
