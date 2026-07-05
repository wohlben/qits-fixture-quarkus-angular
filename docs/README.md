# Greeting app docs

This `docs/` directory exists so the app has a documentation surface a tool can recognise
(a `docs/` directory containing at least one `*.md`).

## Endpoints

- `POST /api/greetings` — body `{ "name": "..." }` → `{ "name": "...", "timestamp": "<Instant>" }`.
- `GET /q/health` — SmallRye health (liveness/readiness).

## Frontend

- Route `/greeting/:name` renders **"Hello, {name}!"** with the response timestamp.
- `/`, `/greeting` and any unmatched path redirect to `/greeting/world`.

## Running

```bash
./mvnw quarkus:dev    # Quarkus REST API + Angular SPA (Quinoa), live-reloaded
./mvnw package        # production build (Angular bundle baked into the jar)
```
