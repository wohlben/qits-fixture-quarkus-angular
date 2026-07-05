# quarkus-angular — servable test fixture

A deliberately tiny **Quarkus 3 + Angular** app, shaped like the qits project itself (Quarkus REST
backend + an Angular SPA served by [Quinoa](https://docs.quarkiverse.io/quarkus-quinoa/dev/)). It
exists only as a **git fixture** for qits' own tests and demos — something buildable and *servable*
to point workspace-container, daemon, action, and coding-agent features at. It is not part of the
qits Maven build.

## What it does

- **Backend** — one endpoint. `POST /api/greetings` with `{"name": "..."}` returns
  `{"name": "...", "timestamp": "<server time>"}` (`GreetingResource`). The `/api` prefix is
  `quarkus.rest.path`.
- **Frontend** — one page. Route `/greeting/:name` (`Greeting`) URL-decodes the name, `POST`s it to
  the same-origin `/api/greetings`, and renders **"Hello {name}"** with the returned timestamp.
- **Fallback** — `/greeting` (and `/greeting/`), `/`, and anything unmatched route to
  `GreetingRedirect`, which `router.navigateByUrl('/greeting/world', { replaceUrl: true })`. It uses
  `replaceUrl` rather than a config `redirectTo` on purpose, so the fallback URL is not pushed onto
  the browser history.

Open <http://localhost:8080/> → it lands on **Hello world**. Try `/greeting/Ada%20Lovelace`.

## Running

```shell
./mvnw quarkus:dev      # live-reload; Quinoa runs `ng serve` and proxies the UI on one origin
./mvnw package          # production build (pnpm + Angular via Quinoa), then quarkus-app/
./mvnw test             # the one @QuarkusTest against POST /api/greetings
```

Requires JDK 25 and a package manager Quinoa can drive (pnpm — see `pnpm-lock.yaml`). No database, no
network at runtime.

## Layout

```
src/main/java/.../GreetingResource.java     the one REST endpoint
src/main/resources/application.properties   quarkus.rest.path=/api + Quinoa config
src/main/webui/                             Angular 21 app (Quinoa auto-detects it)
  src/app/app.routes.ts                     the routes described above
  src/app/greeting.ts                       fetches /api/greetings, renders Hello {name}
  src/app/greeting-redirect.ts              replaceUrl fallback to /greeting/world
src/test/java/.../GreetingResourceTest.java @QuarkusTest for the endpoint
```

## Branches

| Branch             | Purpose                                                           |
|--------------------|------------------------------------------------------------------|
| `main`             | the app as described above                                       |
| `feature/greeting` | tweaks the greeting text — a clean fast-forward over `main`      |
| `feature/diverged` | conflicting change to the same line — a diverged/conflict branch |
