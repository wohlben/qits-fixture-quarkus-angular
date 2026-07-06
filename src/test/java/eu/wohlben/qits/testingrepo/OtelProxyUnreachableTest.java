package eu.wohlben.qits.testingrepo;

import static io.restassured.RestAssured.given;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Endpoint configured but unreachable: the proxy answers 502, never hangs or 500s. */
@QuarkusTest
@TestProfile(OtelProxyUnreachableTest.UnreachableEndpointProfile.class)
class OtelProxyUnreachableTest {

  public static class UnreachableEndpointProfile implements QuarkusTestProfile {
    @Override
    public Map<String, String> getConfigOverrides() {
      // Port 1 (tcpmux) is reliably closed.
      return Map.of("otel.exporter.otlp.endpoint", "http://localhost:1");
    }
  }

  @Test
  void unreachableUpstreamYieldsBadGateway() {
    given()
        .contentType("application/x-protobuf")
        .body(new byte[] {1, 2, 3})
        .when()
        .post("/api/otel/v1/traces")
        .then()
        .statusCode(502);
  }
}
