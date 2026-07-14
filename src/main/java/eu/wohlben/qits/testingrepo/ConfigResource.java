package eu.wohlben.qits.testingrepo;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * {@code GET /api/config.json}: relays the backend's qits identity to its own SPA. The browser
 * cannot read env vars, but this process can — qits injects {@code OTEL_EXPORTER_OTLP_*} and
 * {@code QITS_CAPTURE_ENDPOINT} at daemon launch, and MicroProfile Config surfaces them as
 * {@code otel.exporter.otlp.endpoint} / {@code qits.capture.endpoint} etc. (in a production build
 * the same keys would come from application.properties instead).
 *
 * <p>The sections are independently nullable gates: {@code telemetry} is {@code null} without an
 * OTLP endpoint (SPA telemetry stays dark), {@code capture} is {@code null} without a capture
 * endpoint (no capture button). The backend relays; it does not proxy, validate, or stamp.
 */
@Path("/config.json")
public class ConfigResource {

  @ConfigProperty(name = "otel.exporter.otlp.endpoint")
  Optional<String> endpoint;

  @ConfigProperty(name = "otel.resource.attributes")
  Optional<String> resourceAttributes;

  @ConfigProperty(name = "otel.service.name")
  Optional<String> serviceName;

  @ConfigProperty(name = "qits.capture.endpoint")
  Optional<String> captureEndpoint;

  public record ConfigResponse(TelemetryConfig telemetry, CaptureConfig capture) {}

  public record TelemetryConfig(Map<String, String> resourceAttributes, String serviceName) {}

  public record CaptureConfig(String ingestUrl, Map<String, String> resourceAttributes) {}

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  public ConfigResponse config() {
    return new ConfigResponse(telemetry(), capture());
  }

  private TelemetryConfig telemetry() {
    if (endpoint.isEmpty()) {
      return null;
    }
    return new TelemetryConfig(
        parseAttributes(resourceAttributes.orElse("")), serviceName.orElse("webapp"));
  }

  // Carries its own copy of the resource attributes (same otel.resource.attributes source) so the
  // two sections stay independently nullable.
  private CaptureConfig capture() {
    if (captureEndpoint.isEmpty()) {
      return null;
    }
    return new CaptureConfig(captureEndpoint.get(), parseAttributes(resourceAttributes.orElse("")));
  }

  /** Parses the {@code OTEL_RESOURCE_ATTRIBUTES} {@code k=v,k=v} list (qits writes plain pairs). */
  private static Map<String, String> parseAttributes(String raw) {
    Map<String, String> attributes = new LinkedHashMap<>();
    for (String pair : raw.split(",")) {
      String[] parts = pair.split("=", 2);
      if (parts.length == 2 && !parts[0].isBlank()) {
        attributes.put(parts[0].trim(), parts[1].trim());
      }
    }
    return attributes;
  }
}
