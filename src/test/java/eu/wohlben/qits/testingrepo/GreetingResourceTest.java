package eu.wohlben.qits.testingrepo;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.is;
import static org.hamcrest.CoreMatchers.notNullValue;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

@QuarkusTest
class GreetingResourceTest {

  @Test
  void greetEchoesNameWithTimestamp() {
    given()
        .contentType("application/json")
        .body("{\"name\":\"world\"}")
        .when()
        .post("/api/greetings")
        .then()
        .statusCode(200)
        .body("name", is("world"))
        .body("timestamp", notNullValue());
  }
}
