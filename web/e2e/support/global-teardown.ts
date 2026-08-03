/** Stops the mocked auth service started by `./global-setup.ts`. */
import { stopAuthApiStub } from './auth-api-stub';

export default async function globalTeardown(): Promise<void> {
  await stopAuthApiStub();
}
