package eu.wohlben.qits.testingrepo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/** Plain unit test for the Maven-layout source-path derivation — no Quarkus needed. */
class TelemetryMetaFilterTest {

  @Test
  void topLevelClassResolvesToItsOwnFile() {
    assertEquals(
        "src/main/java/eu/wohlben/qits/testingrepo/GreetingResource.java",
        TelemetryMetaFilter.sourceFilePath(GreetingResource.class));
  }

  @Test
  void nestedClassResolvesToItsEnclosingTopLevelFile() {
    assertEquals(
        "src/main/java/eu/wohlben/qits/testingrepo/GreetingResource.java",
        TelemetryMetaFilter.sourceFilePath(GreetingResource.GreetingRequest.class));
  }

  @Test
  void defaultPackageYieldsNoEmptyPathSegment() throws ClassNotFoundException {
    // The default package cannot be imported; reflection can still reach it.
    Class<?> probe = Class.forName("DefaultPackageProbe");
    assertEquals("src/main/java/DefaultPackageProbe.java", TelemetryMetaFilter.sourceFilePath(probe));
  }
}
