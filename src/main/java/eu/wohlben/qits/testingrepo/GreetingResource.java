package eu.wohlben.qits.testingrepo;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.time.Instant;

/**
 * The whole backend: {@code POST /api/greetings} with a JSON body {@code {"name": "..."}} echoes the
 * name back with a server timestamp: {@code {"name": "...", "timestamp": "2026-07-05T..."}}. The
 * {@code /api} prefix comes from {@code quarkus.rest.path}; this resource only declares
 * {@code /greetings}.
 */
@Path("/greetings")
public class GreetingResource {

  public record GreetingRequest(String name) {}

  public record GreetingResponse(String name, Instant timestamp) {}

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  public GreetingResponse greet(GreetingRequest request) {
    return new GreetingResponse(request.name(), Instant.now());
  }
}
