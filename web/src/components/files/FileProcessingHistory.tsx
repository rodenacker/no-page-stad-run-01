'use client';

/**
 * Every processing activity the transactions service has recorded for one submitted
 * file, with the outcome recorded for it and the times it started and finished
 * (brief FR8, BR4 — both roles read this).
 *
 * Four things about this component are deliberate:
 *
 * - **Everything on screen is the service's own value** (brief BR5). Activity names,
 *   outcomes and both timestamps are printed exactly as they arrived: nothing here
 *   reformats a date, re-cases an outcome or sorts the list. `DecisionResult` is
 *   free-form text the app never judges, and the wire order of the list is not
 *   documented, so the order the service gave is the order the user reads.
 * - **An activity that is still running has NO outcome and NO end time**, which is the
 *   state a retry produces. It is still listed, with the only times it has, and nothing
 *   invents a completed outcome or an end time for it — those two cells say plainly
 *   that nothing has been recorded yet.
 * - **The read happens in the BROWSER**, through the shared API client at the app's own
 *   same-origin address (`lib/api/files.ts`), so the session cookie travels by itself
 *   and the three states below are this component's own business.
 * - **All three non-data states are answered** (project.md NFR-base-5): a wait that is
 *   ANNOUNCED and not merely drawn, a plain sentence when the service has recorded
 *   nothing yet (an answer, not a failure — so no alert and nothing to ask again for),
 *   and a failed read carrying the SERVICE's own wording plus one action that asks for
 *   the history again.
 *
 * The file is identified by its own `Id`, resolved by whatever renders this — there is
 * no get-one-file endpoint, so a file that cannot be resolved never gets this far.
 *
 * KEEPING CURRENT is the caller's decision, not this component's: whoever renders it
 * knows the file's status (this list does not), so it hands down `refreshSignal` and a
 * new value means "ask again". That way one interval on the file's page re-reads the file
 * and its history together, instead of each growing a timer of its own — and a retry,
 * which is not a timer at all, uses the same channel.
 *
 * ---------------------------------------------------------------------------
 * HOW IT IS DRAWN — a ruled table, in the register's own grammar
 * (`files-view-redesign` R18, design brief §3)
 * ---------------------------------------------------------------------------
 * The file's own page opens with a compact slip and continues into this table, so the two
 * are one document rather than two treatments stacked. Every piece of the notation is
 * IMPORTED from `components/requests/fieldNotation.ts` and never restated here (BR6):
 *
 * - **Restyled THROUGH the Shadcn table primitive**, never replaced: real `<table>`
 *   semantics, `<th scope="col">`, the caption and the header row all stay, because a
 *   screen reader navigates this history by its four named columns.
 * - **Full-bleed to the page padding** (`PAGE_BLEED_CLASS`) so every hairline row rule
 *   reaches the edge of the page, with that padding put back on the outer cells
 *   (`LISTING_EDGE_PADDING_CLASS`) so the values stay lined up with the slip's labels
 *   above them. The closing hairline is drawn on that box: the primitive deliberately
 *   leaves its last row unruled, and a listing read down a page needs a bottom edge as
 *   much as it needs the rules between its lines.
 * - **There is no card and no striped row.** The rules are the whole treatment, and the
 *   primitive's per-row hover fill and colour transition are cancelled at the row
 *   (`LISTING_ROW_CLASS`) — a row that tints under the pointer is the stripe arriving one
 *   row at a time (BR9).
 * - **The column heads and this section's own heading are the same object**: the tracked
 *   11px mono micro-label at the muted ink (`LISTING_LABEL_CLASS`). The capitals are
 *   `text-transform`, so every head's wording — and the accessible name a reader is given
 *   for it — is exactly the word the app wrote. R18 restyles these heads; it renames none
 *   of them.
 * - **Both times are set in the fixed-field face** (`NOTATION_CELL_CLASS`): a timestamp
 *   the service wrote is an identifier of a moment, not a figure to be added up, and the
 *   mono face is what makes one activity's times scannable against the next. The activity
 *   name and the outcome are prose and stay in the text face, at no added weight — a
 *   `font-medium` on top of a ruled listing is the card era's hierarchy.
 * - **A cell with nothing recorded in it yet is muted**, so what the service has actually
 *   recorded holds the ink. It still SAYS so in words: a blank cell reads as an oversight
 *   rather than as an answer.
 * - **Each answer that is not a row is a full-bleed ruled band** (`RULED_BAND_CLASS`) —
 *   the wait, the nothing-recorded-yet sentence and a failed read, the last carrying the
 *   `alert` with the card the primitive ships with stripped off it (`RULED_ALERT_CLASS`).
 *   The wording, the roles and the one `Try again` are all unchanged.
 */

import { TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  LISTING_EDGE_PADDING_CLASS,
  LISTING_LABEL_CLASS,
  LISTING_ROW_CLASS,
  NOTATION_CELL_CLASS,
  PAGE_BLEED_CLASS,
  RULED_ACTION_CLASS,
  RULED_ALERT_CLASS,
  RULED_ALERT_TITLE_CLASS,
  RULED_BAND_CLASS,
} from '@/components/requests/fieldNotation';
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
  fetchFileProcessingHistory,
  processingHistoryFailureMessage,
} from '@/lib/api/files';

import type { FileProcessLog, FileProcessLogList } from '@/types/files';

/** What the section is called, and what ties its heading to it. */
const HEADING_ID = 'file-processing-history-heading';
const HEADING = 'Processing history';

/** Announced while the history is being read — a shape on its own says nothing. */
const LOADING_MESSAGE = 'Loading the processing history…';

/** Nothing has been recorded yet: an answer about the file, not a failure. */
const EMPTY_MESSAGE =
  'No processing activity has been recorded for this file yet.';

/** Names what did not happen, so the alert is not just an apology. */
const FAILED_TITLE = 'Could not load the processing history';

/** The one action that asks for the history again. */
const RETRY_LABEL = 'Try again';

/**
 * What an activity's outcome and end time say while it is still running. The service
 * has recorded neither, and saying so is the honest answer — an empty cell reads as an
 * oversight, and any wording that looked like an outcome would be the app inventing one.
 */
const NOT_RECORDED_YET = 'Not recorded yet';

/**
 * A cell the service has recorded nothing in yet: muted, and in the TEXT face, because
 * what it holds is a sentence about the absence rather than a value. Muting it is what
 * leaves the ink to the times and outcomes the service has actually recorded — the same
 * withholding the rest of this listing is built on.
 */
const NOT_RECORDED_CELL_CLASS = 'text-muted-foreground';

/** The four columns this history has always had. R18 restyles them; it renames none. */
const COLUMN = {
  activity: 'Activity',
  outcome: 'Outcome',
  started: 'Started',
  finished: 'Finished',
} as const;

/** Where the history is: being read, read, or unreadable. */
type HistoryState =
  | { phase: 'loading' }
  | { phase: 'loaded'; activities: FileProcessLog[] }
  | { phase: 'failed'; message: string };

const LOADING: HistoryState = { phase: 'loading' };

/**
 * The activities in a response body, tolerating a body that carries none: an absent
 * property is the empty history, which is a legitimate answer and not a failure.
 *
 * WIRE QUIRK: the array property is `FileLog`, not `FileProcessLog` (`@/types/files`).
 */
const activitiesIn = (
  body: FileProcessLogList | undefined,
): FileProcessLog[] => (Array.isArray(body?.FileLog) ? body.FileLog : []);

export function FileProcessingHistory({
  logId,
  refreshSignal = 0,
}: {
  logId: number;
  /**
   * Changed by the caller when the history may have moved on — a retry it accepted, or
   * its own interval while the file is still working. Every value is as good as any
   * other; only CHANGING it means anything.
   *
   * These reads happen behind what the reader is already looking at, so nothing is
   * blanked first and a failure leaves the last known activities exactly where they are.
   */
  refreshSignal?: number;
}) {
  const [state, setState] = useState<HistoryState>(LOADING);
  /** Bumped by Try again; asking for the history again is what re-runs the read. */
  const [readsRequested, setReadsRequested] = useState(0);

  /**
   * Reads the history and puts what came back on screen.
   *
   * A failure is only reported as the failed state when there is nothing on screen to
   * lose — a first read, or a Try again, which puts this back into its busy state
   * first. Once real activities are showing, a read that fails leaves them exactly as
   * they were rather than replacing the answer with an error (the pattern
   * `SubmittedFilesList` established, and what a later re-read on this page relies on).
   *
   * `stillWatching` is how a caller says its read no longer matters: this component has
   * gone away, or the user has asked again since.
   */
  const readHistory = useCallback(
    (stillWatching: () => boolean): Promise<void> =>
      fetchFileProcessingHistory(logId)
        .then((body) => {
          if (!stillWatching()) {
            return;
          }
          setState({ phase: 'loaded', activities: activitiesIn(body) });
        })
        .catch((error: unknown) => {
          if (!stillWatching()) {
            return;
          }
          setState((current) =>
            current.phase === 'loaded'
              ? current
              : {
                  phase: 'failed',
                  // The service's own wording whenever it sent one, from EITHER place
                  // a failure can carry it; never the client's own placeholder.
                  message: processingHistoryFailureMessage(error),
                },
          );
        }),
    [logId],
  );

  useEffect(() => {
    // A read still in flight when this component goes away — or when the user asks
    // again — must not land on a screen that has moved on.
    let watching = true;

    void readHistory(() => watching);

    return () => {
      watching = false;
    };
  }, [readsRequested, refreshSignal, readHistory]);

  const readAgain = (): void => {
    setState(LOADING);
    setReadsRequested((reads) => reads + 1);
  };

  return (
    <section aria-labelledby={HEADING_ID} className="grid gap-4">
      {/* The section names itself in the same tracked micro-label the column heads
          below it wear — a printed listing labels itself in the notation it is set in,
          and a bold sentence-case title here would be the last of the card era's
          hierarchy left above a ruled page. The capitals are `text-transform`, so the
          heading a screen reader is given is still the words the app wrote. */}
      <h2 id={HEADING_ID} className={LISTING_LABEL_CLASS}>
        {HEADING}
      </h2>

      {state.phase === 'loading' && (
        /* The wait is a place that is not a row, so it is the shared ruled band (R18) —
           the rules the rows will carry are already there when the answer lands, rather
           than the section jumping from floating shapes into a ruled page. */
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

      {state.phase === 'failed' && (
        /* The read left the reader with nothing, so this band stands where the history
           would be, ruled and full-bleed like it. The `alert` is stripped of the
           primitive's card and the band's own hairlines frame it; its wording, its role
           and its one `Try again` are unchanged, the retry now wearing the same ruled
           notation as every other control on this page. */
        <div className={`${RULED_BAND_CLASS} py-6`}>
          <Alert className={RULED_ALERT_CLASS}>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className={RULED_ALERT_TITLE_CLASS}>
              {FAILED_TITLE}
            </AlertTitle>
            <AlertDescription className="text-foreground gap-3">
              <p>{state.message}</p>
              {/* The bare notation, without the gap a glyph needs: this control is
                  words alone, exactly as the register's own retry is. */}
              <Button
                type="button"
                variant="ghost"
                className={RULED_ACTION_CLASS}
                onClick={readAgain}
              >
                {RETRY_LABEL}
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {state.phase === 'loaded' &&
        (state.activities.length === 0 ? (
          /* Nothing has been recorded yet — an answer, and with no card to sit inside
             it is a band of its own: the same hairlines and the same full bleed the
             activities would have had, so the reader is looking at an empty history
             rather than at a sentence on a blank page. The wording is unchanged, and it
             is still an answer: no alert, and nothing to ask again for. */
          <div className={`${RULED_BAND_CLASS} py-8`}>
            <p className="text-muted-foreground max-w-prose">{EMPTY_MESSAGE}</p>
          </div>
        ) : (
          /* The history runs full-bleed to the page padding, so every hairline row rule
             reaches the edge of the page while the values inside keep that padding
             through the outer cells. The closing hairline is drawn here rather than on
             the last row, which the table primitive deliberately leaves unruled. No
             card, no panel, no striped rows: what frames the history is the ruling. */
          <div className={`${PAGE_BLEED_CLASS} border-b`}>
            <Table className={LISTING_EDGE_PADDING_CLASS}>
              <TableCaption className="sr-only">
                Every processing activity recorded for this file, in the order
                the service reported them, with the outcome recorded for each
                and the times it started and finished.
              </TableCaption>
              <TableHeader>
                <TableRow className={LISTING_ROW_CLASS}>
                  {/* 11px tracked mono micro-labels at the muted ink, capitalised by
                      `text-transform` so each head's accessible name is exactly the
                      word the app wrote (R18). */}
                  <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                    {COLUMN.activity}
                  </TableHead>
                  <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                    {COLUMN.outcome}
                  </TableHead>
                  <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                    {COLUMN.started}
                  </TableHead>
                  <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                    {COLUMN.finished}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.activities.map((activity, position) => (
                  <TableRow
                    // Nothing on an activity is documented as unique — a retry re-runs
                    // the same activity name — so the position in the answer completes
                    // the key rather than standing in for it.
                    key={`${activity.ActivityName}|${activity.StartDate}|${String(position)}`}
                    className={LISTING_ROW_CLASS}
                  >
                    {/* The activity's name and the outcome recorded for it are prose,
                        so they stay in the text face — and at no added weight, a
                        `font-medium` down a ruled column being the card era's
                        hierarchy rather than this one. */}
                    <TableCell>{activity.ActivityName}</TableCell>
                    <TableCell
                      className={
                        activity.DecisionResult === undefined
                          ? NOT_RECORDED_CELL_CLASS
                          : undefined
                      }
                    >
                      {activity.DecisionResult ?? NOT_RECORDED_YET}
                    </TableCell>
                    {/* Both times exactly as the service wrote them (BR5), in the
                        fixed-field face: a recorded moment is an identifier, not a
                        figure to be added up, and the mono face is what makes one
                        activity's times scannable against the next. */}
                    <TableCell className={NOTATION_CELL_CLASS}>
                      {activity.StartDate}
                    </TableCell>
                    <TableCell
                      className={
                        activity.EndDate === undefined
                          ? NOT_RECORDED_CELL_CLASS
                          : NOTATION_CELL_CLASS
                      }
                    >
                      {activity.EndDate ?? NOT_RECORDED_YET}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
    </section>
  );
}
