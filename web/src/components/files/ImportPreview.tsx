'use client';

/**
 * Every row of a submitted file, and what will happen to it (epic `import-preview`
 * FR1–FR5, FR8, BR2, BR3, BR8, BR9, NFR-3, NFR-4).
 *
 * The section downloads the file the user actually submitted, reads it as CSV in the
 * browser, overlays the rows the service rejected, and lists the result — every row that
 * will import first, then every rejected row appended at the back as its own headed
 * block.
 *
 * Eight things here are deliberate and easy to break:
 *
 * - **Nothing at all is rendered — and nothing is read — until the file's validation
 *   has run** (`Imported` or `Validation failed`, FR1). A file still being processed has
 *   nothing to preview, and downloading a whole file the user is shown nothing of is a
 *   cost paid for no answer.
 * - **ONE LISTING, WITH THE REJECT LISTING APPENDED AT THE BACK** (`files-view-redesign`
 *   R14/R15, design brief §3 Cross-surface reach — "the reject listing appended at the
 *   back exactly as the document does it"). Every row that will import is listed first,
 *   in the file's own relative order among themselves; every rejected row follows at the
 *   close, in the file's own relative order among themselves, under its own tracked
 *   micro-label heading with a hairline above it. The two are never interleaved.
 *   **THE REORDER HAPPENS HERE, AT RENDER, AND NOWHERE ELSE** — see
 *   {@link arrangedRowsOf}. `lib/files/importPreviewRows.ts` still emits one row per line
 *   in FILE order, because `lib/files/correctionCsv.ts` derives the correction download
 *   from exactly that array and the download's row scope and order are protected
 *   behaviour (BR2). Pushing the arrangement down into the parse layer would silently
 *   re-order the file a user downloads to correct.
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
 * - **A FAILED READ IS A DIFFERENT ANSWER FROM AN UNREADABLE FILE.** A refused call is
 *   reported in the SERVICE's own words (`downloadFailureMessage` /
 *   `validationErrorsFailureMessage` — the client's internal placeholders never reach a
 *   user); a rejected-rows body the app cannot make sense of is reported in the app's,
 *   but it is a FAILED read all the same, because the file is fine and asking again may
 *   answer properly. Every failed read carries one control offering to load the preview
 *   again — the ONLY states that offer one, so no message may tell a user to ask again
 *   from a state without it. It is worded `Load the preview again` because this page is
 *   crowded with ask-again controls and no two of them may share a name.
 * - **KEEPING CURRENT IS THE CALLER'S DECISION**, exactly as `RejectedRows` and
 *   `FileProcessingHistory` arrange it: `SubmittedFileDetail` owns the page's single
 *   interval and hands `refreshSignal` down, and a new value means "ask again". This
 *   section grows no timer of its own, and takes no session or role prop — both roles
 *   see everything here (FR8, §Access control).
 *
 * ---------------------------------------------------------------------------
 * HOW IT IS DRAWN — one ruled listing, in the register's own grammar
 * (`files-view-redesign` R15, design brief §3)
 * ---------------------------------------------------------------------------
 * Every piece of the notation is IMPORTED from `components/requests/fieldNotation.ts` and
 * never restated here (BR6). This is the pre-commit artifact the design calls its
 * strongest fit, so it is drawn as the source document it is:
 *
 * - **Restyled THROUGH the Shadcn table primitive**, never replaced: real `<table>`
 *   semantics, `<th scope="col">`, the caption and the header row all stay, because a
 *   screen reader navigates this preview by its nine named columns.
 * - **ONE table with ONE header row and TWO row groups** — not two differently-styled
 *   tables (R15). The rejected block is the second `<tbody>`, named by its own heading
 *   through `aria-labelledby`, so the boundary that keeps a rejected row from being taken
 *   for a will-import one exists in the accessibility tree and not only in ink.
 * - **Full-bleed to the page padding** (`PAGE_BLEED_CLASS`) so every hairline row rule
 *   reaches the edge of the page, with that padding put back on the outer cells
 *   (`LISTING_EDGE_PADDING_CLASS`) so the values stay lined up with the slip's labels
 *   above them. The closing hairline is drawn on that box: the primitive deliberately
 *   leaves the last row of each row group unruled.
 * - **No card and no striped row.** The rules are the whole treatment, and the
 *   primitive's per-row hover fill and colour transition are cancelled at the row
 *   (`LISTING_ROW_CLASS`) — a row that tints under the pointer is the stripe arriving one
 *   row at a time (BR9).
 * - **The column heads, this section's heading and the rejected block's heading are the
 *   same object**: the tracked 11px mono micro-label at the muted ink
 *   (`LISTING_LABEL_CLASS`). The capitals are `text-transform`, so every head's wording —
 *   and the accessible name built from it — is exactly the word the app wrote. R15
 *   restyles these heads; it renames none of them.
 * - **Reference, transaction date and account number are set in the fixed-field face**
 *   (`NOTATION_CELL_CLASS`): each is an identifier rather than a figure to be added up,
 *   and the mono face is what makes one row scannable against the next. The amount is the
 *   row's own figure, so it is right-aligned and tabular (`FIGURE_CELL_CLASS`) even where
 *   the file held something that is not a number — which is exactly what a reader has to
 *   see to correct it. Description, transaction type and the defect are prose and stay in
 *   the text face, at no added weight.
 * - **Each answer that is not a row is a full-bleed ruled band** (`RULED_BAND_CLASS`) —
 *   the wait and every problem, the latter carrying the `alert` with the card the
 *   primitive ships with stripped off it (`RULED_ALERT_CLASS`). The wording, the roles and
 *   the one `Load the preview again` are unchanged.
 */

import { Eye, EyeOff, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { CorrectionRowsDownload } from '@/components/files/CorrectionRowsDownload';
import {
  FIGURE_CELL_CLASS,
  LISTING_EDGE_PADDING_CLASS,
  LISTING_LABEL_CLASS,
  LISTING_ROW_CLASS,
  NOTATION_CELL_CLASS,
  PAGE_BLEED_CLASS,
  RULED_ACTION_CLASS,
  RULED_ACTION_ICON_CLASS,
  RULED_ACTION_WITH_ICON_CLASS,
  RULED_ALERT_CLASS,
  RULED_ALERT_TITLE_CLASS,
  RULED_BAND_CLASS,
} from '@/components/requests/fieldNotation';
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
import { rowsToFixIn } from '@/lib/files/correctionCsv';
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
 * an intent colour paired with a shape AND the words, never colour alone). The shapes
 * themselves belong to the shared mark, so a verdict here and a status on any other
 * screen cannot be drawn two different ways. */
const VERDICT_PRESENTATION: Record<ImportPreviewVerdict, StatusPresentation> = {
  'will-import': { intent: 'positive' },
  rejected: { intent: 'negative' },
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

/**
 * What the table is, for a reader who meets it without seeing its shape.
 *
 * IT DESCRIBES THE ARRANGEMENT, because for this reader it is the only account of it
 * there is. R14 stopped the listing being in the file's own order, so a caption still
 * claiming it was would be a quiet lie to precisely the person who cannot see the two
 * blocks drawn apart. What the file's order still governs is the order WITHIN each
 * block, and that is what this says.
 */
const TABLE_CAPTION =
  'Every row of the file you submitted, with what will happen to each one: first every row that will import, then every rejected row together in its own section at the end. Within each of the two, the rows stay in the order the file put them in. Account numbers show their last four digits; a rejected row can be unmasked one row at a time.';

/**
 * The appended reject listing's own heading, and what ties it to the block it heads.
 *
 * IT IS DELIBERATELY NOT "Rejected rows": the `RejectedRows` section on this same page is
 * called exactly that, and two things with one name on one screen cannot be told apart —
 * by a reader or by a test — which is the same rule the ask-again controls here follow.
 * It still BEGINS with the word rejected, because that is the word a reader scanning for
 * the block is looking for, and it says what the block means rather than only naming it.
 */
const REJECTED_BLOCK_HEADING_ID = 'import-preview-rejected-block-heading';
const REJECTED_BLOCK_HEADING = 'Rejected — will not import';

/** How many columns the listing has, so the rejected block's heading spans all of them.
 * Derived from {@link COLUMN} rather than counted by hand, so a column added or removed
 * cannot leave the heading short. */
const COLUMN_COUNT = Object.keys(COLUMN).length;

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

/**
 * The service answered with something that is not a list of rejected rows, so which
 * rows were rejected is unknown — and every row would otherwise be shown as one that
 * will import, which is a claim the app cannot make (BR2).
 *
 * Reported as a FAILED read, not as an unreadable FILE: the file itself is fine, and
 * this is one call's answer, so the next one may well come back properly. That is what
 * the message asks the user to do — and `failed` is the phase that carries the control
 * to do it. Saying "ask again" in a state with no way to ask is the one shape this
 * must never take.
 */
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

/**
 * THE ARRANGEMENT (R14/R15) — and the whole of the reorder this story is.
 *
 * A stable partition by verdict over the rows the preview ALREADY holds: every row that
 * will import, then every rejected one. Because `importPreviewRows` hands them over in
 * file order — the file's own lines first, then any rejection matching no line of its own
 * (BR9) — filtering preserves that order inside each block for free, which is exactly
 * what the two blocks have to keep: the file's own relative order among their own rows,
 * with a rejection that has no line at the very back of the reject listing.
 *
 * IT IS A PRESENTATION DECISION, MADE HERE. The rows it reads are not re-ordered:
 * `lib/files/correctionCsv.ts` builds the file a user downloads to correct from that same
 * array, and its row scope and order are protected behaviour (BR2). Nothing below writes
 * back to it.
 */
const arrangedRowsOf = (
  rows: readonly ImportPreviewRow[],
): { willImport: ImportPreviewRow[]; rejected: ImportPreviewRow[] } => ({
  willImport: rows.filter((row) => row.verdict !== 'rejected'),
  rejected: rows.filter((row) => row.verdict === 'rejected'),
});

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

/**
 * What is wrong with a rejected row, in the shared wording (`lib/files/defectWording`).
 *
 * ONE DEFECT READS AS A SENTENCE, SEVERAL READ AS A LIST. Almost every rejected row has
 * exactly one defect and must look exactly as it always has; a row the service reported
 * more than one for (its amount is not a number AND its currency is not supported) says
 * all of them, because the person correcting the file has to fix all of them — showing
 * only the first would send them round the correct-and-re-upload loop twice.
 */
function DefectReasons({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) {
    // The service gave no defect signal for this row. Say so; never invent one.
    return <span className="text-muted-foreground">{NO_REASON_GIVEN}</span>;
  }
  if (reasons.length === 1) {
    return <>{reasons[0]}</>;
  }
  return (
    <ul className="grid list-disc gap-1 ps-4">
      {reasons.map((reason) => (
        <li key={reason}>{reason}</li>
      ))}
    </ul>
  );
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
 * ONE ROW OF THE LISTING, drawn identically wherever the arrangement puts it.
 *
 * It is one component rather than one per block precisely BECAUSE the two blocks are one
 * listing (R15): a second copy for the reject listing is how a rule weight, a face or a
 * defect's wording would quietly stop matching the rows above it. What differs between
 * the two halves is what a row SAYS about itself (the two per-row conventions, BR3), and
 * that is decided from the row's own verdict here — never from which block it landed in.
 */
function PreviewRow({
  row,
  isRevealed,
  onReveal,
  onHide,
}: {
  row: ImportPreviewRow;
  isRevealed: boolean;
  onReveal: (key: string) => void;
  onHide: (key: string) => void;
}) {
  const isRejected = row.verdict === 'rejected';
  const accountNumber = row.values.AccountNumber;
  const rowLabel = rowLabelOf(row);

  return (
    <TableRow className={LISTING_ROW_CLASS}>
      <TableCell>
        <VerdictBadge verdict={row.verdict} />
      </TableCell>
      {/* The reference is this row's identifier, so it is set in the fixed-field face —
          and at no added weight, a `font-medium` down a ruled column being the card
          era's hierarchy rather than this one. */}
      <TableCell className={NOTATION_CELL_CLASS}>
        <RecordedValue value={row.values.Reference} />
      </TableCell>
      <TableCell className={NOTATION_CELL_CLASS}>
        <RecordedValue value={row.values.TransactionDate} />
      </TableCell>
      <TableCell className={NOTATION_CELL_CLASS}>
        {accountNumber === '' ? (
          <RecordedValue value={accountNumber} />
        ) : isRejected ? (
          // A rejected row is one the user has to go and correct, so the full number is
          // reachable — for that ONE row, and only while this answer is on screen.
          <span className="flex flex-wrap items-center gap-2">
            {isRevealed ? (
              <span className="tabular-nums">{accountNumber}</span>
            ) : (
              <MaskedAccountNumber accountNumber={accountNumber} />
            )}
            {/* The reveal is a control on a ruled listing, so it wears the shared ruled
                action notation rather than a boxed button — there are no boxes left on
                this page for one to match. Its wording, and the row it names, are
                unchanged: the capitals are `text-transform`. */}
            <Button
              type="button"
              variant="ghost"
              className={RULED_ACTION_WITH_ICON_CLASS}
              onClick={() => {
                if (isRevealed) {
                  onHide(row.key);
                } else {
                  onReveal(row.key);
                }
              }}
            >
              {isRevealed ? (
                <EyeOff
                  aria-hidden="true"
                  className={RULED_ACTION_ICON_CLASS}
                />
              ) : (
                <Eye aria-hidden="true" className={RULED_ACTION_ICON_CLASS} />
              )}
              {isRevealed ? HIDE_ACCOUNT_NUMBER : REVEAL_ACCOUNT_NUMBER}
              <span className="sr-only">
                {rowLabel === undefined
                  ? ` ${IN_THIS_PREVIEW}`
                  : ` for ${rowLabel} ${IN_THIS_PREVIEW}`}
              </span>
            </Button>
          </span>
        ) : (
          // A row that will import is a listed expense payment request, and the list
          // convention offers no way to unmask one (BR3).
          <MaskedAccountNumber accountNumber={accountNumber} />
        )}
      </TableCell>
      <TableCell className="whitespace-normal">
        <RecordedValue value={row.values.Description} />
      </TableCell>
      {/* The row's own figure: right-aligned and tabular down the column, so the digits
          line up — including where the file held something that is not a number at all,
          which is exactly what the reader has to see to correct it. */}
      <TableCell className={FIGURE_CELL_CLASS}>
        <RecordedValue value={row.values.Amount} />
      </TableCell>
      <TableCell>
        {isRejected ? (
          // The type as the file recorded it. NOT translated — the point is to show the
          // user what their own file contains (BR3, FR3).
          <RecordedValue value={row.values.TransactionType} />
        ) : (
          transactionTypeLabel(row.values.TransactionType)
        )}
      </TableCell>
      <TableCell>
        <RecordedValue value={row.values.Currency} />
      </TableCell>
      <TableCell className="max-w-prose whitespace-normal">
        {/* Nothing is said about a row that will import: there is nothing wrong with
            it. */}
        {isRejected ? <DefectReasons reasons={row.reasons} /> : null}
      </TableCell>
    </TableRow>
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
          report({ phase: 'failed', message: UNREADABLE_OVERLAY_MESSAGE });
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
      {/* The section names itself in the same tracked micro-label the column heads below
          it wear — a printed listing labels itself in the notation it is set in, and a
          bold sentence-case title here would be the last of the card era's hierarchy left
          above a ruled page. The capitals are `text-transform`, so the heading a screen
          reader is given (and the name this whole region is addressed by) is still the
          words the app wrote. */}
      <h2 id={HEADING_ID} className={LISTING_LABEL_CLASS}>
        {HEADING}
      </h2>

      {state.phase === 'loading' && (
        /* The wait is a place that is not a row, so it is the shared ruled band — the
           rules the rows will carry are already there when the answer lands, rather than
           the section jumping from floating shapes into a ruled page. */
        <div role="status" className={`${RULED_BAND_CLASS} py-4`}>
          <span className="sr-only">{LOADING_MESSAGE}</span>
          {/* Placeholders stand in for the rows on their way; the sentence above is
              what a screen reader is given, since a shape says nothing. Square —
              nothing in this world has a radius. */}
          <div aria-hidden="true" className="grid gap-3">
            <Skeleton className="h-4 w-full rounded-none" />
            <Skeleton className="h-4 w-2/3 rounded-none" />
          </div>
        </div>
      )}

      {(state.phase === 'cannot-read' || state.phase === 'failed') && (
        /* Nothing honest can be listed, so this band stands where the listing would be,
           ruled and full-bleed like it. The `alert` is stripped of the primitive's card
           and the band's own hairlines frame it; its wording, its role and its one
           `Load the preview again` are unchanged, the control now wearing the same ruled
           notation as every other one on this page. */
        <div className={`${RULED_BAND_CLASS} py-6`}>
          <Alert className={RULED_ALERT_CLASS}>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className={RULED_ALERT_TITLE_CLASS}>
              {state.phase === 'failed' ? FAILED_TITLE : UNREADABLE_TITLE}
            </AlertTitle>
            <AlertDescription className="text-foreground gap-3">
              <p>{state.message}</p>
              {state.phase === 'failed' && (
                <Button
                  type="button"
                  variant="ghost"
                  className={RULED_ACTION_CLASS}
                  onClick={readAgain}
                >
                  {LOAD_AGAIN_LABEL}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {state.phase === 'loaded' && (
        <LoadedPreview
          preview={state.preview}
          revealed={state.revealed}
          onReveal={revealAccountNumber}
          onHide={hideAccountNumber}
        />
      )}
    </section>
  );
}

/**
 * THE ANSWER: what the file adds up to, the file to correct offline, and the listing
 * itself with the reject listing appended at the back.
 *
 * It is its own component so the arrangement (R14) can be derived once, by name, from the
 * rows the loaded state holds — a `filter` buried in a JSX expression is how the one
 * genuine change this epic makes to what a person sees would become hard to find again.
 */
function LoadedPreview({
  preview,
  revealed,
  onReveal,
  onHide,
}: {
  preview: ImportPreviewRows;
  /** Which rejected rows the reader has asked to see the full account number of, by
   * their key in THIS answer (POPIA — see {@link PreviewState}). */
  revealed: ReadonlySet<string>;
  onReveal: (key: string) => void;
  onHide: (key: string) => void;
}) {
  const arranged = arrangedRowsOf(preview.rows);

  return (
    <>
      {/* What the file adds up to, in plain language and in the app's own honest
          terms: rows that WILL import, and rows the service rejected (FR5, BR2). */}
      <div className="grid gap-1">
        <p>{willImportStatement(preview.counts.willImport)}</p>
        <p>{rejectedStatement(preview.counts.rejected)}</p>
      </div>

      {/* The rejected rows as a file to correct offline and send back in (FR6). It lives
          HERE, beside the rows it is built from, rather than in the Downloads section,
          which keeps the service's own diagnostic error file (FR7, BR6) — and it is absent
          entirely when nothing was rejected. */}
      <CorrectionRowsDownload rejectedRows={rowsToFixIn(preview)} />

      {/* ONE LISTING, IN TWO ROW GROUPS. It runs full-bleed to the page padding so every
          hairline row rule reaches the edge of the page, with that padding put back on the
          outer cells; the closing hairline is drawn here rather than on the last row,
          which the primitive deliberately leaves unruled. No card, no panel, no striped
          rows: what frames the preview is the ruling. */}
      <div className={`${PAGE_BLEED_CLASS} border-b`}>
        <Table className={LISTING_EDGE_PADDING_CLASS}>
          <TableCaption className="sr-only">{TABLE_CAPTION}</TableCaption>
          {/* ONE header row for both blocks — the rejected rows are a section of this
              listing, not a second table with heads of its own (R15). */}
          <TableHeader>
            <TableRow className={LISTING_ROW_CLASS}>
              <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                {COLUMN.verdict}
              </TableHead>
              <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                {COLUMN.reference}
              </TableHead>
              <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                {COLUMN.transactionDate}
              </TableHead>
              <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                {COLUMN.accountNumber}
              </TableHead>
              <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                {COLUMN.description}
              </TableHead>
              {/* The figure column names itself over the digits it heads. */}
              <TableHead
                scope="col"
                className={`${LISTING_LABEL_CLASS} text-right`}
              >
                {COLUMN.amount}
              </TableHead>
              <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                {COLUMN.transactionType}
              </TableHead>
              <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                {COLUMN.currency}
              </TableHead>
              <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                {COLUMN.defect}
              </TableHead>
            </TableRow>
          </TableHeader>

          {/* THE LISTING: every row that will import, in the file's own relative order
              among themselves. */}
          <TableBody>
            {arranged.willImport.map((row) => (
              <PreviewRow
                key={row.key}
                row={row}
                isRevealed={revealed.has(row.key)}
                onReveal={onReveal}
                onHide={onHide}
              />
            ))}
          </TableBody>

          {/* THE REJECT LISTING, APPENDED AT THE BACK (R14/R15): its own row group, named
              by its own heading so the boundary is in the accessibility tree and not only
              in ink, opened by a hairline above the tracked micro-label that heads it. It
              spans the whole listing, so the block reads as a section of it rather than as
              a value in a column. Absent entirely when the service rejected nothing —
              there is no empty block to explain. */}
          {arranged.rejected.length > 0 && (
            <TableBody aria-labelledby={REJECTED_BLOCK_HEADING_ID}>
              <TableRow className={`${LISTING_ROW_CLASS} border-t`}>
                <TableHead
                  scope="colgroup"
                  colSpan={COLUMN_COUNT}
                  id={REJECTED_BLOCK_HEADING_ID}
                  className={`${LISTING_LABEL_CLASS} h-auto pt-8 pb-2`}
                >
                  {REJECTED_BLOCK_HEADING}
                </TableHead>
              </TableRow>
              {arranged.rejected.map((row) => (
                <PreviewRow
                  key={row.key}
                  row={row}
                  isRevealed={revealed.has(row.key)}
                  onReveal={onReveal}
                  onHide={onHide}
                />
              ))}
            </TableBody>
          )}
        </Table>
      </div>
    </>
  );
}
