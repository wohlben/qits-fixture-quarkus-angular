import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Greeting } from './greeting';

/**
 * A tiny spec beside greeting.ts. The fixture is generated with `--skip-tests` (no test runner is
 * wired), so this is not executed by any build — it exists so qits's framework-aware file browser has
 * a `greeting.spec.ts` to resolve for its test↔code tabs against `greeting.ts`.
 */
describe('Greeting', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('creates', () => {
    const fixture = TestBed.createComponent(Greeting);
    expect(fixture.componentInstance).toBeTruthy();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('api/greetings');
  });
});
