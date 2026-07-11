package eu.wohlben.qits.testingrepo;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.fail;

import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.sdk.common.CompletableResultCode;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.sdk.trace.export.SpanExporter;
import io.opentelemetry.semconv.CodeAttributes;
import io.quarkus.arc.Unremovable;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Proves the telemetry enrichment end-to-end inside the SDK: the server span carries the {@code
 * code.*} handler attribution from {@link TelemetryMetaFilter}, and {@link GreetingService#compose}
 * mints a child span tagged {@code greeting.name}. The default {@code %test} profile disables the
 * OTel SDK (no collector to export to); this profile re-enables it and captures spans in-process —
 * the default {@code quarkus.otel.traces.exporter=cdi} composes every CDI {@link SpanExporter}
 * bean, so the in-memory exporter below needs no extra dependency or registration.
 */
@QuarkusTest
@TestProfile(TelemetrySpansTest.SpansEnabledProfile.class)
class TelemetrySpansTest {

  public static class SpansEnabledProfile implements QuarkusTestProfile {
    @Override
    public Map<String, String> getConfigOverrides() {
      return Map.of(
          "quarkus.otel.sdk.disabled", "false",
          // Build-time property; a @TestProfile re-augments, so this is honored. Keeps the
          // composite exporter free of the OTLP exporter, which would retry a missing collector.
          "quarkus.otel.exporter.otlp.enabled", "false",
          "quarkus.otel.logs.enabled", "false",
          "quarkus.otel.metrics.enabled", "false",
          // The batch span processor's default 5s delay would outlast the poll below.
          "quarkus.otel.bsp.schedule.delay", "100ms");
    }
  }

  /** Inert in every other profile — the SDK is off there and never resolves exporters. */
  @ApplicationScoped
  @Unremovable // reached only via programmatic CDI select, invisible to ArC's usage analysis
  public static class InMemorySpanExporter implements SpanExporter {
    static final List<SpanData> SPANS = new CopyOnWriteArrayList<>();

    @Override
    public CompletableResultCode export(Collection<SpanData> batch) {
      SPANS.addAll(batch);
      return CompletableResultCode.ofSuccess();
    }

    @Override
    public CompletableResultCode flush() {
      return CompletableResultCode.ofSuccess();
    }

    @Override
    public CompletableResultCode shutdown() {
      return CompletableResultCode.ofSuccess();
    }
  }

  @BeforeEach
  void reset() {
    InMemorySpanExporter.SPANS.clear();
  }

  @Test
  void serverSpanCarriesHandlerAttributionWithComposeChild() throws InterruptedException {
    given()
        .contentType("application/json")
        .body("{\"name\":\"telemetry\"}")
        .when()
        .post("/api/greetings")
        .then()
        .statusCode(200);

    List<SpanData> spans = awaitSpans(2);

    SpanData server =
        spans.stream()
            // The route name may render with or without the /api prefix — match the suffix.
            .filter(s -> s.getKind() == SpanKind.SERVER && s.getName().endsWith("/greetings"))
            .findFirst()
            .orElseThrow(() -> new AssertionError("no /greetings server span in " + spans));
    assertEquals(
        "eu.wohlben.qits.testingrepo.GreetingResource.greet",
        server.getAttributes().get(CodeAttributes.CODE_FUNCTION_NAME));
    assertEquals(
        "src/main/java/eu/wohlben/qits/testingrepo/GreetingResource.java",
        server.getAttributes().get(CodeAttributes.CODE_FILE_PATH));

    SpanData compose =
        spans.stream()
            .filter(s -> s.getName().equals("GreetingService.compose"))
            .findFirst()
            .orElseThrow(() -> new AssertionError("no GreetingService.compose span in " + spans));
    assertEquals(server.getSpanId(), compose.getParentSpanId());
    assertEquals("telemetry", compose.getAttributes().get(AttributeKey.stringKey("greeting.name")));
  }

  /** Deadline poll — the fixture's test classpath deliberately has no awaitility. */
  private static List<SpanData> awaitSpans(int minimum) throws InterruptedException {
    long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
    while (System.nanoTime() < deadline) {
      List<SpanData> snapshot = List.copyOf(InMemorySpanExporter.SPANS);
      if (snapshot.size() >= minimum) {
        return snapshot;
      }
      Thread.sleep(50);
    }
    return fail("expected " + minimum + " spans, got " + InMemorySpanExporter.SPANS);
  }
}
