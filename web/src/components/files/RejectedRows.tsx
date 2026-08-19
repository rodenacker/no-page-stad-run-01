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
 *   sources are never mixed.** That rule — the four sentences this app owns and the
 *   service's own words for everything else — now lives in `lib/files/defectWording.ts`,
 *   because the import preview's rejected rows and its correction CSV must read exactly
 *   the same way; this section composes it rather than restating it. A row the service
 *   described without attributing it to a column shows what it was given; a row with no
 *   defect signal at all is still listed, and no reason is invented for it.
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
 *
 * KEEPING CURRENT is the caller's decision, not this section's — the same arrangement
 * `FileProcessingHistory` has, and for the same reason: whoever renders it knows whether
 * the file is working (this list does not), so it hands down `refreshSignal` and a new
 * value means "ask again". That is what makes a RE-VALIDATED file's rows the ones on
 * screen: a file that fails validation again keeps the status it already had, so nothing
 * about it changes here and no remount happens — without the signal, the previous
 * attempt's rows would stay up for good (brief FR4, Key Workflow step 5). One timer on
 * the file's page drives this list, the history and the file together; this section
 * grows none of its own.
 *
 * ---------------------------------------------------------------------------
 * HOW IT IS DRAWN — the reject listing, in the register's own grammar
 * (`files-view-redesign` R16, design brief §3)
 * ---------------------------------------------------------------------------
 * The design brief calls the import preview and these rejected rows its strongest fit,
 * because they ARE the source artifact — "the reject listing… exactly as the document
 * does it". So this section is drawn as the same listing `ImportPreview` draws, and every
 * piece of the notation is IMPORTED from `components/requests/fieldNotation.ts` and never
 * restated here (R9/BR6):
 *
 * - **Restyled THROUGH the Shadcn table primitive**, never replaced: real `<table>`
 *   semantics, `<th scope="col">`, the caption and the header row all stay, because a
 *   screen reader navigates these rows by their eight named columns.
 * - **Full-bleed to the page padding** (`PAGE_BLEED_CLASS`) so every hairline row rule
 *   reaches the edge of the page, with that padding put back on the outer cells
 *   (`LISTING_EDGE_PADDING_CLASS`) so the values stay lined up with the file's own slip
 *   above them. The closing hairline is drawn on that box: the primitive deliberately
 *   leaves the last row unruled.
 * - **No card and no striped row.** The rules are the whole treatment, and the
 *   primitive's per-row hover fill and colour transition are cancelled at the row
 *   (`LISTING_ROW_CLASS`) — a row that tints under the pointer is the stripe arriving one
 *   row at a time (BR9).
 * - **This section's heading and its column heads are the same object**: the tracked 11px
 *   mono micro-label at the muted ink (`LISTING_LABEL_CLASS`). The capitals are
 *   `text-transform`, so every head's wording — and the accessible name built from it —
 *   is exactly the word the app wrote. R16 restyles these heads; it renames none of them.
 * - **Reference, transaction date and the masked account number are set in the
 *   fixed-field face** (`NOTATION_CELL_CLASS`): each is an identifier rather than a figure
 *   to be added up. The amount is the row's own figure, so it is right-aligned and tabular
 *   (`FIGURE_CELL_CLASS`) even where the file held something that is not a number — which
 *   is exactly what a reader has to see to correct it. Description, transaction type and
 *   the defect are prose and stay in the text face, at no added weight.
 * - **Each answer that is not a row is a full-bleed ruled band** (`RULED_BAND_CLASS`) —
 *   the wait, a body that could not be read, a refused read, and the service reporting no
 *   rejected rows at all — the two problems carrying the `alert` with the card the
 *   primitive ships with stripped off it (`RULED_ALERT_CLASS`). The wording, the roles and
 *   the one way to ask again are unchanged, that control now wearing the shared ruled
 *   action notation like every other one on this page.
 *
 * AND ON A PHONE, THE SAME REJECT LISTING TIGHTENED (R3, source UI-23): below the one
 * crossover `lib/layout/viewport.ts` states, each rejected row becomes a group of ruled
 * lines — its reference, its amount and date, its masked account number with its OWN reveal,
 * and what is wrong with it — through the shared `components/files/NarrowListing`
 * composition every listing on these two screens wears. Three things about that switch are
 * load-bearing:
 *
 * - **One presentation or the other, never both.** Eight columns inside the primitive's own
 *   `overflow-x-auto` wrapper is exactly the contained sideways scroll R3 refuses.
 * - **The masked number stays legible at that width, and the reveal stays a DIRECT control**
 *   — these are the rows a reader has to go and correct, and a control behind a menu is one
 *   more gesture between a keyboard user and the number they came for (R4).
 * - **One reveal, one piece of markup** ({@link RejectedAccountNumber}), rendered by both
 *   presentations: which row a reveal acts on, and the masking itself, cannot differ by
 *   width.
 *
 * Nothing in this redraw changes a value, its source, when it is read, what any of these
 * answers says, or which row a reveal acts on (R1/BR1/BR2).
 */

import { Eye, EyeOff, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  NarrowField,
  NarrowListing,
  NarrowRecord,
  NarrowRecordLine,
} from '@/components/files/NarrowListing';
import {
  FIGURE_CELL_CLASS,
  FIGURE_CLASS,
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
import { NO_REASON_GIVEN, defectWordingFor } from '@/lib/files/defectWording';
import { useNarrowViewport } from '@/lib/layout/useNarrowViewport';
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
 * What each recorded value is called in the heading row — and, at phone width, on the field
 * label beside that same value (R3), because a column head and a field label are the same
 * object in this design. R16 restyles these; it renames none of them.
 */
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
 * What this listing IS, for a phone-width reader who meets it without seeing its shape. The
 * wide presentation says it in a table caption; at this width there is no caption, so the
 * list says it of itself — including that the numbers in it are masked until one is revealed.
 */
const NARROW_LISTING_LABEL =
  'Rows of this file that validation rejected. Account numbers show their last four digits until you reveal one.';

/**
 * A rejected row's own key: nothing on one is documented as unique — the rows come from
 * parsing an untrusted string — so its position in this answer completes the key rather than
 * standing in for it. Stated once, because both presentations key their records by it.
 */
const rejectedRowKey = (row: ValidationErrorRow, position: number): string =>
  `${String(row.Id ?? '')}|${String(position)}`;

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
 * THIS ROW'S ACCOUNT NUMBER, and the one way to see the whole of it.
 *
 * Masked to its last four digits (POPIA, project.md §Compliance) with a per-row reveal, and
 * ONE piece of markup for both presentations: which row the reveal acts on, what the mask
 * shows and what the control is called cannot differ by viewport width, and a second copy
 * for the phone-width group is how the mask on one of them would quietly come off.
 *
 * The reveal is a control on a ruled listing, so it wears the shared ruled action notation
 * rather than a boxed button — there are no boxes left on this page for one to match — and it
 * stays a DIRECT control at every width: these are the rows a reader has to correct, and a
 * menu in front of the number is one more gesture between a keyboard user and it (R4).
 */
function RejectedAccountNumber({
  accountNumber,
  rowLabel,
  position,
  isRevealed,
  onReveal,
  onHide,
}: {
  accountNumber: string;
  /** Which row this control belongs to, for a reader who meets it out of context. */
  rowLabel: string | undefined;
  position: number;
  isRevealed: boolean;
  onReveal: (position: number) => void;
  onHide: (position: number) => void;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      {isRevealed ? (
        <span className="tabular-nums">{accountNumber}</span>
      ) : (
        <MaskedAccountNumber accountNumber={accountNumber} />
      )}
      {/* Its wording, and the row it names, are unchanged: the capitals are
          `text-transform`. */}
      <Button
        type="button"
        variant="ghost"
        className={RULED_ACTION_WITH_ICON_CLASS}
        onClick={() => {
          if (isRevealed) {
            onHide(position);
          } else {
            onReveal(position);
          }
        }}
      >
        {isRevealed ? (
          <EyeOff aria-hidden="true" className={RULED_ACTION_ICON_CLASS} />
        ) : (
          <Eye aria-hidden="true" className={RULED_ACTION_ICON_CLASS} />
        )}
        {isRevealed ? HIDE_ACCOUNT_NUMBER : REVEAL_ACCOUNT_NUMBER}
        {rowLabel !== undefined && (
          <span className="sr-only">for {rowLabel}</span>
        )}
      </Button>
    </span>
  );
}

/** What this row says is wrong with it — the service's words or the app's, never mixed. */
function DefectWording({ row }: { row: ValidationErrorRow }) {
  const wording = defectWordingFor(row);
  return wording === undefined ? (
    <span className="text-muted-foreground">{NO_REASON_GIVEN}</span>
  ) : (
    <>{wording}</>
  );
}

/**
 * ONE REJECTED ROW AS A PHONE-WIDTH READER RECEIVES IT (R3, source UI-23): a group of ruled
 * lines carrying its reference — the identifier a reader looks it up by — then the amount and
 * date it recorded, its masked account number with its own reveal, and what is wrong with it.
 *
 * Its values, its masking and its reveal are the wide row's; only how many of them fit on a
 * line differs. The description, transaction type and currency the wide listing also prints
 * are left for that width: UI-23 asks for the identifier and two to three key values, not for
 * eight columns folded into a box.
 */
function RejectedRecord({
  row,
  position,
  isRevealed,
  onReveal,
  onHide,
}: {
  row: ValidationErrorRow;
  position: number;
  isRevealed: boolean;
  onReveal: (position: number) => void;
  onHide: (position: number) => void;
}) {
  const accountNumber = row.AccountNumber;

  return (
    <NarrowRecord>
      <NarrowRecordLine>
        <span className={`${NOTATION_CELL_CLASS} break-all`}>
          <RecordedValue value={row.Reference} />
        </span>
      </NarrowRecordLine>

      <NarrowRecordLine>
        <NarrowField label={COLUMN.amount}>
          <span className={FIGURE_CLASS}>
            <RecordedValue value={row.Amount} />
          </span>
        </NarrowField>
        <NarrowField label={COLUMN.transactionDate}>
          <span className={NOTATION_CELL_CLASS}>
            <RecordedValue value={row.TransactionDate} />
          </span>
        </NarrowField>
      </NarrowRecordLine>

      <NarrowRecordLine>
        <NarrowField label={COLUMN.accountNumber}>
          {/* The fixed-field face wraps BOTH answers, exactly as the wide row's cell
              does: a number the file did not hold is still read in this column's own
              notation, and setting only one of the two would be the two presentations
              drifting apart on the value this listing is most careful with. */}
          <span className={NOTATION_CELL_CLASS}>
            {accountNumber === undefined || accountNumber === '' ? (
              <RecordedValue value={accountNumber} />
            ) : (
              <RejectedAccountNumber
                accountNumber={accountNumber}
                rowLabel={rowLabelOf(row)}
                position={position}
                isRevealed={isRevealed}
                onReveal={onReveal}
                onHide={onHide}
              />
            )}
          </span>
        </NarrowField>
      </NarrowRecordLine>

      <NarrowRecordLine>
        <NarrowField label={COLUMN.defect}>
          <DefectWording row={row} />
        </NarrowField>
      </NarrowRecordLine>
    </NarrowRecord>
  );
}

/**
 * ONE REJECTED ROW of the listing, drawn in the register's own grammar (R16) — the same
 * ruled line the import preview's own reject listing draws, since the two are the same
 * object in this design.
 *
 * It is its own component so the listing's markup stays readable at the depth the ruled
 * treatment adds, and so the row's own values — and the one control on it — are in one
 * place. Nothing here decides anything the section did not already decide: which rows
 * exist, which of them is revealed, and what is wrong with each are all handed in.
 */
function RejectedRow({
  row,
  position,
  isRevealed,
  onReveal,
  onHide,
}: {
  row: ValidationErrorRow;
  /** Where this row sits in THIS answer — the only handle the reveal has (POPIA). */
  position: number;
  isRevealed: boolean;
  onReveal: (position: number) => void;
  onHide: (position: number) => void;
}) {
  const accountNumber = row.AccountNumber;

  return (
    <TableRow className={LISTING_ROW_CLASS}>
      {/* The reference is this row's identifier, so it is set in the fixed-field face —
          and at no added weight, a `font-medium` down a ruled column being the card
          era's hierarchy rather than this one. */}
      <TableCell className={NOTATION_CELL_CLASS}>
        <RecordedValue value={row.Reference} />
      </TableCell>
      <TableCell className={NOTATION_CELL_CLASS}>
        <RecordedValue value={row.TransactionDate} />
      </TableCell>
      {/* The masked number is a fixed-field value too, so the mask and the number it
          stands for are read in the same face as every other identifier here. */}
      <TableCell className={NOTATION_CELL_CLASS}>
        {accountNumber === undefined || accountNumber === '' ? (
          <RecordedValue value={accountNumber} />
        ) : (
          <RejectedAccountNumber
            accountNumber={accountNumber}
            rowLabel={rowLabelOf(row)}
            position={position}
            isRevealed={isRevealed}
            onReveal={onReveal}
            onHide={onHide}
          />
        )}
      </TableCell>
      <TableCell className="whitespace-normal">
        <RecordedValue value={row.Description} />
      </TableCell>
      {/* The row's own figure: right-aligned and tabular down the column, so the digits
          line up — including where the file held something that is not a number at all,
          which is exactly what the reader has to see to correct it. */}
      <TableCell className={FIGURE_CELL_CLASS}>
        <RecordedValue value={row.Amount} />
      </TableCell>
      <TableCell>
        {/* The type as the file recorded it. NOT translated — see this file's header,
            and FR3: the app judges no transaction type. */}
        <RecordedValue value={row.TransactionType} />
      </TableCell>
      <TableCell>
        <RecordedValue value={row.Currency} />
      </TableCell>
      <TableCell className="max-w-prose whitespace-normal">
        <DefectWording row={row} />
      </TableCell>
    </TableRow>
  );
}

/**
 * The whole section, but only for a file whose validation failed (contract: nothing
 * at all otherwise — including no read).
 */
export function RejectedRows({
  file,
  refreshSignal = 0,
}: {
  file: FileLog;
  /**
   * Changed by the caller when this file's rows may have moved on — a retry it accepted,
   * or its own interval while the file is still working. Every value is as good as any
   * other; only CHANGING it means anything.
   *
   * These reads happen behind what the reader is already looking at: nothing is blanked
   * first, and a failure leaves the last known rows exactly where they are.
   */
  refreshSignal?: number;
}) {
  if (file.CurrentStatus !== FILE_STATUS_VALIDATION_FAILED) {
    return null;
  }

  return (
    <RejectedRowsSection fileLogId={file.Id} refreshSignal={refreshSignal} />
  );
}

function RejectedRowsSection({
  fileLogId,
  refreshSignal,
}: {
  fileLogId: number;
  refreshSignal: number;
}) {
  const [state, setState] = useState<RejectedRowsState>(LOADING);
  /** Bumped by the ask-again action; asking for the rows is what re-runs the read. */
  const [readsRequested, setReadsRequested] = useState(0);
  /**
   * Whether the reader is at phone width, which decides which of the two presentations of
   * this reject listing is in the markup at all (R3). One crossover, read through the one
   * hook every listing in the app asks with — never a second breakpoint of this section's
   * own.
   */
  const narrowViewport = useNarrowViewport();

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
              : // A fresh answer starts fully masked, including a re-read of a file
                // that was validated again: which rows were revealed belongs to the
                // answer that was on screen, not to the section (POPIA).
                { phase: 'loaded', rows, revealed: new Set<number>() },
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
  }, [readsRequested, refreshSignal, readRejectedRows]);

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
      {/* The section names itself in the same tracked micro-label its own column heads
          wear — a printed reject listing labels itself in the notation it is set in, and
          a bold sentence-case title here would be the last of the card era's hierarchy
          left above a ruled page. The capitals are `text-transform`, so the heading a
          screen reader is given (and the name this region is addressed by) is still the
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

      {(state.phase === 'unreadable' || state.phase === 'failed') && (
        /* Nothing honest can be listed, so this band stands where the listing would be,
           ruled and full-bleed like it. The `alert` is stripped of the primitive's card
           and the band's own hairlines frame it; its wording, its role and its one way
           to ask again are unchanged, the control now wearing the same ruled notation as
           every other one on this page. */
        <div className={`${RULED_BAND_CLASS} py-6`}>
          <Alert className={RULED_ALERT_CLASS}>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className={RULED_ALERT_TITLE_CLASS}>
              {state.phase === 'unreadable' ? UNREADABLE_TITLE : FAILED_TITLE}
            </AlertTitle>
            <AlertDescription className="text-foreground gap-3">
              <p className="max-w-prose">
                {state.phase === 'unreadable'
                  ? UNREADABLE_MESSAGE
                  : state.message}
              </p>
              {/* The bare notation, without the gap a glyph needs: this control is
                  words alone, exactly as the file slip's own read-again is. */}
              <Button
                type="button"
                variant="ghost"
                className={RULED_ACTION_CLASS}
                onClick={readAgain}
              >
                {ASK_AGAIN_LABEL}
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {state.phase === 'loaded' &&
        (state.rows.length === 0 ? (
          /* An answer about the file rather than a failure — but still a place in the
             listing that is not a row, so it stands in the same ruled band the wait and
             the problems do. */
          <div className={`${RULED_BAND_CLASS} py-6`}>
            <p className="text-muted-foreground max-w-prose">
              {NONE_REPORTED_MESSAGE}
            </p>
          </div>
        ) : narrowViewport ? (
          /* THE SAME REJECT LISTING ON A PHONE (R3, source UI-23): each rejected row is one
             group of ruled lines, and the groups run together as one ruled sequence rather
             than standing apart as boxes (BR9). The wide table is not rendered at all here:
             eight columns inside the primitive's `overflow-x-auto` wrapper is precisely the
             contained sideways scroll R3 refuses. */
          <NarrowListing label={NARROW_LISTING_LABEL}>
            {state.rows.map((row, position) => (
              <RejectedRecord
                key={rejectedRowKey(row, position)}
                row={row}
                position={position}
                isRevealed={state.revealed.has(position)}
                onReveal={revealAccountNumber}
                onHide={hideAccountNumber}
              />
            ))}
          </NarrowListing>
        ) : (
          /* THE REJECT LISTING. It runs full-bleed to the page padding so every hairline
             row rule reaches the edge of the page, with that padding put back on the
             outer cells; the closing hairline is drawn here rather than on the last row,
             which the primitive deliberately leaves unruled. No card, no panel, no
             striped rows: what frames these rows is the ruling. */
          <div className={`${PAGE_BLEED_CLASS} border-b`}>
            <Table className={LISTING_EDGE_PADDING_CLASS}>
              <TableCaption className="sr-only">
                Every row of this file that validation rejected, with the values
                the file recorded for it and what is wrong with it. Account
                numbers show their last four digits until you reveal one.
              </TableCaption>
              <TableHeader>
                <TableRow className={LISTING_ROW_CLASS}>
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
              <TableBody>
                {state.rows.map((row, position) => (
                  <RejectedRow
                    key={rejectedRowKey(row, position)}
                    row={row}
                    position={position}
                    isRevealed={state.revealed.has(position)}
                    onReveal={revealAccountNumber}
                    onHide={hideAccountNumber}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
    </section>
  );
}
