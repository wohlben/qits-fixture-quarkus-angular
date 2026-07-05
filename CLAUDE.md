# CLAUDE.md

Guidance for a coding agent working in this repository.

## What this is

A minimal, servable **Quarkus 3 (Java 25) + Angular** app: a single REST endpoint plus an Angular SPA
served by Quinoa from one origin. It is intentionally tiny — the smallest thing that is still
recognisably a real Quarkus+Angular service.

- **Backend** — `src/main/java/eu/wohlben/qits/testingrepo/GreetingResource.java`:
  `POST /api/greetings` with `{ "name": "..." }` returns `{ "name": "...", "timestamp": "<Instant>" }`.
  The `/api` prefix is `quarkus.rest.path`; the resource declares `/greetings`.
- **Frontend** — `src/main/webui/` (Angular, pnpm). Route `/greeting/:name` (`greeting.ts`) POSTs the
  name to the **base-relative** `api/greetings` and renders "Hello, {name}!". `/`, `/greeting` and any
  unmatched path redirect to `/greeting/world` (`greeting-redirect.ts`).
- **Health** — `quarkus-smallrye-health` exposes `/q/health`.
- **Observability** — `quarkus-opentelemetry` exports OTLP; the endpoint/service-name/resource
  attributes are injected by the runtime via `OTEL_EXPORTER_OTLP_*` env vars.

## Commands

```bash
./mvnw quarkus:dev    # live-reload dev mode (Quarkus + Quinoa-managed ng serve)
./mvnw package        # full build; Angular production bundle baked into the jar
./mvnw test           # the @QuarkusTest for POST /api/greetings
```

## Conventions

- Java 25, `maven.compiler.release=25`.
- Keep the app single-module and dependency-light; it is a fixture, not a product.
- The SPA talks to the API on the same origin with **base-relative** URLs — never hardcode a leading
  `/api`, so the app keeps working when served under a path prefix.
