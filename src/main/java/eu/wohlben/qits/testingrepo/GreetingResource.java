package eu.wohlben.qits.testingrepo;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

/**
 * The backend boundary: {@code POST /api/greetings} with a JSON body {@code {"name": "..."}} echoes
 * the name back with a server timestamp: {@code {"name": "...", "timestamp": "2026-07-05T..."}} —
 * composed by {@link GreetingService}. The {@code /api} prefix comes from {@code
 * quarkus.rest.path}; this resource only declares {@code /greetings}.
 */
@Path("/greetings")
public class GreetingResource {

  public record GreetingRequest(String name) {}

  private final GreetingService greetingService;

  GreetingResource(GreetingService greetingService) {
    this.greetingService = greetingService;
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.APPLICATION_JSON)
  public GreetingService.Greeting greet(GreetingRequest request) {
    return greetingService.compose(request.name());
  }
}
