import { InjectionToken } from '@angular/core';

/** URL of the AG-UI endpoint. `/api` is proxied to the backend by `proxy.conf.json`. */
export const AGENT_URL = new InjectionToken<string>('AGENT_URL', {
  factory: () => '/api/agent',
});
