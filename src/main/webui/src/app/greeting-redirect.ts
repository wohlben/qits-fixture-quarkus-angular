import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Fallback route target that sends the user to /greeting/world.
 *
 * It uses Router.navigateByUrl with `{ replaceUrl: true }` (the imperative equivalent of
 * "replaceUrl") rather than a route-config `redirectTo`. A config redirect performs a normal
 * navigation and leaves the pre-redirect URL in the history stack; replaceUrl swaps the current
 * entry in place, so Back doesn't bounce the user through the fallback URL.
 */
@Component({
  selector: 'app-greeting-redirect',
  template: '',
})
export class GreetingRedirect implements OnInit {
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.router.navigateByUrl('/greeting/world', { replaceUrl: true });
  }
}
