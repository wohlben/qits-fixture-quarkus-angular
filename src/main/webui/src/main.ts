import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initTelemetry } from './telemetry';

// Telemetry first: the fetch instrumentation must patch window.fetch before Angular's
// FetchBackend captures it (see telemetry.ts). A standalone run resolves in one round-trip.
initTelemetry()
  .catch(() => undefined)
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err) => console.error(err));
