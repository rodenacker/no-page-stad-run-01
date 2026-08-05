'use client';

/**
 * Every imported expense payment request, as the transactions service reports it —
 * the one shared screen both the Finance Uploader (the auth service's `Importer`) and
 * the Approver work from (brief R1, R20). Read-only: nothing here changes a request
 * (BR1).
 *
 * Six things about this component are deliberate and easy to break:
 *
 * - **The whole set is read once, in the BROWSER, and held in memory.**
 *   `GET /v1/transactions` accepts no query parameters, so there is no server-side
 *   search, filter, sort or paging to ask for (brief §Notes & Caveats): the set below
 *   is the one the later narrowing, sorting and paging layers work over, and none of
 *   them re-reads the service. Reading from the browser is also what lets the session
 *   cookie travel by itself and makes the three non-data states this component's own
 *   business rather than a server render's.
 * - **Everything on screen is the service's own value.** The date is printed exactly
 *   as it arrived (its format is an unverified assumption for this epic — normalising
 *   on speculation would hide a real difference rather than surface it) and the amount
 *   keeps the number the service sent. A status or transaction type this app has never
 *   heard of is shown as written rather than blanked, remapped or treated as an error
 *   — the backend owns both vocabularies.
 * - **An account number never reaches the browser whole.** Only its last four digits
 *   are rendered, on every render path, and there is no control that reveals them
 *   wholesale. This is POPIA (project.md §Compliance), not formatting: a full value in
 *   a title or data attribute would leak it just as surely as printing it.
 * - **The wait is tiered** (R11/R19): under 300ms nothing is drawn at all, because a
 *   flash of skeleton is worse than a moment of stillness; from 300ms an announced
 *   placeholder stands in for the pending list; past 3s a still-loading message JOINS
 *   that placeholder rather than replacing it.
 * - **All three non-data states are answered** (project.md NFR-base-5): the announced
 *   busy state, a plain sentence when nothing has ever been imported plus the upload
 *   action as the next step, and — when the list cannot be read — the service's own
 *   wording plus one action that asks for it again. An empty list is an answer, not a
 *   failure.
 * - **The status chip is the shared `StatusBadge`**, which pairs an intent colour with
 *   the status TEXT and an icon, never colour alone (R14). This screen supplies only
 *   what each status MEANS; the tokens are the badge's.
 */

import { CircleCheck, CircleX, Inbox, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { StatusBadge } from '@/components/status/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  fetchTransactions,
  transactionListFailureMessage,
} from '@/lib/api/transactions';
import { UPLOAD_PATH } from '@/lib/auth/access-map';
import {
  lastFourDigitsOf,
  transactionTypeLabel,
} from '@/lib/transactions/display';
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
  isKnownTransactionStatus,
} from '@/types/transactions';

import type { StatusPresentation } from '@/components/status/StatusBadge';
import type {
  TransactionRead,
  TransactionReadList,
  TransactionStatus,
} from '@/types/transactions';

/** Announced while the list is being read, so the wait is not shapes and motion only. */
const LOADING_MESSAGE = 'Loading the expense requests…';

/** Said once the wait has gone on long enough to be worth mentioning (R11). */
const STILL_LOADING_MESSAGE =
  'Still loading the expense requests. This is taking longer than usual.';

/** Nothing has ever been imported — an answer, not a failure (R9/R17). */
const EMPTY_MESSAGE = 'No expense requests have been imported yet.';

/** The next step from that empty state: send a file in to be imported. */
const EMPTY_ACTION_LABEL = 'Submit an expense file';

/** Names what did not happen, so the alert is not just an apology. */
const FAILED_TITLE = 'Could not load the expense requests';

/**
 * The two thresholds R11/R19 fix. Real durations, deliberately not shortened or
 * made injectable: a threshold a test can move is a threshold nobody has to meet.
 */
const PLACEHOLDER_AFTER_MS = 300;
const STILL_LOADING_AFTER_MS = 3000;

/**
 * How much of the wait the user is shown: nothing at all, a placeholder standing in
 * for the pending list, or that placeholder plus a still-loading message.
 */
type WaitTier = 'brief' | 'placeholder' | 'prolonged';

/** Where the list is: being read, read, or unreadable. */
type ListState =
  | { phase: 'loading'; wait: WaitTier }
  | { phase: 'loaded'; requests: TransactionRead[] }
  | { phase: 'failed'; message: string };

const LOADING: ListState = { phase: 'loading', wait: 'brief' };

/**
 * What each recognised status MEANS (brief §Data Model, R14): an imported request is
 * simply where it stands, an approved one finished well, a rejected one was refused.
 * The colours those intents wear belong to the shared badge.
 *
 * "Cancelled" is not here on purpose: it is a FILE state, and a cancelled file's
 * requests never reach this list. The shared badge keeps a neutral intent available
 * for it, so its absence from this map is expected rather than an omission.
 */
const STATUS_PRESENTATION: Record<TransactionStatus, StatusPresentation> = {
  [TRANSACTION_STATUS_IMPORTED]: { intent: 'informational', icon: Inbox },
  [TRANSACTION_STATUS_APPROVED]: { intent: 'positive', icon: CircleCheck },
  [TRANSACTION_STATUS_REJECTED]: { intent: 'negative', icon: CircleX },
};

/**
 * The requests in a response body, tolerating a body that carries none: an absent
 * property is the empty list, which is a legitimate answer and not a failure.
 */
const requestsIn = (
  body: TransactionReadList | undefined,
): TransactionRead[] =>
  Array.isArray(body?.Transactions) ? body.Transactions : [];

/**
 * An account number as this screen may show it: its last four digits, and nothing
 * else in the markup. The dots are decoration a screen reader skips; what it reads
 * instead says which four digits these are.
 */
function MaskedAccountNumber({ accountNumber }: { accountNumber: string }) {
  const lastFour = lastFourDigitsOf(accountNumber);

  if (lastFour === '') {
    return <span className="text-muted-foreground">Not available</span>;
  }

  return (
    <span className="tabular-nums">
      <span aria-hidden="true">••••</span>
      <span className="sr-only">ending in </span>
      {lastFour}
    </span>
  );
}

/** One request's row: the service's values, its type in plain language, its status. */
function ExpenseRequestRow({ request }: { request: TransactionRead }) {
  return (
    <TableRow>
      <TableCell>{request.FileName}</TableCell>
      <TableCell className="font-medium">{request.Reference}</TableCell>
      <TableCell className="whitespace-nowrap">
        {request.TransactionDate}
      </TableCell>
      <TableCell>
        <MaskedAccountNumber accountNumber={request.AccountNumber} />
      </TableCell>
      <TableCell>{request.Description}</TableCell>
      <TableCell className="text-right tabular-nums">
        {request.Amount}
      </TableCell>
      <TableCell>{transactionTypeLabel(request.TransactionType)}</TableCell>
      <TableCell>
        <StatusBadge
          status={request.Status}
          presentation={
            isKnownTransactionStatus(request.Status)
              ? STATUS_PRESENTATION[request.Status]
              : undefined
          }
        />
      </TableCell>
    </TableRow>
  );
}

export function ExpenseRequestList() {
  const [state, setState] = useState<ListState>(LOADING);
  /** Bumped by Try again; asking for the list again is what re-runs the read. */
  const [readsRequested, setReadsRequested] = useState(0);

  /**
   * Reads the list and puts what came back on screen.
   *
   * `stillWatching` is how a caller says its read no longer matters: this component
   * has gone away, or the user has asked for the list again.
   */
  const readList = useCallback(
    (stillWatching: () => boolean): Promise<void> =>
      fetchTransactions()
        .then((body) => {
          if (!stillWatching()) {
            return;
          }
          setState({ phase: 'loaded', requests: requestsIn(body) });
        })
        .catch((error: unknown) => {
          if (!stillWatching()) {
            return;
          }
          // The service's own wording when it sent one, from either place a failure
          // can carry it — never the client's placeholder, which is plumbing
          // (project.md NFR-base-5).
          setState({
            phase: 'failed',
            message: transactionListFailureMessage(error),
          });
        }),
    [],
  );

  useEffect(() => {
    // A read still in flight when this component goes away — or when the user asks
    // for the list again — must not land on a screen that has moved on.
    let watching = true;

    /**
     * Moves the wait on one tier, and only while the list is still being read: a
     * timer that fires just after the answer arrived must not put a placeholder back
     * over rows that are already on screen.
     */
    const showWaitTier = (wait: WaitTier): void => {
      if (!watching) {
        return;
      }
      setState((current) =>
        current.phase === 'loading' ? { phase: 'loading', wait } : current,
      );
    };

    const placeholderTimer = setTimeout(() => {
      showWaitTier('placeholder');
    }, PLACEHOLDER_AFTER_MS);
    const stillLoadingTimer = setTimeout(() => {
      showWaitTier('prolonged');
    }, STILL_LOADING_AFTER_MS);

    const stopWaiting = (): void => {
      clearTimeout(placeholderTimer);
      clearTimeout(stillLoadingTimer);
    };

    void readList(() => watching).finally(stopWaiting);

    return () => {
      watching = false;
      stopWaiting();
    };
  }, [readsRequested, readList]);

  const readAgain = (): void => {
    setState(LOADING);
    setReadsRequested((reads) => reads + 1);
  };

  return (
    <div className="grid gap-4">
      {state.phase === 'loading' && state.wait !== 'brief' && (
        <div role="status" className="grid gap-2">
          <span className="sr-only">{LOADING_MESSAGE}</span>
          {/* Placeholders stand in for the rows that are on their way; the sentence
              above is what a screen reader is given, since a shape says nothing. */}
          <Skeleton aria-hidden="true" className="h-10 w-full" />
          <Skeleton aria-hidden="true" className="h-10 w-full" />
          <Skeleton aria-hidden="true" className="h-10 w-full" />
          {state.wait === 'prolonged' && (
            <p className="text-muted-foreground text-sm">
              {STILL_LOADING_MESSAGE}
            </p>
          )}
        </div>
      )}

      {state.phase === 'failed' && (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">{FAILED_TITLE}</AlertTitle>
          <AlertDescription className="text-foreground gap-3">
            <p>{state.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={readAgain}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {state.phase === 'loaded' &&
        (state.requests.length === 0 ? (
          <div className="grid justify-items-start gap-4">
            <p className="text-muted-foreground max-w-prose">{EMPTY_MESSAGE}</p>
            {/* The next step, as a real navigational link rather than a button that
                pushes a route. */}
            <Button asChild variant="outline">
              <Link href={UPLOAD_PATH}>{EMPTY_ACTION_LABEL}</Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Imported expense payment requests: the file each came from, its
              reference, transaction date, the last four digits of its account
              number, its description, amount, transaction type and status.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">File</TableHead>
                <TableHead scope="col">Reference</TableHead>
                <TableHead scope="col">Transaction date</TableHead>
                <TableHead scope="col">Account number</TableHead>
                <TableHead scope="col">Description</TableHead>
                <TableHead scope="col" className="text-right">
                  Amount
                </TableHead>
                <TableHead scope="col">Type</TableHead>
                <TableHead scope="col">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.requests.map((request) => (
                <ExpenseRequestRow key={request.Id} request={request} />
              ))}
            </TableBody>
          </Table>
        ))}
    </div>
  );
}
