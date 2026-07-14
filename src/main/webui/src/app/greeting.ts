import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, distinctUntilChanged, map, merge, switchMap, tap } from 'rxjs';
import { GreetingHistoryStore } from './greeting-history-store';

interface GreetingResponse {
  name: string;
  timestamp: string;
}

/**
 * Reads the {@code :name} path param, asks the backend to greet it, and renders the reply — plus
 * a small form to greet somebody else.
 *
 * The name is taken from the route and URL-decoded before use, so /greeting/Ada%20Lovelace greets
 * "Ada Lovelace". (Angular's Router already decodes path params; we decode defensively and fall back
 * to the raw value so a stray literal '%' can't throw.) It POSTs { name } to the same-origin,
 * base-relative `api/greetings` (resolved against <base href>, so it works both at `/` and under the
 * qits daemon web-view prefix `/daemon/{worktree}/{daemon}/`) and shows "Hello {name}".
 *
 * One POST per distinct name, whichever leg supplies it first: the route (deep links,
 * back/forward) or the form. A submit pushes the name synchronously — under the stack context
 * manager that is what nests the POST beneath the `interaction save-greeting` span — and then
 * navigates to keep the URL truthful; distinctUntilChanged suppresses the echo when that
 * navigation makes paramMap re-emit the same name.
 */
@Component({
  selector: 'app-greeting',
  template: `
    <!-- data-track-event: the telemetry decree attribute. It sits on the form because a submit
         event's target is the form, and the interaction span is named from the target or its
         closest() ancestor carrying the attribute. -->
    <form data-track-event="save-greeting" (submit)="submit($event, nameInput.value)">
      <label>Name <input name="name" #nameInput [value]="name()" /></label>
      <button type="submit">Greet</button>
    </form>
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
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly history = inject(GreetingHistoryStore);

  private readonly routeName = this.route.paramMap.pipe(
    map((params) => decodeName(params.get('name'))),
  );
  private readonly submittedName = new Subject<string>();

  protected readonly name = toSignal(this.routeName, { initialValue: 'world' });

  protected readonly greeting = toSignal(
    merge(this.routeName, this.submittedName).pipe(
      distinctUntilChanged(),
      switchMap((name) => this.http.post<GreetingResponse>('api/greetings', { name })),
      // Every answered greeting lands in the history store — the state a capture snapshots.
      tap((g) => this.history.record(g.name)),
    ),
  );

  protected submit(event: Event, rawName: string): void {
    event.preventDefault();
    const name = rawName.trim() || 'world';
    // Synchronously first: only synchronous work stays inside the interaction span (zoneless app,
    // stack context manager), and this is the leg that fires the POST.
    this.submittedName.next(name);
    // Then reflect it in the URL — async, so it surfaces as its own Navigation span.
    this.router.navigate(['/greeting', name]);
  }
}

function decodeName(raw: string | null): string {
  const value = raw ?? 'world';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
