import {
  ErrorHandler,
  Injectable,
  inject,
  provideAppInitializer,
  type EnvironmentProviders,
} from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { trace, type Attributes, type Span } from '@opentelemetry/api';
import { SeverityNumber, type Logger } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchLogRecordProcessor,
  LoggerProvider,
  type LogRecordProcessor,
  type SdkLogRecord,
} from '@opentelemetry/sdk-logs';
import {
  BatchSpanProcessor,
  WebTracerProvider,
  type Span as SdkSpan,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-web';

interface TelemetryRelay {
  resourceAttributes: Record<string, string>;
  serviceName: string;
}

let errorLogger: Logger | undefined;
let initialized = false;
let telemetryActive = false;

// Current-route state: written by provideRouteTelemetry's router subscription, read by the
// stamping processors below. Before the first NavigationEnd only the concrete URL is known
// (covers documentLoad); the matched pattern is omitted rather than faked with a concrete URL,
// which would pollute the pattern attribute's grouping.
let currentRoute: { path?: string; url: string } = { url: location.pathname };

function routeAttributes(): Attributes {
  return {
    ...(currentRoute.path !== undefined && { 'app.route.path': currentRoute.path }),
    'app.route.url': currentRoute.url,
  };
}

/** Stamps the current route on every span, so "on which page" needs no query change. */
class RouteStampingSpanProcessor implements SpanProcessor {
  onStart(span: SdkSpan): void {
    span.setAttributes(routeAttributes());
  }
  onEnd(): void {}
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

/** The log-record twin of RouteStampingSpanProcessor: every log record answers "on which page". */
class RouteStampingLogRecordProcessor implements LogRecordProcessor {
  onEmit(record: SdkLogRecord): void {
    record.setAttributes(routeAttributes());
  }
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

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
  telemetryActive = true;

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
      new RouteStampingSpanProcessor(),
      new BatchSpanProcessor(new OTLPTraceExporter({ url: exportUrl('traces') }), flush),
    ],
  });
  // Defaults: StackContextManager (this app is zoneless) + W3C trace-context/baggage propagators.
  tracerProvider.register();

  // Before FetchInstrumentation patches fetch, so its patch wraps the wrapper — see the function.
  installFetchCallerAttribution();

  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation(),
      // The proto exporters POST via fetch() — exclude them or every export spawns a span
      // exporting itself, forever.
      new FetchInstrumentation({ ignoreUrls: [/\/api\/otel\/v1\//] }),
      // Clicks/submits become spans; synchronous work in the handler (this zoneless app uses the
      // stack context manager) nests under them, so a submit-fired POST gets the interaction as
      // its trace root. Work behind an await/setTimeout escapes — accepted, we don't ship zone.js.
      new UserInteractionInstrumentation({
        eventNames: ['click', 'submit'],
        // Despite its name, this is the enrichment seam: it receives the event target and the
        // just-created span; anything but `true` keeps the span. NB the target of a submit event
        // is the <form>, so data-track-event belongs there (closest() walks up from the target).
        shouldPreventSpanCreation: (eventName, element, span) => {
          const name = element.closest('[data-track-event]')?.getAttribute('data-track-event');
          if (name) {
            span.updateName(`interaction ${name}`);
            span.setAttribute('app.interaction.name', name);
          }
          span.setAttribute('app.interaction.target', describeTarget(element));
          const component = owningComponentName(element);
          if (component) {
            span.setAttribute('app.component', component);
          }
          return false;
        },
      }),
    ],
  });

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new RouteStampingLogRecordProcessor(),
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
 * Navigation spans + the route tracking behind the stamping processors. Router wiring needs the
 * injector, so it can't live in the pre-bootstrap initTelemetry(); as an app initializer it
 * subscribes before the router's initial navigation, so the first load and the redirect
 * component's replaceUrl hop are both captured. No-op while telemetry is dark.
 */
export function provideRouteTelemetry(): EnvironmentProviders {
  return provideAppInitializer(() => {
    if (!telemetryActive) {
      return;
    }
    const router = inject(Router);
    const tracer = trace.getTracer('app-navigation');
    let navigationSpan: Span | undefined;
    const end = (result: string, url: string) => {
      navigationSpan?.setAttributes({
        ...routeAttributes(),
        'app.route.url': url,
        'app.navigation.result': result,
      });
      navigationSpan?.end();
      navigationSpan = undefined;
    };
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        navigationSpan?.end(); // defensive: never leak a span across overlapping navigations
        // Started in the ambient context, never made active: fetches during navigation don't
        // parent under it — but a navigation triggered synchronously from a handler nests under
        // that interaction span, keeping cause and effect in one trace.
        navigationSpan = tracer.startSpan('Navigation', {
          attributes: { 'app.route.url': event.url },
        });
      } else if (event instanceof NavigationEnd) {
        currentRoute = {
          path: matchedRoutePath(router.routerState.snapshot),
          url: event.urlAfterRedirects,
        };
        end('success', event.urlAfterRedirects);
      } else if (event instanceof NavigationCancel) {
        end('cancel', event.url);
      } else if (event instanceof NavigationError) {
        end('error', event.url);
      } else if (event instanceof NavigationSkipped) {
        end('skipped', event.url);
      }
    });
  });
}

/** The matched config path ("greeting/:name"), not the concrete URL — groups without cardinality. */
function matchedRoutePath(state: RouterStateSnapshot): string {
  const segments: string[] = [];
  for (let node: ActivatedRouteSnapshot | null = state.root; node; node = node.firstChild) {
    if (node.routeConfig?.path) {
      segments.push(node.routeConfig.path);
    }
  }
  return segments.join('/');
}

/** A human hint for unnamed interactions: tag plus id or a little text. */
function describeTarget(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase();
  if (element.id) {
    return `${tag}#${element.id}`;
  }
  const text = element.textContent?.trim().slice(0, 40);
  return text ? `${tag} "${text}"` : tag;
}

/** Dev-mode sugar: ng serve exposes window.ng; production builds don't — attribute simply absent. */
function owningComponentName(element: HTMLElement): string | undefined {
  try {
    const ng = (window as { ng?: { getOwningComponent?(el: Element): object | null } }).ng;
    // esbuild's dev bundling aliases classes with a leading underscore (_Greeting) — strip it.
    return ng?.getOwningComponent?.(element)?.constructor.name.replace(/^_+/, '');
  } catch {
    return undefined;
  }
}

/**
 * Caller attribution on fetch spans (stable code.* semconv): "which file/method issued this
 * request". Installed before FetchInstrumentation registers, so the instrumentation's patch wraps
 * this wrapper and runs it inside the just-started fetch span's context — trace.getActiveSpan()
 * here IS the fetch span. The OTLP export URLs are excluded by ignoreUrls (no span) and fire from
 * batch timers (no ambient span either): the wrapper is self-excluding.
 *
 * Resolution honesty: under a dev server the function name (Greeting.submit) is the reliable
 * signal; file "paths" are served-bundle URLs. The capped code.stacktrace compensates.
 */
function installFetchCallerAttribution(): void {
  const originalFetch = window.fetch;
  window.fetch = function attributedFetch(this: unknown, ...args: Parameters<typeof fetch>) {
    const span = trace.getActiveSpan();
    if (span?.isRecording()) {
      const frames = applicationFrames(captureStack());
      const top = frames.length > 0 ? parseFrame(frames[0]) : undefined;
      if (top) {
        span.setAttributes({
          'code.function.name': top.functionName,
          'code.file.path': top.file,
          'code.line.number': top.line,
          // Cap at 10 frames: telemetry rows are read in a narrow drill-down pane.
          'code.stacktrace': frames.slice(0, 10).join('\n'),
        });
      }
    }
    return originalFetch.apply(this, args);
  };
}

// V8 caps stacks at 10 frames by default — the RxJS/HttpClient plumbing between a component
// method and window.fetch alone is ~50 frames deep (measured under ng serve), so lift the limit
// around the capture or the app's caller never even makes it into the raw stack.
function captureStack(): string {
  const limits = Error as unknown as { stackTraceLimit?: number };
  const previous = limits.stackTraceLimit;
  limits.stackTraceLimit = Infinity;
  const stack = new Error().stack ?? '';
  limits.stackTraceLimit = previous;
  return stack;
}

// Frames to drop so the topmost survivor is the app's caller: this wrapper, OTEL internals,
// dev-served dependency chunks (Angular's vite dev server serves them under /@fs/…/vite/deps/),
// and the RxJS/HttpClient plumbing between a subscribe call and window.fetch. The name
// alternatives tolerate esbuild's decorations (_FetchBackend, Observable2). Tuned against a live
// `ng serve` stack.
const VENDOR_FRAME =
  /captureStack|attributedFetch|@opentelemetry|node_modules|\/@fs\/|[/.]vite\/|zone\.js|polyfills|\bat _?(Observable|Subscriber|SafeSubscriber|ConsumerObserver|OperatorSubscriber|Subject|BehaviorSubject|FetchBackend|HttpInterceptorHandler|HttpClient|NoopNgZone)\d*[.\s]/;

function applicationFrames(stack: string): string[] {
  return stack
    .split('\n')
    .slice(1)
    .filter((line) => !VENDOR_FRAME.test(line));
}

function parseFrame(
  line: string,
): { functionName: string; file: string; line: number } | undefined {
  // V8: "    at Greeting.submit (http://host/main.js:12:34)" or "    at http://host/main.js:12:34"
  const named = /^\s*at (.+?) \((.+):(\d+):\d+\)$/.exec(line);
  if (named) {
    // esbuild's dev bundling aliases classes with a leading underscore (_Greeting.submit) — strip
    // it so the attribute reads like the source.
    return { functionName: named[1].replace(/^_+/, ''), file: named[2], line: Number(named[3]) };
  }
  const anon = /^\s*at (.+):(\d+):\d+$/.exec(line);
  return anon ? { functionName: '<anonymous>', file: anon[1], line: Number(anon[2]) } : undefined;
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
