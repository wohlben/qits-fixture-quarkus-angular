package eu.wohlben.qits.testingrepo;

import static io.restassured.RestAssured.given;
import static io.restassured.config.EncoderConfig.encoderConfig;
import static org.hamcrest.CoreMatchers.is;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

import io.quarkus.test.common.WithTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;

/** The configured case: config.json relays identity, the passthrough pipes bytes + status. */
@QuarkusTest
@WithTestResource(OtelStubTestResource.class)
class OtelProxyResourceTest {

  @Test
  void configRelaysParsedIdentity() {
    given()
        .when()
        .get("/api/config.json")
        .then()
        .statusCode(200)
        .body("telemetry.serviceName", is("fixture-dev"))
        .body("telemetry.resourceAttributes.'qits.workspace.id'", is("ws-1"))
        .body("telemetry.resourceAttributes.'qits.repository.id'", is("repo-1"))
        .body("telemetry.resourceAttributes.'qits.command.id'", is("cmd-1"));
  }

  /** rest-assured otherwise appends a charset the real browser exporter never sends. */
  private static RequestSpecification givenBareContentType() {
    return given()
        .config(
            RestAssured.config()
                .encoderConfig(
                    encoderConfig().appendDefaultContentCharsetToContentTypeIfUndefined(false)));
  }

  @Test
  void forwardsBytesVerbatimAndRelaysSuccess() {
    byte[] payload = {8, 1, 18, 4, 116, 101, 115, 116};
    givenBareContentType()
        .contentType("application/x-protobuf")
        .body(payload)
        .when()
        .post("/api/otel/v1/traces")
        .then()
        .statusCode(200);
    assertEquals("POST", OtelStubTestResource.lastMethod);
    assertEquals("/v1/traces", OtelStubTestResource.lastPath);
    assertEquals("application/x-protobuf", OtelStubTestResource.lastContentType);
    assertArrayEquals(payload, OtelStubTestResource.lastBody);
  }

  @Test
  void relaysUpstreamFailureStatus() {
    given()
        .contentType("application/x-protobuf")
        .body(new byte[] {1})
        .when()
        .post("/api/otel/v1/logs")
        .then()
        .statusCode(400);
  }
}
