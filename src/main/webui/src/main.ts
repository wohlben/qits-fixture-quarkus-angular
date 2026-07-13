import { bootstrapApplication } from '@angular/platform-browser';
import { initQitsIntegration } from '@qits/angular';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Telemetry first: the fetch instrumentation must patch window.fetch before Angular's
// FetchBackend captures it (the @qits/angular two-phase contract). A standalone run resolves in
// one round-trip.
initQitsIntegration()
  .catch(() => undefined)
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err) => console.error(err));
