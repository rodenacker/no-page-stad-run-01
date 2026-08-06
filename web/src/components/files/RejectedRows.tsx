'use client';

/**
 * Which rows of a submitted file validation rejected, and what is wrong with each one
 * (brief FR1, FR2, FR3 — both roles read this, so this section takes no session or
 * role prop).
 *
 * Six things here are deliberate and easy to break:
 *
 * - **Nothing at all is rendered unless the file's validation FAILED.** No heading, no
 *   table, and no read: a file that imported has no rejected rows to ask about, so the
 *   whole section is absent from the markup rather than present-and-empty.
 * - **The rows are the file's OWN values, printed exactly as the source file held
 *   them** — including the values that failed a rule (an amount that is text, a date
 *   that is not a date, a currency code the service does not accept). Nothing here
 *   reformats or translates a value: in particular `transactionTypeLabel` (`C` →
 *   "Credit — money in"), which imported requests use, is deliberately NOT applied,
 *   because the whole point of this list is to show the user what their file actually
 *   contains so they can correct it outside the app. The account number is the single
 *   exception, and it is a compliance one (below).
 * - **WHERE THE DEFECT WORDING COMES FROM is the heart of this section, and the two
 *   sources are never mixed.** For the four rules this app owns — a missing
 *   `Reference`, a non-numeric `Amount`, an unreadable `TransactionDate`, an
 *   unsupported `Currency` — the app's own fixed wording is what the user reads and
 *   the service's machine-phrased text never reaches them. For anything else,
 *   including a `TransactionType` defect, the SERVICE's own reason is shown word for
 *   word. The app holds no accepted-value list for transaction type and never judges
 *   one itself — the service is the sole authority (brief §Notes & Caveats, a user
 *   decision at INTAKE; do not add an app-side enum or rule for that field). A row the
 *   service described without attributing it to a column shows what it was given; a
 *   row with no defect signal at all is still listed, and no reason is invented for it.
 * - **The rows arrive as a JSON STRING** inside `ValidationErrors.JsonArray`
 *   (`@/types/files`). Reading them is `rejectedRowsIn` in `lib/api/files.ts`, which
 *   answers `undefined` for every body that cannot be read as rows — a string that
 *   will not parse AND one that parses into something that is not a list of rows. Both
 *   are a handled state here (say so plainly), never a crash and never an empty table:
 *   an unhandled throw in the browser would take the whole file page down with it.
 * - **ACCOUNT NUMBERS ARE MASKED** to their last four digits (POPIA, project.md
 *   §Compliance) through the one masking component the request list already uses. The
 *   full value is rendered only for the ONE row an explicit action was taken on, and
 *   which rows are revealed is part of the loaded state — so a fresh read is fully
 *   masked again by construction rather than by remembering to reset a flag. There is
 *   no reveal-all control, and none may be added.
 * - **This section is read-only.** No row can be edited here or anywhere else in this
 *   project (brief §Out of Scope) — the user corrects their source data outside the
 *   app and retries validation.
 */

import { Eye, EyeOff, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { MaskedAccountNumber } from '@/components/requests/MaskedAccountNumber';
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
  fetchFileValidationErrors,
  rejectedRowsIn,
  validationErrorsFailureMessage,
} from '@/lib/api/files';
import { FILE_STATUS_VALIDATION_FAILED } from '@/types/files';

import type { FileLog, ValidationErrorRow } from '@/types/files';

/** What the section is called, and what ties its heading to it. */
const HEADING_ID = 'rejected-rows-heading';
const HEADING = 'Rejected rows';

/** Announced while the rows are being read — a shape on its own says nothing. */
const LOADING_MESSAGE = 'Loading the rejected rows…';

/**
 * The service answered, and reported no rejected rows. An answer about the file, not
 * a failure — so no alert and nothing to ask again for.
 */
const NONE_REPORTED_MESSAGE =
  'The transactions service reported no rejected rows for this file.';

/**
 * The body arrived but could not be read as rows. Named for what the user can tell
 * about it, and deliberately not dressed up as the service refusing the call — it
 * answered, with something this app cannot list.
 */
const UNREADABLE_TITLE = 'These rejected rows could not be read';
const UNREADABLE_MESSAGE =
  'The transactions service answered with something this app could not read as a list of rows. Ask for them again — if it keeps happening, the file’s error file has the same rows in it.';

/** Names what did not happen, so the alert is not just an apology. */
const FAILED_TITLE = 'Could not load the rejected rows';

/**
 * The one action that asks for the rows again.
 *
 * Deliberately NOT the bare words "Try again", which the processing history's own
 * failed read owns on this same screen (matched there as `/^try again$/i`): two
 * controls with the same name on one page cannot be told apart, by a reader or by a
 * test.
 */
const ASK_AGAIN_LABEL = 'Try again to load the rejected rows';

/** The reveal control's two states. Each names what it acts on AND what it does. */
const REVEAL_ACCOUNT_NUMBER = 'Reveal account number';
const HIDE_ACCOUNT_NUMBER = 'Hide account number';

/**
 * Which row a reveal control belongs to, for a reader who meets it out of context —
 * the row's own description, else its reference, else nothing (a row rejected for a
 * missing reference may have neither). Same shape as the per-file "Open" control in
 * `SubmittedFilesList`: visible wording plus an accessible name naming the record.
 */
const rowLabelOf = (row: ValidationErrorRow): string | undefined =>
  [row.Description, row.Reference].find(
    (value) => value !== undefined && value !== '',
  );

/** Said in a cell whose value the source file did not hold at all. */
const NOT_RECORDED = 'Not recorded';

/**
 * Said in the defect cell of a row the service gave no reason for. It states what is
 * missing; it does not guess at a reason, which is the one thing this section must
 * never do (brief FR3, and the epic's recorded assumption about this response).
 */
const NO_REASON_GIVEN = 'No reason was given for this row.';

/**
 * The FOUR rules this app owns, and its fixed wording for each — quoted from the
 * brief's FR2 (`R38`, `R39`, `R40`, `R42`). This map is the app's entire vocabulary
 * about a defect: a column that is not in it is explained by the SERVICE, in the
 * service's own words.
 *
 * `TransactionType` is absent on purpose and must stay absent (FR3).
 */
const APP_OWNED_DEFECT_WORDING: Record<string, string> = {
  Reference: 'This request has no reference and cannot be imported.',
  Amount: 'Amount must be a number, for example 1245.67.',
  TransactionDate: 'Transaction date must be a valid date and time.',
  Currency: 'Currency must be a supported currency code.',
};

/** What each recorded value is called in the heading row. */
const COLUMN = {
  reference: 'Reference',
  transactionDate: 'Transaction date',
  accountNumber: 'Account number',
  description: 'Description',
  amount: 'Amount',
  transactionType: 'Transaction type',
  currency: 'Currency',
  defect: 'What is wrong',
} as const;

/**
 * What the user reads about one row's defect.
 *
 * The app speaks only where it owns the rule; everywhere else the service's own
 * sentence travels to the user untouched. `undefined` means the row carries no defect
 * signal at all, which is not a licence to invent one.
 */
const defectWordingFor = (row: ValidationErrorRow): string | undefined => {
  const { ErrorColumn, ErrorMessage } = row;

  if (ErrorColumn !== undefined) {
    const appOwned = APP_OWNED_DEFECT_WORDING[ErrorColumn];
    if (appOwned !== undefined) {
      return appOwned;
    }
  }

  return ErrorMessage;
};

/** Where the rejected rows are: being read, read, unreadable, or unreachable. */
type RejectedRowsState =
  | { phase: 'loading' }
  | {
      phase: 'loaded';
      rows: ValidationErrorRow[];
      /**
       * Which rows the reader has asked to see the full account number of, by their
       * position in this answer. Part of THIS answer, so the next read starts fully
       * masked without anything having to reset it (POPIA).
       */
      revealed: ReadonlySet<number>;
    }
  | { phase: 'unreadable' }
  | { phase: 'failed'; message: string };

const LOADING: RejectedRowsState = { phase: 'loading' };
const UNREADABLE: RejectedRowsState = { phase: 'unreadable' };

/** A recorded value as the source file held it, or a plain "there wasn't one". */
function RecordedValue({ value }: { value: string | number | undefined }) {
  if (value === undefined || value === '') {
    return <span className="text-muted-foreground">{NOT_RECORDED}</span>;
  }
  // Printed as it arrived: an amount that is text and a date that is not a date
  // cannot be formatted, and the reader needs to see exactly what to correct.
  return <>{value}</>;
}

/**
 * The whole section, but only for a file whose validation failed (contract: nothing
 * at all otherwise — including no read).
 */
export function RejectedRows({ file }: { file: FileLog }) {
  if (file.CurrentStatus !== FILE_STATUS_VALIDATION_FAILED) {
    return null;
  }

  return <RejectedRowsSection fileLogId={file.Id} />;
}

function RejectedRowsSection({ fileLogId }: { fileLogId: number }) {
  const [state, setState] = useState<RejectedRowsState>(LOADING);
  /** Bumped by the ask-again action; asking for the rows is what re-runs the read. */
  const [readsRequested, setReadsRequested] = useState(0);

  /**
   * Reads the rejected rows and puts what came back on screen.
   *
   * A read that ANSWERED but cannot be read as rows is its own state, separate from a
   * read that failed: the service said nothing about the first, so there is nothing of
   * its own wording to show.
   *
   * `stillWatching` is how a caller says its read no longer matters: this component has
   * gone away, or the user has asked again since.
   */
  const readRejectedRows = useCallback(
    (stillWatching: () => boolean): Promise<void> =>
      fetchFileValidationErrors(fileLogId)
        .then((body) => {
          if (!stillWatching()) {
            return;
          }
          const rows = rejectedRowsIn(body);
          setState(
            rows === undefined
              ? UNREADABLE
              : { phase: 'loaded', rows, revealed: new Set<number>() },
          );
        })
        .catch((error: unknown) => {
          if (!stillWatching()) {
            return;
          }
          // A re-read that fails leaves the rows on screen rather than replacing an
          // answer with an error (the pattern `SubmittedFilesList` established).
          setState((current) =>
            current.phase === 'loaded'
              ? current
              : {
                  phase: 'failed',
                  // The service's own wording whenever it sent one, from EITHER place
                  // a failure can carry it; never the client's own placeholder.
                  message: validationErrorsFailureMessage(error),
                },
          );
        }),
    [fileLogId],
  );

  useEffect(() => {
    // A read still in flight when this component goes away — or when the user asks
    // again — must not land on a screen that has moved on.
    let watching = true;

    void readRejectedRows(() => watching);

    return () => {
      watching = false;
    };
  }, [readsRequested, readRejectedRows]);

  const readAgain = (): void => {
    setState(LOADING);
    setReadsRequested((reads) => reads + 1);
  };

  /** Reveals the full account number of ONE row, and of no other. */
  const revealAccountNumber = (position: number): void => {
    setState((current) =>
      current.phase === 'loaded'
        ? {
            ...current,
            revealed: new Set([...current.revealed, position]),
          }
        : current,
    );
  };

  /** Puts one revealed account number back behind its mask. */
  const hideAccountNumber = (position: number): void => {
    setState((current) => {
      if (current.phase !== 'loaded') {
        return current;
      }
      const revealed = new Set(current.revealed);
      revealed.delete(position);
      return { ...current, revealed };
    });
  };

  return (
    <section aria-labelledby={HEADING_ID} className="grid gap-4">
      <h2 id={HEADING_ID} className="text-lg font-semibold tracking-tight">
        {HEADING}
      </h2>

      {state.phase === 'loading' && (
        <div role="status" className="grid gap-2">
          <span className="sr-only">{LOADING_MESSAGE}</span>
          {/* Placeholders stand in for the rows on their way; the sentence above is
              what a screen reader is given, since a shape says nothing. */}
          <Skeleton aria-hidden="true" className="h-10 w-full" />
          <Skeleton aria-hidden="true" className="h-10 w-full" />
        </div>
      )}

      {(state.phase === 'unreadable' || state.phase === 'failed') && (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">
            {state.phase === 'unreadable' ? UNREADABLE_TITLE : FAILED_TITLE}
          </AlertTitle>
          <AlertDescription className="text-foreground gap-3">
            <p>
              {state.phase === 'unreadable'
                ? UNREADABLE_MESSAGE
                : state.message}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={readAgain}
            >
              {ASK_AGAIN_LABEL}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {state.phase === 'loaded' &&
        (state.rows.length === 0 ? (
          <p className="text-muted-foreground max-w-prose">
            {NONE_REPORTED_MESSAGE}
          </p>
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Every row of this file that validation rejected, with the values
              the file recorded for it and what is wrong with it. Account
              numbers show their last four digits until you reveal one.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{COLUMN.reference}</TableHead>
                <TableHead scope="col">{COLUMN.transactionDate}</TableHead>
                <TableHead scope="col">{COLUMN.accountNumber}</TableHead>
                <TableHead scope="col">{COLUMN.description}</TableHead>
                <TableHead scope="col">{COLUMN.amount}</TableHead>
                <TableHead scope="col">{COLUMN.transactionType}</TableHead>
                <TableHead scope="col">{COLUMN.currency}</TableHead>
                <TableHead scope="col">{COLUMN.defect}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.rows.map((row, position) => {
                const accountNumber = row.AccountNumber;
                const isRevealed = state.revealed.has(position);
                const defectWording = defectWordingFor(row);
                const rowLabel = rowLabelOf(row);

                return (
                  <TableRow
                    // Nothing on a rejected row is documented as unique — the rows
                    // come from parsing an untrusted string — so its position in this
                    // answer completes the key rather than standing in for it.
                    key={`${String(row.Id ?? '')}|${String(position)}`}
                  >
                    <TableCell className="font-medium">
                      <RecordedValue value={row.Reference} />
                    </TableCell>
                    <TableCell>
                      <RecordedValue value={row.TransactionDate} />
                    </TableCell>
                    <TableCell>
                      {accountNumber === undefined || accountNumber === '' ? (
                        <RecordedValue value={accountNumber} />
                      ) : (
                        <span className="flex flex-wrap items-center gap-2">
                          {isRevealed ? (
                            <span className="tabular-nums">
                              {accountNumber}
                            </span>
                          ) : (
                            <MaskedAccountNumber
                              accountNumber={accountNumber}
                            />
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (isRevealed) {
                                hideAccountNumber(position);
                              } else {
                                revealAccountNumber(position);
                              }
                            }}
                          >
                            {isRevealed ? (
                              <EyeOff aria-hidden="true" />
                            ) : (
                              <Eye aria-hidden="true" />
                            )}
                            {isRevealed
                              ? HIDE_ACCOUNT_NUMBER
                              : REVEAL_ACCOUNT_NUMBER}
                            {rowLabel !== undefined && (
                              <span className="sr-only">for {rowLabel}</span>
                            )}
                          </Button>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <RecordedValue value={row.Description} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <RecordedValue value={row.Amount} />
                    </TableCell>
                    <TableCell>
                      {/* The type as the file recorded it. NOT translated — see this
                          file's header, and FR3: the app judges no transaction type. */}
                      <RecordedValue value={row.TransactionType} />
                    </TableCell>
                    <TableCell>
                      <RecordedValue value={row.Currency} />
                    </TableCell>
                    {defectWording === undefined ? (
                      <TableCell className="text-muted-foreground max-w-prose whitespace-normal">
                        {NO_REASON_GIVEN}
                      </TableCell>
                    ) : (
                      <TableCell className="max-w-prose whitespace-normal">
                        {defectWording}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ))}
    </section>
  );
}
