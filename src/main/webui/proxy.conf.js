// Dev proxy for `ng serve`: forward the SPA's API calls to Quarkus (:8080).
//
// Under the qits daemon web view the app is served at $QITS_PUBLIC_BASE
// (/daemon/{workspace}/{daemonId}/) and Quarkus serves under the same base
// (-Dquarkus.http.root-path in the daemon's start script), so the based API path
// forwards verbatim — no rewrite. The plain /api key keeps a standalone
// `pnpm start` (base "/") working; when the base is "/" both keys collapse into one.
const base = process.env.QITS_PUBLIC_BASE || '/';

const target = { target: 'http://localhost:8080', secure: false };

module.exports = {
  [base + 'api']: target,
  '/api': target,
};
