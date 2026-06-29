# Eduban Services

Optional, independently deployable microservices that scale out functionality
from the core Eduban API (`../src`). The monolithic API in `src/` is the primary
entry point and runs standalone; these services are for horizontal scale-out
deployments.

| Service | Responsibility |
|---------|----------------|
| `api-gateway` | Request routing, rate limiting, and auth forwarding across services |
| `auth-service` | Authentication, JWT issuance, and session management |
| `courses-service` | Course CRUD, enrollment, and content management |
| `analytics-service` | Enrollment/completion aggregation and reporting |

Each service has its own `package.json` and can be built and deployed on its own.
You do **not** need to run these to develop against the core API.
