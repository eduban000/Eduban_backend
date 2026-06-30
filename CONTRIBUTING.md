# Contributing to Eduban Backend

First off — thank you for taking the time to contribute! 🎉 Eduban is an open-source
project and we welcome contributions of all kinds: bug reports, feature requests,
documentation, and code.

This guide covers the backend repository. For the web dashboard see
[Eduban_frontend](https://github.com/millystellar/Eduban_frontend); for the smart
contracts see [Eduban_contract](https://github.com/millystellar/Eduban_contract).

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Branching & Workflow](#branching--workflow)
- [Commit Messages](#commit-messages)
- [Coding Standards](#coding-standards)
- [Database & Migrations](#database--migrations)
- [Testing](#testing)
- [Pull Requests](#pull-requests)
- [Reporting Bugs](#reporting-bugs)
- [Security Issues](#security-issues)

## Code of Conduct

This project is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating,
you are expected to uphold it. Please report unacceptable behavior via the issue tracker
or privately to the maintainers.

## Ways to Contribute

- 🐛 **Report bugs** — open an [issue](https://github.com/millystellar/Eduban_backend/issues/new?labels=bug)
- 💡 **Suggest features** — open an [issue](https://github.com/millystellar/Eduban_backend/issues/new?labels=enhancement)
- 📖 **Improve docs** — API docs, setup guide, architecture notes
- 🧑‍💻 **Write code** — look for `good first issue` or `help wanted` labels

For non-trivial work, please open or comment on an issue first so we can align on approach.

## Development Setup

**Prerequisites:** Node.js v18+, PostgreSQL v13+, Redis v6+.

```bash
# Fork on GitHub, then:
git clone https://github.com/<your-username>/Eduban_backend.git
cd Eduban_backend
git remote add upstream https://github.com/millystellar/Eduban_backend.git

npm install
cp .env.example .env          # configure DB, Redis, JWT, Stellar
npm run migrate:up            # apply migrations
npm run dev                   # http://localhost:3001
```

Spin up datastores quickly with Docker:

```bash
docker run -d --name eduban-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=eduban -p 5432:5432 postgres:15
docker run -d --name eduban-redis -p 6379:6379 redis:7
```

Keep your fork in sync:

```bash
git fetch upstream
git rebase upstream/main
```

## Branching & Workflow

- Base work on the latest `main`.
- Use descriptive branch names:
  - `feat/credential-expiry-endpoint`
  - `fix/rate-limiter-off-by-one`
  - `docs/setup-guide-redis`
  - `chore/bump-express`
- One logical change per pull request.

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(credentials): add revocation endpoint
fix(queue): retry failed Stellar submissions with backoff
docs(setup): document EMAIL_PROVIDER options
test(api): cover analytics PII redaction
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.

## Coding Standards

- **TypeScript** for new code — type request/response payloads and avoid `any`.
- Keep controllers thin; put business logic in services.
- Validate and sanitize all external input; never log secrets or PII.
- Handle errors explicitly and return consistent error shapes.
- Run checks before pushing:

```bash
npm run lint
npm run typecheck
npm test
```

`npm run lint:fix` auto-fixes most issues.

## Database & Migrations

- Any schema change ships with a migration in `migrations/`.
- Migrations must be reversible where practical (`up` **and** `down`).
- Test both directions locally:

```bash
npm run migrate:up
npm run migrate:status
npm run migrate:down
```

## Testing

- Framework: **Jest**. Tests live under `tests/` (and `src/**/__tests__`).
- Add/adjust tests for any behavior you change.
- Integration/API tests may require a reachable Postgres and Redis.

```bash
npm test                    # everything
npm run test:coverage       # with coverage
npm run test:api            # route/API tests
npm run test:integration    # integration tests
```

## Pull Requests

Before opening a PR:

- [ ] Branch rebased on `upstream/main`
- [ ] `npm run lint && npm run typecheck && npm test` pass
- [ ] Migrations included and reversible (if schema changed)
- [ ] New/changed behavior covered by tests
- [ ] Docs / `.env.example` / `SETUP_GUIDE.md` updated as needed
- [ ] Conventional Commit messages
- [ ] Description explains **what** and **why**; links issues (`Closes #123`)

Maintainers review, may request changes, and merge once approved with green CI.

## Reporting Bugs

Include a clear description, steps to reproduce, expected vs. actual behavior, relevant
logs, and your environment (Node version, OS, database versions).

## Security Issues

**Please do not open public issues for security vulnerabilities.** Report them privately
to the maintainers (see [SECURITY.md](.github/SECURITY.md) if present) so they can be
addressed responsibly before disclosure.

---

Thanks again for helping make Eduban better! 💛
