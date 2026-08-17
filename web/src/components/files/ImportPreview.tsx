'use client';

/**
 * Every row of a submitted file, and what will happen to it (epic `import-preview`
 * FR1–FR5, FR8, BR2, BR3, BR8, BR9, NFR-3, NFR-4).
 *
 * The section downloads the file the user actually submitted, reads it as CSV in the
 * browser, overlays the rows the service rejected, and lists the result — one row per
 * line of the file, in the order the file put them in.
 *
 * Eight things here are deliberate and easy to break:
 *
 * - **Nothing at all is rendered — and nothing is read — until the file's validation
 *   has run** (`Imported` or `Validation failed`, FR1). A file still being processed has
 *   nothing to preview, and downloading a whole file the user is shown nothing of is a
 *   cost paid for no answer.
 * - **ONE ORDERED LIST, NOT TWO STACKED HALVES.** The brief's "two halves" language is
 *   about the two per-row DISPLAY conventions below, not about splitting the rows into
 *   two tables: a will-import row and a rejected row sit next to each other in the
 *   positions their file gave them. Grouping by verdict would destroy file order, which
 *   is the whole point of a preview the user compares against their own file.
 * - **THE VERDICT IS "Will import", NEVER "Imported"** (BR2, the epic's honesty rule).
 *   These verdicts are the app's OWN determination — the file, plus the service's own
 *   validation errors — not a claim that the backend has imported anything. It has not.
 *   The same goes for the counts: rows that WILL import.
 * - **THE TWO PER-ROW CONVENTIONS** (BR3, user-confirmed). A will-import row reads like
 *   a listed expense payment request: its account number masked to the last four digits
 *   with NO way to unmask it, and its transaction type in the app's plain language. A
 *   rejected row reads like `RejectedRows` already renders one: the file's own values
 *   printed exactly as the file held them (no `transactionTypeLabel` — the point is to
 *   show the user what to correct), the account number masked with the same PER-ROW
 *   reveal, and the defect wording from the shared `lib/files/defectWording.ts`. There
 *   is no reveal-all control anywhere, and none may be added (POPIA).
 * - **A ROW THE MATCH CANNOT PLACE IS STILL LISTED** (BR9). The join between a rejected
 *   row and its line in the file is `lib/files/importPreviewRows.ts`'s, including the
 *   fallback: a rejection matching no line is listed once, on its own, with the values
 *   and reason the service gave for it. This section renders that row like any other
 *   rejected row — masked account number and reveal included.
 * - **A FILE THAT CANNOT BE READ IS A HANDLED STATE, NEVER A HALF-DRAWN TABLE** (BR8). A
 *   body that will not parse, a column shape that is not this file's, and a row count
 *   that does not reconcile with the record count the service reports all produce a
 *   plainly stated problem and NO table at all — a partial or misaligned table would
 *   quietly tell the user something false about their file.
 * - **A FAILED READ IS A DIFFERENT ANSWER FROM AN UNREADABLE FILE**, and is reported in
 *   the SERVICE's own words (`downloadFailureMessage` / `validationErrorsFailureMessage`
 *   — the client's internal placeholders never reach a user), with one control offering
 *   to load the preview again. It is worded `Load the preview again` because this page
 *   is crowded with ask-again controls and no two of them may share a name.
 * - **KEEPING CURRENT IS THE CALLER'S DECISION**, exactly as `RejectedRows` and
 *   `FileProcessingHistory` arrange it: `SubmittedFileDetail` owns the page's single
 *   interval and hands `refreshSignal` down, and a new value means "ask again". This
 *   section grows no timer of its own, and takes no session or role prop — both roles
 *   see everything here (FR8, §Access control).
 */

import { CircleCheck, CircleX, Eye, EyeOff, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { MaskedAccountNumber } from '@/components/requests/MaskedAccountNumber';
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
  downloadFailureMessage,
  downloadSubmittedFile,
  fetchFileValidationErrors,
  rejectedRowsIn,
  validationErrorsFailureMessage,
} from '@/lib/api/files';
import { NO_REASON_GIVEN } from '@/lib/files/defectWording';
import { importPreviewRows } from '@/lib/files/importPreviewRows';
import {
  UNEXPECTED_COLUMNS,
  parseSubmittedFileCsv,
} from '@/lib/files/parseSubmittedFileCsv';
import { readBlobText } from '@/lib/files/readBlobText';
import { transactionTypeLabel } from '@/lib/transactions/display';
import {
  FILE_STATUS_IMPORTED,
  FILE_STATUS_VALIDATION_FAILED,
} from '@/types/files';

import type { StatusPresentation } from '@/components/status/StatusBadge';
import type {
  ImportPreviewRow,
  ImportPreviewRows,
  ImportPreviewVerdict,
} from '@/lib/files/importPreviewRows';
import type { SubmittedFileReadProblem } from '@/lib/files/parseSubmittedFileCsv';
import type { FileLog } from '@/types/files';

/** What the section is called, and what ties its heading to it. The name carries the
 * word "preview", which is how the whole section is addressed as a region. */
const HEADING_ID = 'import-preview-heading';
const HEADING = 'Import preview';

/** Announced while the file is being fetched and read — a shape on its own says
 * nothing, and this wait covers a download AND a parse. */
const LOADING_MESSAGE = 'Loading the preview of this file…';

/**
 * THE TWO VERDICTS, and the word that is never one of them (BR2). "Will import" is a
 * statement about what the service will do with the row, not a claim that it has.
 */
const WILL_IMPORT_LABEL = 'Will import';
const REJECTED_LABEL = 'Rejected';

/** What each verdict MEANS, in the project's shared status vocabulary (UI-21 / NFR-4:
 * an intent colour paired with an icon AND the words, never colour alone). */
const VERDICT_PRESENTATION: Record<ImportPreviewVerdict, StatusPresentation> = {
  'will-import': { intent: 'positive', icon: CircleCheck },
  rejected: { intent: 'negative', icon: CircleX },
};

const VERDICT_LABEL: Record<ImportPreviewVerdict, string> = {
  'will-import': WILL_IMPORT_LABEL,
  rejected: REJECTED_LABEL,
};

/** What each value is called in the heading row. */
const COLUMN = {
  verdict: 'What will happen',
  reference: 'Reference',
  transactionDate: 'Transaction date',
  accountNumber: 'Account number',
  description: 'Description',
  amount: 'Amount',
  transactionType: 'Transaction type',
  currency: 'Currency',
  defect: 'What is wrong',
} as const;

/** What the table is, for a reader who meets it without seeing its shape. */
const TABLE_CAPTION =
  'Every row of the file you submitted, in the order the file holds them, with what will happen to each one. Account numbers show their last four digits; a rejected row can be unmasked one row at a time.';

/** Said in a cell whose value the source file did not hold at all. */
const NOT_RECORDED = 'Not recorded';

/** The reveal control's two states. Each names what it acts on AND what it does — and
 * says which list it belongs to, since the Rejected rows section on this same page
 * offers its own control for the very same row. */
const REVEAL_ACCOUNT_NUMBER = 'Reveal account number';
const HIDE_ACCOUNT_NUMBER = 'Hide account number';
const IN_THIS_PREVIEW = 'in the import preview';

/**
 * The one action that asks for the preview again.
 *
 * Deliberately none of the ask-again wordings this page has already spent: `Try again`
 * (the processing history), `Try again to load the rejected rows`, `Load this file
 * again`, `Retry validation`. Two controls with the same name on one page cannot be
 * told apart, by a reader or by a test.
 */
const LOAD_AGAIN_LABEL = 'Load the preview again';

/** Names what did not happen, so an alert is not just an apology. */
const FAILED_TITLE = 'Could not load the preview';
const UNREADABLE_TITLE = 'This file could not be read';

/** The file arrived, but nothing in it could be read as CSV — so there is nothing
 * honest to show, not even the lines that came before it went wrong (BR8). */
const UNREADABLE_BODY_MESSAGE =
  'The file that was submitted could not be read as a CSV file, so its rows cannot be previewed. Download the original file to see what was submitted.';

/** The file reads perfectly well — it is just not this file's shape. Naming the columns
 * is what makes it something the user can act on. */
const UNEXPECTED_COLUMNS_MESSAGE =
  'The file that was submitted could not be read: its columns are not the seven this app expects — Reference, TransactionDate, AccountNumber, Description, Amount, TransactionType, Currency.';

/**
 * Something went wrong that nothing here anticipated. The app's own plain wording: the
 * client's internal placeholders never reach a user (project.md NFR-base-5), and a
 * throw would take the whole file page down with it (BR8).
 */
const PREVIEW_UNAVAILABLE_MESSAGE =
  'The preview of this file could not be loaded. Please ask for it again.';

/** The service answered with something that is not a list of rejected rows, so which
 * rows were rejected is unknown — and every row would otherwise be shown as one that
 * will import, which is a claim the app cannot make (BR2). */
const UNREADABLE_OVERLAY_MESSAGE =
  'The rejected rows for this file could not be read, so this preview cannot say what will happen to each row. Ask for the preview again — if it keeps happening, the file’s error file has the same rows in it.';

/**
 * The file parses, and the app is not looking at what it thinks it is looking at
 * (FR5, BR8). Reported as a problem reading the file rather than as an ordinary preview
 * with different numbers, which would quietly contradict the record count already on
 * this page.
 */
const countMismatchMessage = (parsed: number, reported: string): string =>
  `This file could not be read as the file the service recorded: it holds ${String(parsed)} rows, but the service reports ${reported} records for it. Nothing is previewed while the two disagree.`;

/** How many of the file's rows will import — never "imported" (BR2). */
const willImportStatement = (count: number): string =>
  `${String(count)} ${count === 1 ? 'row' : 'rows'} will import.`;

/** How many were rejected. Zero is said in words rather than as a bare digit. */
const rejectedStatement = (count: number): string => {
  if (count === 0) {
    return 'No rows were rejected.';
  }
  return count === 1
    ? '1 row was rejected.'
    : `${String(count)} rows were rejected.`;
};

/** Whether this file's validation has run, which is the whole condition on previewing
 * it at all (FR1). */
const validationHasRun = (status: string): boolean =>
  status === FILE_STATUS_IMPORTED || status === FILE_STATUS_VALIDATION_FAILED;

/**
 * Whether the rows the file holds agree with the record count the service reports for
 * it. A record count that is not a number at all is nothing to reconcile against, so it
 * is not treated as a disagreement.
 */
const reconcilesWithRecordCount = (
  parsedRowCount: number,
  recordCount: string,
): boolean => {
  if (recordCount.trim() === '') {
    return true;
  }
  const reported = Number(recordCount);
  return Number.isFinite(reported) ? reported === parsedRowCount : true;
};

/** Which row a reveal control belongs to, for a reader who meets it out of context —
 * the row's own description, else its reference, else nothing. */
const rowLabelOf = (row: ImportPreviewRow): string | undefined =>
  [row.values.Description, row.values.Reference].find((value) => value !== '');

/** Where the preview is: being read, read, unreadable, or unreachable. */
type PreviewState =
  | { phase: 'loading' }
  | {
      phase: 'loaded';
      preview: ImportPreviewRows;
      /**
       * Which rejected rows the reader has asked to see the full account number of, by
       * their key in this answer. Part of THIS answer, so the next read starts fully
       * masked without anything having to reset it (POPIA).
       */
      revealed: ReadonlySet<string>;
    }
  | { phase: 'cannot-read'; message: string }
  | { phase: 'failed'; message: string };

const LOADING: PreviewState = { phase: 'loading' };

/** What to say about a file story 1's reader refused. */
const cannotReadMessageFor = (problem: SubmittedFileReadProblem): string =>
  problem === UNEXPECTED_COLUMNS
    ? UNEXPECTED_COLUMNS_MESSAGE
    : UNREADABLE_BODY_MESSAGE;

/** One read, and either what it answered or what to tell the user about its refusal. */
type ReadOutcome<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * A read that never rejects: its refusal comes back as the SERVICE's own wording for
 * that particular call, so a failed download and a failed rejected-rows read stay two
 * different answers even though the two run side by side.
 *
 * `Promise.resolve` wraps the call rather than trusting it to be a promise: nothing
 * this section does may throw, and an endpoint function that answered with something
 * unexpected is a failure to report, not a crash to take the file's page down with.
 */
const attempt = <T,>(
  read: Promise<T>,
  wordingFor: (error: unknown) => string,
): Promise<ReadOutcome<T>> =>
  Promise.resolve(read)
    .then((value) => ({ ok: true as const, value }))
    .catch((error: unknown) => ({
      ok: false as const,
      message: wordingFor(error),
    }));

/** A recorded value as its source held it, or a plain "there wasn't one". */
function RecordedValue({ value }: { value: string }) {
  if (value === '') {
    return <span className="text-muted-foreground">{NOT_RECORDED}</span>;
  }
  // Printed as it arrived: an amount that is text and a date that is not a date cannot
  // be formatted, and the reader needs to see exactly what to correct.
  return <>{value}</>;
}

/** What will happen to this row, as words paired with an intent colour and an icon. */
function VerdictBadge({ verdict }: { verdict: ImportPreviewVerdict }) {
  return (
    <StatusBadge
      status={VERDICT_LABEL[verdict]}
      presentation={VERDICT_PRESENTATION[verdict]}
    />
  );
}

/**
 * The whole section, but only for a file whose validation has run (contract: nothing at
 * all otherwise — including no read).
 */
export function ImportPreview({
  file,
  refreshSignal = 0,
}: {
  file: FileLog;
  /**
   * Changed by the caller when this file may have moved on — a retry it accepted, or
   * its own interval while the file is still working. Every value is as good as any
   * other; only CHANGING it means anything.
   */
  refreshSignal?: number;
}) {
  if (!validationHasRun(file.CurrentStatus)) {
    return null;
  }

  return (
    <ImportPreviewSection
      fileLogId={file.Id}
      recordCount={file.RecordCount}
      refreshSignal={refreshSignal}
    />
  );
}

function ImportPreviewSection({
  fileLogId,
  recordCount,
  refreshSignal,
}: {
  fileLogId: number;
  recordCount: string;
  refreshSignal: number;
}) {
  const [state, setState] = useState<PreviewState>(LOADING);
  /** Bumped by the load-again action; asking for the preview is what re-runs the reads. */
  const [readsRequested, setReadsRequested] = useState(0);

  /**
   * Reads the file and the rejected-row overlay, assembles the preview, and puts what
   * came back on screen.
   *
   * The two reads run side by side but are reported separately, because a refused
   * download and a refused overlay are different things to tell the user — and neither
   * is the same answer as a file that arrived and could not be read.
   *
   * `stillWatching` is how a caller says its read no longer matters: this component has
   * gone away, or the user has asked again since.
   *
   * NOTHING HERE THROWS. Every way this can go wrong ends in a state the section can
   * render, including one nobody anticipated — an unhandled throw in the browser would
   * take the whole file page down with it, which is precisely the crash BR8 forbids.
   */
  const readPreview = useCallback(
    async (stillWatching: () => boolean): Promise<void> => {
      // A re-read that fails leaves the preview on screen rather than replacing an
      // answer with an error (the pattern `SubmittedFilesList` established), and a read
      // whose screen has moved on lands nowhere at all.
      const report = (next: PreviewState): void => {
        if (!stillWatching()) {
          return;
        }
        setState((current) => (current.phase === 'loaded' ? current : next));
      };

      const assemble = async (): Promise<void> => {
        const [downloaded, overlay] = await Promise.all([
          attempt(downloadSubmittedFile(fileLogId), downloadFailureMessage),
          attempt(
            fetchFileValidationErrors(fileLogId),
            validationErrorsFailureMessage,
          ),
        ]);

        if (!downloaded.ok) {
          report({ phase: 'failed', message: downloaded.message });
          return;
        }
        if (!overlay.ok) {
          report({ phase: 'failed', message: overlay.message });
          return;
        }

        const rejections = rejectedRowsIn(overlay.value);
        if (rejections === undefined) {
          report({ phase: 'cannot-read', message: UNREADABLE_OVERLAY_MESSAGE });
          return;
        }

        let body: string;
        try {
          body = await readBlobText(downloaded.value);
        } catch {
          // The bytes arrived and could not be read — nothing the service said
          // anything about, so this is the app's own plain wording.
          report({ phase: 'cannot-read', message: UNREADABLE_BODY_MESSAGE });
          return;
        }

        const read = await parseSubmittedFileCsv(body);

        if (read.status === 'cannot-read') {
          report({
            phase: 'cannot-read',
            message: cannotReadMessageFor(read.problem),
          });
          return;
        }

        if (!reconcilesWithRecordCount(read.rows.length, recordCount)) {
          report({
            phase: 'cannot-read',
            message: countMismatchMessage(read.rows.length, recordCount),
          });
          return;
        }

        if (!stillWatching()) {
          return;
        }

        setState({
          phase: 'loaded',
          preview: importPreviewRows(read.rows, rejections),
          // A fresh answer starts fully masked, including a re-read of a file that
          // was validated again: which rows were revealed belongs to the answer that
          // was on screen, not to the section (POPIA).
          revealed: new Set<string>(),
        });
      };

      try {
        await assemble();
      } catch {
        // Nothing anticipated is left to report, and a throw would take the file's
        // whole page down — so it becomes a state, with a way to ask again.
        report({ phase: 'failed', message: PREVIEW_UNAVAILABLE_MESSAGE });
      }
    },
    [fileLogId, recordCount],
  );

  useEffect(() => {
    // A read still in flight when this component goes away — or when the user asks
    // again — must not land on a screen that has moved on.
    let watching = true;

    void readPreview(() => watching);

    return () => {
      watching = false;
    };
  }, [readsRequested, refreshSignal, readPreview]);

  const readAgain = (): void => {
    setState(LOADING);
    setReadsRequested((reads) => reads + 1);
  };

  /** Reveals the full account number of ONE row, and of no other. */
  const revealAccountNumber = (key: string): void => {
    setState((current) =>
      current.phase === 'loaded'
        ? { ...current, revealed: new Set([...current.revealed, key]) }
        : current,
    );
  };

  /** Puts one revealed account number back behind its mask. */
  const hideAccountNumber = (key: string): void => {
    setState((current) => {
      if (current.phase !== 'loaded') {
        return current;
      }
      const revealed = new Set(current.revealed);
      revealed.delete(key);
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

      {(state.phase === 'cannot-read' || state.phase === 'failed') && (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">
            {state.phase === 'failed' ? FAILED_TITLE : UNREADABLE_TITLE}
          </AlertTitle>
          <AlertDescription className="text-foreground gap-3">
            <p>{state.message}</p>
            {state.phase === 'failed' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={readAgain}
              >
                {LOAD_AGAIN_LABEL}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {state.phase === 'loaded' && (
        <>
          {/* What the file adds up to, in plain language and in the app's own honest
              terms: rows that WILL import, and rows the service rejected (FR5, BR2). */}
          <div className="grid gap-1">
            <p>{willImportStatement(state.preview.counts.willImport)}</p>
            <p>{rejectedStatement(state.preview.counts.rejected)}</p>
          </div>

          <Table>
            <TableCaption className="sr-only">{TABLE_CAPTION}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{COLUMN.verdict}</TableHead>
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
              {state.preview.rows.map((row) => {
                const isRejected = row.verdict === 'rejected';
                const accountNumber = row.values.AccountNumber;
                const isRevealed = state.revealed.has(row.key);
                const rowLabel = rowLabelOf(row);

                return (
                  <TableRow key={row.key}>
                    <TableCell>
                      <VerdictBadge verdict={row.verdict} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <RecordedValue value={row.values.Reference} />
                    </TableCell>
                    <TableCell>
                      <RecordedValue value={row.values.TransactionDate} />
                    </TableCell>
                    <TableCell>
                      {accountNumber === '' ? (
                        <RecordedValue value={accountNumber} />
                      ) : isRejected ? (
                        // A rejected row is one the user has to go and correct, so the
                        // full number is reachable — for that ONE row, and only while
                        // this answer is on screen.
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
                                hideAccountNumber(row.key);
                              } else {
                                revealAccountNumber(row.key);
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
                            <span className="sr-only">
                              {rowLabel === undefined
                                ? ` ${IN_THIS_PREVIEW}`
                                : ` for ${rowLabel} ${IN_THIS_PREVIEW}`}
                            </span>
                          </Button>
                        </span>
                      ) : (
                        // A row that will import is a listed expense payment request,
                        // and the list convention offers no way to unmask one (BR3).
                        <MaskedAccountNumber accountNumber={accountNumber} />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <RecordedValue value={row.values.Description} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <RecordedValue value={row.values.Amount} />
                    </TableCell>
                    <TableCell>
                      {isRejected ? (
                        // The type as the file recorded it. NOT translated — the point
                        // is to show the user what their own file contains (BR3, FR3).
                        <RecordedValue value={row.values.TransactionType} />
                      ) : (
                        transactionTypeLabel(row.values.TransactionType)
                      )}
                    </TableCell>
                    <TableCell>
                      <RecordedValue value={row.values.Currency} />
                    </TableCell>
                    <TableCell className="max-w-prose whitespace-normal">
                      {/* Nothing is said about a row that will import: there is
                          nothing wrong with it. */}
                      {isRejected
                        ? (row.reason ?? (
                            <span className="text-muted-foreground">
                              {NO_REASON_GIVEN}
                            </span>
                          ))
                        : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
    </section>
  );
}
