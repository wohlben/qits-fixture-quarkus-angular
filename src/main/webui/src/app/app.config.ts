import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { TelemetryErrorHandler } from '../telemetry';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // withFetch: the OTEL fetch instrumentation only sees fetch()-based requests — this is what
    // gives api/greetings a client span and traceparent propagation into the backend trace.
    provideHttpClient(withFetch()),
    { provide: ErrorHandler, useClass: TelemetryErrorHandler },
  ],
};
