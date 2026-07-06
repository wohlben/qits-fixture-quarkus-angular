package eu.wohlben.qits.testingrepo;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * {@code POST /api/otel/v1/{traces|logs|metrics}}: byte-verbatim OTLP passthrough. The SPA exports
 * telemetry base-relative to its own backend (the one URL shape it already gets right everywhere);
 * this resource forwards the protobuf unmodified to {@code ${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/...}
 * — an address composed for <em>this</em> process's network, which the browser could not reliably
 * reach itself.
 *
 * <p>{@code 404} when no endpoint is configured (same gate as {@link ConfigResource} — a
 * correctly-gated SPA never calls it), {@code 502} when the upstream is unreachable (telemetry is
 * best-effort; the browser SDK's retry/drop behavior applies).
 */
@Path("/otel")
public class OtelProxyResource {

  private static final String PROTOBUF = "application/x-protobuf";
  private static final HttpClient CLIENT =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

  @ConfigProperty(name = "otel.exporter.otlp.endpoint")
  Optional<String> endpoint;

  @POST
  @Path("/v1/{signal: traces|logs|metrics}")
  @Consumes(PROTOBUF)
  public Response forward(
      @PathParam("signal") String signal,
      @HeaderParam(HttpHeaders.CONTENT_TYPE) String contentType,
      @HeaderParam("Content-Encoding") String contentEncoding,
      byte[] body) {
    if (endpoint.isEmpty()) {
      return Response.status(Response.Status.NOT_FOUND).build();
    }
    String base = endpoint.get().replaceAll("/+$", "");
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create(base + "/v1/" + signal))
            .timeout(Duration.ofSeconds(10))
            .header("Content-Type", contentType != null ? contentType : PROTOBUF)
            .POST(HttpRequest.BodyPublishers.ofByteArray(body));
    if (contentEncoding != null) {
      request.header("Content-Encoding", contentEncoding);
    }
    try {
      HttpResponse<byte[]> upstream =
          CLIENT.send(request.build(), HttpResponse.BodyHandlers.ofByteArray());
      Response.ResponseBuilder response =
          Response.status(upstream.statusCode()).entity(upstream.body());
      upstream.headers().firstValue("Content-Type").ifPresent(response::type);
      return response.build();
    } catch (IOException e) {
      return Response.status(Response.Status.BAD_GATEWAY).build();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return Response.status(Response.Status.BAD_GATEWAY).build();
    }
  }
}
