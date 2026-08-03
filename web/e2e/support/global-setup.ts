/**
 * Starts the mocked auth service before any spec runs, so the Next.js server's
 * own server-side auth calls (`requireSession()` → `GET /v1/auth/userinfo`) hit a
 * mock instead of a live backend. See `./auth-api-stub.ts` for why `page.route()`
 * alone cannot cover that boundary.
 */
import { startAuthApiStub } from './auth-api-stub';

export default async function globalSetup(): Promise<void> {
  await startAuthApiStub();
}
