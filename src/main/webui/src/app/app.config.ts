import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideQitsIntegration, withFeatureCapture } from '@qits/angular';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Telemetry ErrorHandler + navigation spans + app.route.* stamping; no-op when dark.
    // withFeatureCapture: the floaty capture button, gated by config.json's capture relay.
    provideQitsIntegration(withFeatureCapture()),
    // withFetch: the OTEL fetch instrumentation only sees fetch()-based requests — this is what
    // gives api/greetings a client span and traceparent propagation into the backend trace.
    provideHttpClient(withFetch()),
  ],
};
