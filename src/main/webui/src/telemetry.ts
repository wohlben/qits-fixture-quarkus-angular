import { ErrorHandler, Injectable } from '@angular/core';
import { SeverityNumber, type Logger } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { BatchSpanProcessor, WebTracerProvider } from '@opentelemetry/sdk-trace-web';

interface TelemetryRelay {
  resourceAttributes: Record<string, string>;
  serviceName: string;
}

let errorLogger: Logger | undefined;
let initialized = false;

/**
 * Browser telemetry, gated by the backend's identity relay: fetch the base-relative
 * api/config.json and stay dark when it reports `telemetry: null` (app running standalone, or the
 * qits daemon's otel toggle is off). When lit, export OTLP protobuf to the backend's own
 * api/otel/v1/* passthrough — base-relative like every other API call, so it works at `/` and
 * under the qits daemon web-view prefix alike.
 *
 * Must complete before bootstrapApplication: Angular's FetchBackend captures window.fetch when it
 * is first used, so the fetch instrumentation has to patch it first for api/greetings calls to get
 * client spans and traceparent propagation.
 */
export async function initTelemetry(): Promise<void> {
  if (initialized) {
    return;
  }
  initialized = true;

  let relay: TelemetryRelay | null;
  try {
    const response = await fetch(new URL('api/config.json', document.baseURI).href);
    if (!response.ok) {
      return;
    }
    relay = (await response.json()).telemetry ?? null;
  } catch {
    return; // telemetry is best-effort; never block the app
  }
  if (!relay) {
    return;
  }

  const resource = resourceFromAttributes({
    ...relay.resourceAttributes,
    // The distinct service name is what makes the qits log-tail service filter useful.
    'service.name': `${relay.serviceName}-browser`,
  });
  // The exporters use a user-provided url verbatim (no /v1/<signal> appended) and resolve it
  // against location.href, not <base> — so build absolute per-signal URLs from the rebased base.
  const exportUrl = (signal: string) => new URL(`api/otel/v1/${signal}`, document.baseURI).href;

  // Flush every second, not the default five: the qits web view is an iframe, and removing an
  // iframe (closing the floaty) fires no pagehide/visibilitychange — anything still buffered is
  // lost. A short interval shrinks that window to <=1s; dev traffic is tiny, so it costs nothing.
  const flush = { scheduledDelayMillis: 1000 };

  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter({ url: exportUrl('traces') }), flush),
    ],
  });
  // Defaults: StackContextManager (this app is zoneless) + W3C trace-context/baggage propagators.
  tracerProvider.register();

  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation(),
      // The proto exporters POST via fetch() — exclude them or every export spawns a span
      // exporting itself, forever.
      new FetchInstrumentation({ ignoreUrls: [/\/api\/otel\/v1\//] }),
    ],
  });

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ url: exportUrl('logs') }),
        ...flush,
      }),
    ],
  });
  errorLogger = loggerProvider.getLogger('browser-errors');
  // No extra flush wiring: both batch processors also auto-flush on document hide by default
  // (tab switches); the short interval above covers iframe removal, which hides nothing.
}

/**
 * Ships uncaught errors as ERROR-severity OTLP log records (surfacing them in the qits errors feed
 * and telemetryErrors MCP tool), then defers to Angular's default console logging.
 *
 * ErrorHandler is the one funnel that sees everything in this app: zoneless Angular catches
 * event-handler exceptions before they ever reach window's error event, and
 * provideBrowserGlobalErrorListeners forwards genuinely-global errors and unhandled rejections
 * here too.
 */
@Injectable()
export class TelemetryErrorHandler extends ErrorHandler {
  override handleError(error: unknown): void {
    if (errorLogger) {
      const err = error instanceof Error ? error : new Error(String(error));
      errorLogger.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: 'ERROR',
        body: err.message,
        attributes: {
          'exception.type': err.name,
          'exception.message': err.message,
          'exception.stacktrace': err.stack ?? '',
        },
      });
    }
    super.handleError(error);
  }
}
