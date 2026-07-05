import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map, switchMap } from 'rxjs';

interface GreetingResponse {
  name: string;
  timestamp: string;
}

/**
 * Reads the {@code :name} path param, asks the backend to greet it, and renders the reply.
 *
 * The name is taken from the route and URL-decoded before use, so /greeting/Ada%20Lovelace greets
 * "Ada Lovelace". (Angular's Router already decodes path params; we decode defensively and fall back
 * to the raw value so a stray literal '%' can't throw.) It POSTs { name } to the same-origin,
 * base-relative `api/greetings` (resolved against <base href>, so it works both at `/` and under the
 * qits daemon web-view prefix `/daemon/{worktree}/{daemon}/`) and shows "Hello {name}".
 */
@Component({
  selector: 'app-greeting',
  template: `
    @if (greeting(); as g) {
      <h1>Hello, {{ g.name }}!</h1>
      <p>Greeted at {{ g.timestamp }}</p>
    } @else {
      <p>Greeting…</p>
    }
  `,
})
export class Greeting {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);

  protected readonly greeting = toSignal(
    this.route.paramMap.pipe(
      map((params) => decodeName(params.get('name'))),
      switchMap((name) => this.http.post<GreetingResponse>('api/greetings', { name })),
    ),
  );
}

function decodeName(raw: string | null): string {
  const value = raw ?? 'world';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
