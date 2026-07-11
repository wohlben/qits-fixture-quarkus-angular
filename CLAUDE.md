# CLAUDE.md

Guidance for a coding agent working in this repository.

## What this is

A minimal, servable **Quarkus 3 (Java 25) + Angular** app: a single REST endpoint plus an Angular SPA
served by Quinoa from one origin. It is intentionally tiny — the smallest thing that is still
recognisably a real Quarkus+Angular service.

- **Backend** — `src/main/java/eu/wohlben/qits/testingrepo/GreetingResource.java`:
  `POST /api/greetings` with `{ "name": "..." }` returns `{ "name": "...", "timestamp": "<Instant>" }`,
  composed by the injected `GreetingService` (the boundary/control seam).
  The `/api` prefix is `quarkus.rest.path`; the resource declares `/greetings`.
- **Frontend** — `src/main/webui/` (Angular, pnpm). Route `/greeting/:name` (`greeting.ts`) POSTs the
  name to the **base-relative** `api/greetings` and renders "Hello, {name}!". `/`, `/greeting` and any
  unmatched path redirect to `/greeting/world` (`greeting-redirect.ts`).
- **Health** — `quarkus-smallrye-health` exposes `/q/health`.
- **Observability** — `quarkus-opentelemetry` exports OTLP; the endpoint/service-name/resource
  attributes are injected by the runtime via `OTEL_EXPORTER_OTLP_*` env vars. The backend also acts
  as its SPA's telemetry gateway (browsers can't read env vars): `GET /api/config.json`
  (`ConfigResource`) relays the OTEL identity (`telemetry: null` when no endpoint is configured),
  and `POST /api/otel/v1/{traces|logs|metrics}` (`OtelProxyResource`) pipes OTLP protobuf verbatim
  to `${OTEL_EXPORTER_OTLP_ENDPOINT}` (404 unconfigured, 502 upstream down). The SPA side
  (`src/main/webui/src/telemetry.ts`, run before bootstrap in `main.ts`) stays dark on
  `telemetry: null`; otherwise it exports document-load + fetch spans and ships uncaught errors as
  ERROR log records via a custom Angular `ErrorHandler`. The telemetry is meta-enriched: every
  span/log carries `app.route.path`/`app.route.url` (stamping processors; navigation spans via
  `provideRouteTelemetry()` in `app.config.ts`), clicks/submits become interaction spans named by
  the framework-free `data-track-event` DOM attribute (the greeting form's `save-greeting`; the
  attribute goes on the event target or an ancestor — a submit's target is the form), and fetch
  spans carry `code.function.name`/`code.file.path`/`code.stacktrace` caller attribution from a
  `window.fetch` wrapper — all in `telemetry.ts`, all dark when `telemetry: null`. The app stays
  zoneless: only synchronous handler work nests under interaction spans, and the
  user-interaction instrumentation's `zone.js` peer is marked optional via a pnpm
  `packageExtensions` entry. The backend spans are meta-enriched too: `TelemetryMetaFilter`
  stamps `code.function.name` (FQCN + method) and `code.file.path` (Maven-layout derivation) on
  every matched server span, and `GreetingService.compose` (`@WithSpan`, `greeting.name`
  attribute) gives each trace an interior span between "request in" and "response out". Log
  records need no filter — Quarkus itself stamps `code.function.name`/`code.line.number` on every
  exported log record.

## Commands

```bash
./mvnw quarkus:dev    # live-reload dev mode (Quarkus + Quinoa-managed ng serve)
./mvnw package        # full build; Angular production bundle baked into the jar
./mvnw test           # @QuarkusTests: greetings echo, telemetry enrichment, config relay, OTLP passthrough
```

## Conventions

- Java 25, `maven.compiler.release=25`.
- Keep the app single-module and dependency-light; it is a fixture, not a product.
- The SPA talks to the API on the same origin with **base-relative** URLs — never hardcode a leading
  `/api`, so the app keeps working when served under a path prefix.
