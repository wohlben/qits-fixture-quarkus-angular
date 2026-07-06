package eu.wohlben.qits.testingrepo;

import com.sun.net.httpserver.HttpServer;
import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.util.Map;

/**
 * A stub OTLP collector on an ephemeral port, wired into the app as {@code
 * otel.exporter.otlp.endpoint} (the env-var-shaped key the resources read). Records the last
 * request for assertions; answers 200 on {@code /v1/traces} and 400 on {@code /v1/logs} so the
 * proxy's status relay is observable in both directions. (Quarkus's own OpenTelemetry SDK would
 * also pick up the {@code otel.*} keys and spam the stub, but it is disabled for the whole test
 * profile in application.properties.)
 */
public class OtelStubTestResource implements QuarkusTestResourceLifecycleManager {

  static volatile String lastMethod;
  static volatile String lastPath;
  static volatile String lastContentType;
  static volatile byte[] lastBody;

  private HttpServer server;

  @Override
  public Map<String, String> start() {
    try {
      server = HttpServer.create(new InetSocketAddress(0), 0);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
    server.createContext(
        "/",
        exchange -> {
          lastMethod = exchange.getRequestMethod();
          lastPath = exchange.getRequestURI().getPath();
          lastContentType = exchange.getRequestHeaders().getFirst("Content-Type");
          lastBody = exchange.getRequestBody().readAllBytes();
          int status = exchange.getRequestURI().getPath().endsWith("/v1/logs") ? 400 : 200;
          exchange.sendResponseHeaders(status, -1);
          exchange.close();
        });
    server.start();
    return Map.of(
        "otel.exporter.otlp.endpoint", "http://localhost:" + server.getAddress().getPort(),
        "otel.resource.attributes",
            "qits.workspace.id=ws-1,qits.repository.id=repo-1,qits.command.id=cmd-1",
        "otel.service.name", "fixture-dev");
  }

  @Override
  public void stop() {
    if (server != null) {
      server.stop(0);
    }
  }
}
