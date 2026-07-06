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
 * {@code GET /api/config.json}: relays the backend's OpenTelemetry identity to its own SPA. The
 * browser cannot read env vars, but this process can — qits injects {@code OTEL_EXPORTER_OTLP_*} at
 * daemon launch, and MicroProfile Config surfaces them as {@code otel.exporter.otlp.endpoint} etc.
 * (in a production build the same keys would come from application.properties instead).
 *
 * <p>{@code telemetry} is {@code null} when no OTLP endpoint is configured — the gate that keeps
 * the SPA dark when the app runs standalone or the daemon's otel toggle is off.
 */
@Path("/config.json")
public class ConfigResource {

  @ConfigProperty(name = "otel.exporter.otlp.endpoint")
  Optional<String> endpoint;

  @ConfigProperty(name = "otel.resource.attributes")
  Optional<String> resourceAttributes;

  @ConfigProperty(name = "otel.service.name")
  Optional<String> serviceName;

  public record ConfigResponse(TelemetryConfig telemetry) {}

  public record TelemetryConfig(Map<String, String> resourceAttributes, String serviceName) {}

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  public ConfigResponse config() {
    if (endpoint.isEmpty()) {
      return new ConfigResponse(null);
    }
    return new ConfigResponse(
        new TelemetryConfig(
            parseAttributes(resourceAttributes.orElse("")), serviceName.orElse("webapp")));
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
