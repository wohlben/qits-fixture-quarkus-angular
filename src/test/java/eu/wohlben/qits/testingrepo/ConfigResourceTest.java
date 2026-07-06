package eu.wohlben.qits.testingrepo;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.nullValue;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

/** The unconfigured (standalone, no qits) case: telemetry reports dark, the passthrough 404s. */
@QuarkusTest
class ConfigResourceTest {

  @Test
  void configReportsNullTelemetryWithoutOtelEndpoint() {
    given()
        .when()
        .get("/api/config.json")
        .then()
        .statusCode(200)
        .body("telemetry", nullValue());
  }

  @Test
  void otelProxyIsGoneWithoutOtelEndpoint() {
    given()
        .contentType("application/x-protobuf")
        .body(new byte[] {1, 2, 3})
        .when()
        .post("/api/otel/v1/traces")
        .then()
        .statusCode(404);
  }

  @Test
  void otelProxyRejectsUnknownSignals() {
    given()
        .contentType("application/x-protobuf")
        .body(new byte[] {1, 2, 3})
        .when()
        .post("/api/otel/v1/bogus")
        .then()
        .statusCode(404);
  }
}
