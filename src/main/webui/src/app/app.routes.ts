import { Routes } from '@angular/router';

import { Greeting } from './greeting';
import { GreetingRedirect } from './greeting-redirect';

export const routes: Routes = [
  { path: 'greeting/:name', component: Greeting },

  // Bare /greeting (and /greeting/) plus any other path fall back to /greeting/world.
  // We route to a component that calls Router.navigateByUrl(..., { replaceUrl: true })
  // instead of a config `redirectTo`, so the intermediate URL is not pushed onto the
  // browser history (a config redirect would leave a back-button trap).
  { path: 'greeting', component: GreetingRedirect },
  { path: '', component: GreetingRedirect },
  { path: '**', component: GreetingRedirect },
];
