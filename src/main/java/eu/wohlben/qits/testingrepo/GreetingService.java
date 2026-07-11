package eu.wohlben.qits.testingrepo;

import io.opentelemetry.instrumentation.annotations.SpanAttribute;
import io.opentelemetry.instrumentation.annotations.WithSpan;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Instant;

/**
 * The fixture's one business seam, existing to give traces an interior: {@code @WithSpan} mints a
 * {@code GreetingService.compose} child span under the server span, tagged with the composed name.
 * Works on any CDI bean invoked through its injected proxy — never on a same-class self-invocation.
 */
@ApplicationScoped
public class GreetingService {

  public record Greeting(String name, Instant timestamp) {}

  @WithSpan
  public Greeting compose(@SpanAttribute("greeting.name") String name) {
    return new Greeting(name, Instant.now());
  }
}
