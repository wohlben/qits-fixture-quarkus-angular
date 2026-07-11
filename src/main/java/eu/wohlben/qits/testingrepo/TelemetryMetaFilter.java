package eu.wohlben.qits.testingrepo;

import io.opentelemetry.api.trace.Span;
import io.opentelemetry.semconv.CodeAttributes;
import org.jboss.resteasy.reactive.server.ServerRequestFilter;
import org.jboss.resteasy.reactive.server.SimpleResourceInfo;

/**
 * Stamps handler attribution (stable semconv {@code code.*}) onto the server span Quarkus already
 * created: which class/method handles this request, and where its source file lives under the
 * standard Maven layout. One filter, every resource — no per-endpoint ceremony, no second span.
 */
public class TelemetryMetaFilter {

  @ServerRequestFilter // post-matching by default: the resource is resolved when this runs
  void stampHandlerAttribution(SimpleResourceInfo resourceInfo) {
    Class<?> resourceClass = resourceInfo.getResourceClass();
    if (resourceClass == null) {
      return; // nothing matched (404 and friends)
    }
    Span span = Span.current();
    if (!span.getSpanContext().isValid() || !span.isRecording()) {
      return; // SDK disabled, or the URI is on the suppress list (the OTLP passthrough)
    }
    span.setAttribute(
        CodeAttributes.CODE_FUNCTION_NAME,
        resourceClass.getName() + "." + resourceInfo.getMethodName());
    span.setAttribute(CodeAttributes.CODE_FILE_PATH, sourceFilePath(resourceClass));
  }

  /**
   * Workspace-relative source path by standard-Maven-layout convention: {@code
   * src/main/java/<package-path>/<TopLevelClass>.java}. Nested classes resolve to their enclosing
   * top-level class's file. A convention-strength guess (wrong for generated/multi-source-root
   * handlers) — metadata, not control flow.
   */
  static String sourceFilePath(Class<?> resourceClass) {
    Class<?> topLevel = resourceClass;
    while (topLevel.getEnclosingClass() != null) {
      topLevel = topLevel.getEnclosingClass();
    }
    String pkg = topLevel.getPackageName();
    String pkgPath = pkg.isEmpty() ? "" : pkg.replace('.', '/') + "/";
    return "src/main/java/" + pkgPath + topLevel.getSimpleName() + ".java";
  }
}
