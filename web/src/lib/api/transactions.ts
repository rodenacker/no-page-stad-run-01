/**
 * The transactions service's expense-request endpoint, as the browser addresses it.
 *
 * Every call goes through the shared API client (CLAUDE.md §2) at the app's OWN
 * address: `/transactions-api/...` is a mount point the route handler at
 * `app/transactions-api/[...path]/route.ts` forwards to the transactions service,
 * so the browser-managed `session` cookie travels same-origin and no service URL
 * appears in browser code (project.md §Data Source & Backend Integration).
 *
 * Endpoint functions live here rather than inside a screen, alongside the file
 * calls in `./files.ts`, so the request shape is stated once — notably that this
 * call takes NO parameters at all.
 */
import { get } from '@/lib/api/client';
import { serviceDetailOf, serviceMessageOf } from '@/lib/api/errors';
import { TRANSACTIONS_API_BASE_PATH } from '@/lib/utils/constants';

import type { TransactionReadList } from '@/types/transactions';

/** `GET /v1/transactions` — every imported expense payment request. */
export const TRANSACTIONS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/transactions`;

/**
 * Every imported expense payment request, exactly as the service reports it.
 *
 * The call takes NO query parameters (`documentation/transactions-api.yaml` →
 * `GET /v1/transactions`), so there is no server-side search, filter, sort or
 * paging to ask for: the whole set arrives in one response and every narrowing the
 * screen offers happens in the browser over that one set (brief §Notes & Caveats,
 * built for the 10,000-row ceiling).
 *
 * The body is `TransactionReadList`: `{ Transactions: [...] }`.
 */
export const fetchTransactions = (): Promise<TransactionReadList> =>
  get<TransactionReadList>(TRANSACTIONS_ENDPOINT);

/**
 * Shown when the list could not be read and the service said nothing readable about
 * why. The client's own placeholders ("Internal Server Error: …") are never put in
 * front of a user (project.md NFR-base-5).
 */
export const TRANSACTION_LIST_FAILED_MESSAGE =
  'The expense requests could not be loaded. Please try again.';

/**
 * What to tell the user when the list could not be read.
 *
 * The service's own reason wins whenever it sent one, and it has to be looked for in
 * BOTH places a failure can carry it: the transactions service describes a failure
 * with a 500 + `DefaultResponse` body, and for a 500 the shared client keeps its own
 * placeholder on `message` and the service's `Messages[]` on `details` — so
 * `serviceMessageOf` alone would find nothing here and the user would be shown
 * plumbing.
 */
export const transactionListFailureMessage = (error: unknown): string =>
  serviceMessageOf(error) ??
  serviceDetailOf(error) ??
  TRANSACTION_LIST_FAILED_MESSAGE;
