'use client';

/**
 * One submitted expense file: the values the service reported for it, and everything
 * this app lets a user read or do about it (brief FR8, BR4).
 *
 * This is the whole client surface of the `/upload/file` screen. The page above it is a
 * SERVER component that answers "may this person open this address at all?" before
 * anything renders; from here down, everything reads from the browser and owns its own
 * states — which is what lets a wait be announced and a failed read be asked for again.
 *
 * Six things here are deliberate and easy to break:
 *
 * - **THERE IS NO GET-ONE-FILE ENDPOINT.** The file is resolved by reading the ACTIVE
 *   file list (`GET /v1/file-logs?IsActive=Yes`, the same call the Expense files screen
 *   makes) and finding the requested identifier in it. No per-file read exists, and no
 *   second list call is made.
 * - **That is also what makes BR4 fall out for free.** A cancelled file is INACTIVE, so
 *   it is simply absent from that answer — exactly like an identifier that matches
 *   nothing, and exactly like one that was never a usable identifier. All three are one
 *   answer to the user: this file is not available, here is the way back to the list.
 *   None of them is a failure, so none of them shows service-error wording or an action
 *   to ask again, and none of them surfaces a processing history.
 * - **The identifier is used exactly as it arrived in the address** — a string, not
 *   narrowed to a number on the way in — because narrowing it would only create a
 *   fourth branch that has to answer the same sentence as the other three.
 * - **A read that FAILED is a different answer** from a file that is not there. Only
 *   then is the service's own wording shown, with a way to ask for the file again.
 * - **The page keeps itself current, and only while that is worth doing.** While the
 *   file is still working (`isFileInProgress`) — which is where a retry puts it — the
 *   page's OWN calls are re-read on ONE interval and it catches up in place with nobody
 *   touching it; once nothing is in progress the interval stops. That single interval
 *   drives the file, its processing history AND its rejected rows together, which is why
 *   both of those are given a signal to re-read rather than owning a timer of their own.
 *   A re-read that FAILS changes nothing on screen: the last known values stay, because
 *   the failed state belongs to a read that left the user with nothing. This is the
 *   pattern `SubmittedFilesList` established — there is no second polling mechanism in
 *   this app.
 * - **AN ACCEPTED RETRY IS ITSELF A REASON TO KEEP ASKING**, whatever the file's status
 *   says at that moment. The service's answer to a retry says nothing about the file, and
 *   the list it is resolved from may not have caught up yet — it can still report
 *   `Validation failed` from the PREVIOUS attempt, or already report it again from the
 *   new one. Either way the file does not look busy, so a single re-read decided nothing
 *   and an interval keyed only on "does it look busy" would never start at all: the
 *   screen would sit on the previous attempt's rejected rows for good. So an accepted
 *   retry buys a fixed number of further reads on that same one interval
 *   ({@link RETRY_SETTLING_READS}), on top of the immediate one. If the file does turn
 *   out to be working, `isFileInProgress` takes the watch over from there and holds it
 *   until the file settles; when the reads run out and nothing is in progress, the page
 *   goes quiet rather than asking a settled question forever.
 *
 * ---------------------------------------------------------------------------
 * HOW IT IS DRAWN — the file's own slip (`files-view-redesign` R17, design brief §3)
 * ---------------------------------------------------------------------------
 * This page is opened FROM a line of the register and shows the file that line names, so
 * it opens in the register's own notation: a COMPACT SLIP of small capitalised labels over
 * their values — the same five things the row states, in the same grammar the submission
 * slip that produced the file is set in. Every piece of that notation is IMPORTED from
 * `components/requests/fieldNotation.ts` and never restated here (R9/BR6):
 *
 * - **It is a ruled field strip, not a card and not prose.** The five fields run
 *   full-bleed to the page padding (`FULL_BLEED_CLASS`) and are closed by one hairline at
 *   their foot, so the slip reads as the head of the same document the processing history
 *   below it continues. There is no panel, no surface and no radius anywhere on it (BR9).
 * - **A label is the tracked micro-label at the muted ink** (`LISTING_LABEL_CLASS`) — the
 *   same object the register's column heads are, which is what makes the two surfaces read
 *   as one document. The capitals are `text-transform`, so the wording a screen reader is
 *   given is still the app's own words.
 * - **Each label stays STRUCTURALLY PAIRED with its own value** (`dt`/`dd` inside one
 *   field block). Five labels on one line over five values on another would still show
 *   every value while leaving a reader — and a screen reader — to guess which figure
 *   belongs to which word.
 * - **The file's name, the setting and the processed time are identifiers**, set in the
 *   fixed-field face (`NOTATION_CELL_CLASS`) at no added weight — the same face the
 *   register prints all three in. **The record count is this file's own control total**,
 *   mono and tabular (`FIGURE_CLASS`); alignment belongs to the surface, and on a slip a
 *   figure starts where the label above it starts. The most recent activity is prose and
 *   stays in the text face.
 * - **The status is the shared ruled mark** (`FileStatusBadge` → `StatusBadge`): the
 *   status's own words beside a drawn shape in the intent's ink, never colour alone and
 *   never a pill. Nothing here draws or maps a second one.
 * - **Each answer that is not the file is a full-bleed ruled band** (`RULED_BAND_CLASS`) —
 *   the wait, a file that is not available and a read that failed — carrying the `alert`
 *   with the card the primitive ships with stripped off it (`RULED_ALERT_CLASS`). All three
 *   keep their existing wording, their roles and their existing way on, and both controls
 *   wear the shared ruled action notation.
 *
 * Nothing in this redraw changes a value, its source, when it is read, or what any of these
 * answers says (R1/BR1/BR2/BR10).
 */

import { ArrowLeft, CircleSlash, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { FileDownloadActions } from '@/components/files/FileDownloadActions';
import { FileProcessingHistory } from '@/components/files/FileProcessingHistory';
import { FileStatusBadge } from '@/components/files/FileStatusBadge';
import { ImportPreview } from '@/components/files/ImportPreview';
import { RejectedRows } from '@/components/files/RejectedRows';
import { SubmittedFileActions } from '@/components/files/SubmittedFileActions';
import {
  FIGURE_CLASS,
  FULL_BLEED_CLASS,
  LISTING_LABEL_CLASS,
  NOTATION_CELL_CLASS,
  RULED_ACTION_CLASS,
  RULED_ACTION_ICON_CLASS,
  RULED_ACTION_WITH_ICON_CLASS,
  RULED_ALERT_CLASS,
  RULED_ALERT_TITLE_CLASS,
  RULED_BAND_CLASS,
} from '@/components/requests/fieldNotation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchSubmittedFiles, fileLookupFailureMessage } from '@/lib/api/files';
import { UPLOAD_PATH } from '@/lib/auth/access-map';
import { isFileInProgress } from '@/types/files';

import type { ReactNode } from 'react';

import type { FileLog, FileLogList } from '@/types/files';

/** What the screen is called before — or instead of — a file's own name. */
const FALLBACK_TITLE = 'Submitted file';

/** Announced while the file is being resolved — a shape on its own says nothing. */
const LOADING_MESSAGE = 'Loading this file…';

/** How the way back to the list reads, and where it goes. */
const BACK_LABEL = 'Back to Expense files';

/**
 * The one answer for a file that is not in the active list: deleted, cancelled,
 * unknown, or an identifier that was never usable.
 *
 * The title carries the phrase a user scans for; the sentence below it explains why
 * without repeating that phrase, and without dressing it up as a system failure —
 * nothing went wrong.
 *
 * DELETED is named FIRST because it is now the likeliest way a reader gets here since
 * `file-deletion` shipped: a bookmark, a second tab, or a colleague's delete leaves a
 * perfectly good address pointing at a file that has gone. `Cancelled` stays beside it
 * because it is still a status the service reports for a file this app never deleted.
 */
const UNAVAILABLE_TITLE = 'This file is not available';
const UNAVAILABLE_MESSAGE =
  'It may have been deleted or cancelled, or the address may point to a file that no longer exists. Open one of the files still in play from the Expense files list.';

/** Names what did not happen, so the alert is not just an apology. */
const FAILED_TITLE = 'Could not open this file';

/** The action that asks for the file again — deliberately not "Try again", which the
 * processing history's own failed read owns on this same screen. */
const READ_AGAIN_LABEL = 'Load this file again';

/** What each of the file's own values is called on screen. */
const FIELD = {
  setting: 'File setting',
  processed: 'Processed',
  status: 'Status',
  records: 'Records',
  activity: 'Most recent activity',
} as const;

/** What ties the file's own values to their heading. */
const SUMMARY_HEADING_ID = 'submitted-file-summary-heading';
const SUMMARY_HEADING = 'File details';

/**
 * How long the page waits before asking the service again while the file is still being
 * processed — the value its sibling `SubmittedFilesList` uses, for the same reason:
 * short enough that a file finishing is news rather than history, long enough that a
 * screen left open all afternoon is not a load on the service. It only ever runs while
 * the file is actually in progress, and no test asserts the value itself.
 */
const REFRESH_INTERVAL_MS = 15_000;

/**
 * How many further reads an ACCEPTED RETRY buys, on the same one interval, over and
 * above the immediate one it triggers.
 *
 * This is what makes the outcome of a retry arrive even when the file never looks busy
 * to this page (see the header): the retry itself is the reason to keep asking, so the
 * page asks for a little while rather than deciding on one sample. Four reads is a
 * minute at the interval above — long enough for the service to record the new attempt
 * and, when it fails again straight away, for the new attempt's rejected rows to be
 * read; short enough that a file the service never moves stops being asked about. Once
 * the file DOES report an in-progress status the watch is held by that instead, for as
 * long as it lasts. No test asserts the number itself.
 */
const RETRY_SETTLING_READS = 4;

/** Where the file is: being resolved, resolved, absent, or unreadable. */
type FileState =
  | { phase: 'loading' }
  | { phase: 'resolved'; file: FileLog }
  | { phase: 'unavailable' }
  | { phase: 'failed'; message: string };

const LOADING: FileState = { phase: 'loading' };
const UNAVAILABLE: FileState = { phase: 'unavailable' };

/**
 * The requested file in a list body, or `undefined` when the list does not carry it —
 * which is the answer for a cancelled file and for an unknown identifier alike. The
 * comparison is on the identifier as it arrived, so nothing has to be parsed first.
 */
const fileIn = (
  body: FileLogList | undefined,
  requestedLogId: string,
): FileLog | undefined =>
  (Array.isArray(body?.FileLog) ? body.FileLog : []).find(
    (file) => String(file.Id) === requestedLogId,
  );

/**
 * One field of the slip: the tracked label that names it, over the value the service
 * reported — one block per pair, so the label and its value stay together however the
 * line wraps. Each block is sized by what it holds and does not grow, so on a wide screen
 * the slip stays a slip rather than stretching five fields across the whole page; the
 * minimum is what stops a field being squeezed narrower than its own label, and wrapping
 * (never sideways scrolling) is what holds this at 360px (R3).
 */
function SlipField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-32 gap-1.5">
      <dt className={LISTING_LABEL_CLASS}>{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/**
 * The way back to the list this file was opened from: a tracked label on a rule, in the
 * same notation every other control across these two screens wears — a boxed button is
 * the last thing a page with no boxes left on it should carry. Its wording and its
 * destination are unchanged.
 */
function BackToFilesLink() {
  return (
    <Button asChild variant="ghost" className={RULED_ACTION_WITH_ICON_CLASS}>
      <Link href={UPLOAD_PATH}>
        <ArrowLeft aria-hidden="true" className={RULED_ACTION_ICON_CLASS} />
        {BACK_LABEL}
      </Link>
    </Button>
  );
}

/**
 * The screen's own name, for the three answers that have no file to name it with. In the
 * tracked micro-label notation, like every other heading across these two screens: a
 * printed document labels itself in the notation it is set in.
 */
function FallbackTitle() {
  return <h1 className={LISTING_LABEL_CLASS}>{FALLBACK_TITLE}</h1>;
}

export function SubmittedFileDetail({
  logId,
  actingUploader,
}: {
  logId: string | undefined;
  /**
   * The signed-in Finance Uploader's own name, decided on the SERVER
   * (`hasRole(session, ROLE_IMPORTER) ? displayNameOf(session) : undefined`), or
   * `undefined` for a session that may not act on this file.
   *
   * One value doing two jobs: it gates the uploader-only actions — so an Approver's
   * browser never receives their markup at all (source UI-24) — and it is the audit
   * identity the delete call must carry, which is what keeps the name the service
   * records from ever being something a user typed.
   */
  actingUploader?: string;
}) {
  /** The identifier as it arrived, with nothing but surrounding space removed. */
  const requestedLogId = logId?.trim() ?? '';
  const [state, setState] = useState<FileState>(
    requestedLogId === '' ? UNAVAILABLE : LOADING,
  );
  /** Bumped by the read-again action; asking again is what re-runs the read. */
  const [readsRequested, setReadsRequested] = useState(0);
  /**
   * Bumped whenever what is on screen may have moved on at the service — by the
   * interval below, and by a retry being accepted. Separate from `readsRequested`
   * because these reads happen BEHIND what the user is already reading: nothing is
   * blanked first, and a failure changes nothing.
   */
  const [refreshes, setRefreshes] = useState(0);
  /**
   * How many further reads are still owed to a retry the service accepted — the reason
   * to keep asking that does not depend on the file looking busy (see the header).
   */
  const [settlingReads, setSettlingReads] = useState(0);

  /** Asks the page's own calls again, in place. Stable, so it can be handed down. */
  const refresh = useCallback((): void => {
    setRefreshes((count) => count + 1);
  }, []);

  /**
   * A retry the service accepted: ask everything again at once, and keep asking for a
   * while, because the answer said nothing about the file and the list it is resolved
   * from may report either attempt's status when we look.
   */
  const handleRetried = useCallback((): void => {
    refresh();
    setSettlingReads(RETRY_SETTLING_READS);
  }, [refresh]);

  /**
   * Resolves the file from the active list.
   *
   * `stillWatching` is how a caller says its read no longer matters: this component has
   * gone away, or the user has asked again since.
   */
  const readFile = useCallback(
    (stillWatching: () => boolean): Promise<void> =>
      fetchSubmittedFiles()
        .then((body) => {
          if (!stillWatching()) {
            return;
          }
          const file = fileIn(body, requestedLogId);
          setState(file ? { phase: 'resolved', file } : UNAVAILABLE);
        })
        .catch((error: unknown) => {
          if (!stillWatching()) {
            return;
          }
          // A re-read that fails leaves what is on screen alone; the failed state is
          // for a read that left the user with nothing (the pattern
          // `SubmittedFilesList` established on this screen's sibling).
          setState((current) =>
            current.phase === 'resolved'
              ? current
              : { phase: 'failed', message: fileLookupFailureMessage(error) },
          );
        }),
    [requestedLogId],
  );

  useEffect(() => {
    // Nothing usable in the address is already an answer — there is no file to ask
    // the service about.
    if (requestedLogId === '') {
      return;
    }

    let watching = true;

    void readFile(() => watching);

    return () => {
      watching = false;
    };
  }, [requestedLogId, readsRequested, refreshes, readFile]);

  /**
   * Whether the file is still working, which is the only reason to keep asking the
   * service anything. Read straight off what is on screen, so it cannot disagree with
   * the status the user is looking at.
   */
  const fileIsInProgress =
    state.phase === 'resolved' && isFileInProgress(state.file.CurrentStatus);

  /**
   * Whether there is anything left to find out: the file is still working, or a retry
   * this page asked for has reads still owed to it. Either is a reason to keep asking;
   * neither being true is what makes the page go quiet.
   */
  const keepingUp = fileIsInProgress || settlingReads > 0;

  /**
   * While there is something to find out, everything this page reads is asked again on
   * ONE interval and the page catches up in place. Once there is not, this effect stops
   * running, which clears the interval: the page goes quiet rather than asking a
   * settled question forever. One interval at most — it is tied to that single fact,
   * not to every render, and not to the countdown, which is why a tick does not restart
   * the period — and it goes away with the component.
   */
  useEffect(() => {
    if (!keepingUp) {
      return;
    }

    const keepingCurrent = setInterval(() => {
      refresh();
      // Each read spends one of the reads a retry bought; the file being in progress
      // is what keeps the watch going beyond them.
      setSettlingReads((owed) => (owed > 0 ? owed - 1 : 0));
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(keepingCurrent);
    };
  }, [keepingUp, refresh]);

  const readAgain = (): void => {
    setState(LOADING);
    setReadsRequested((reads) => reads + 1);
  };

  if (state.phase === 'loading') {
    return (
      <section className="grid gap-4">
        <FallbackTitle />
        {/* The wait is a place that is not the file, so it is the shared ruled band —
            the hairlines the slip will carry are already there when the values land,
            rather than the page jumping from floating shapes into a ruled slip. */}
        <div role="status" className={`${RULED_BAND_CLASS} py-4`}>
          <span className="sr-only">{LOADING_MESSAGE}</span>
          {/* Placeholders stand in for the values on their way; the sentence above
              is what a screen reader is given, since a shape says nothing. Square —
              nothing in this world has a radius. */}
          <div aria-hidden="true" className="grid gap-3">
            <Skeleton className="h-4 w-64 rounded-none" />
            <Skeleton className="h-4 w-full rounded-none" />
          </div>
        </div>
      </section>
    );
  }

  if (state.phase === 'unavailable') {
    return (
      <section className="grid gap-4">
        <FallbackTitle />
        {/* Nothing went wrong, but there is no file to draw a slip from — so this band
            stands where the slip would be, ruled and full-bleed like it. The `alert` is
            stripped of the primitive's card and the band's hairlines frame it; the
            wording, the role and the one way on are unchanged. */}
        <div className={`${RULED_BAND_CLASS} py-6`}>
          <Alert className={RULED_ALERT_CLASS}>
            <CircleSlash aria-hidden="true" />
            <AlertTitle className={RULED_ALERT_TITLE_CLASS}>
              {UNAVAILABLE_TITLE}
            </AlertTitle>
            <AlertDescription className="text-foreground gap-3">
              <p className="max-w-prose">{UNAVAILABLE_MESSAGE}</p>
              <BackToFilesLink />
            </AlertDescription>
          </Alert>
        </div>
      </section>
    );
  }

  if (state.phase === 'failed') {
    return (
      <section className="grid gap-4">
        <FallbackTitle />
        {/* A read that failed is the separate answer, in the same band: the service's own
            wording, its own way to ask again — worded `Load this file again`, never the
            `Try again` the processing history owns on this screen — and the way back. */}
        <div className={`${RULED_BAND_CLASS} py-6`}>
          <Alert className={RULED_ALERT_CLASS}>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className={RULED_ALERT_TITLE_CLASS}>
              {FAILED_TITLE}
            </AlertTitle>
            <AlertDescription className="text-foreground gap-3">
              <p className="max-w-prose">{state.message}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {/* The bare notation, without the gap a glyph needs: this control is
                    words alone, exactly as the register's own retry is. */}
                <Button
                  type="button"
                  variant="ghost"
                  className={RULED_ACTION_CLASS}
                  onClick={readAgain}
                >
                  {READ_AGAIN_LABEL}
                </Button>
                <BackToFilesLink />
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </section>
    );
  }

  const { file } = state;

  return (
    <div className="grid gap-8">
      <div className="grid justify-items-start gap-3">
        <BackToFilesLink />
        {/* The batch's real name, and the name of the screen it is about: an identifier,
            so it is set in the fixed-field face at no added weight — the same face the
            register line this page was opened from prints it in. Every value below it is
            the service's own, printed as it arrived (brief BR5). */}
        <h1 className={`${NOTATION_CELL_CLASS} text-xl break-words`}>
          {file.CurrentFileName}
        </h1>
      </div>

      <section aria-labelledby={SUMMARY_HEADING_ID} className="grid gap-3">
        {/* The slip names itself in the same tracked micro-label its own fields wear. */}
        <h2 id={SUMMARY_HEADING_ID} className={LISTING_LABEL_CLASS}>
          {SUMMARY_HEADING}
        </h2>
        {/* The five fields as one ruled strip: full-bleed to the page padding and closed
            by a single hairline at its foot, so the slip reads as the head of the same
            document the sections below continue. It WRAPS at narrow widths rather than
            scrolling sideways (R3), and each field keeps its own label with its own
            value (R17). */}
        <dl
          className={`${FULL_BLEED_CLASS} border-input flex flex-wrap items-start gap-x-10 gap-y-5 border-b pb-5`}
        >
          <SlipField label={FIELD.setting}>
            <span className={NOTATION_CELL_CLASS}>{file.SettingName}</span>
          </SlipField>
          <SlipField label={FIELD.processed}>
            <span className={NOTATION_CELL_CLASS}>{file.ProcessDate}</span>
          </SlipField>
          <SlipField label={FIELD.status}>
            <FileStatusBadge status={file.CurrentStatus} />
          </SlipField>
          {/* This file's own control total, mono and tabular — its own, and the only
              figure of its kind on the screen (BR5). */}
          <SlipField label={FIELD.records}>
            <span className={FIGURE_CLASS}>{file.RecordCount}</span>
          </SlipField>
          {/* Prose, so it stays in the text face. */}
          <SlipField label={FIELD.activity}>
            {file.LastExecutedActivityName}
          </SlipField>
        </dl>
      </section>

      {/* Retry and delete — nothing at all unless the session may act on this file,
          which is now the ONLY reason that component renders nothing: the delete is
          offered whatever the file's status (`file-deletion` R3/BR1), and the retry's
          own status rule is that component's to keep. A retry asks every call on this
          page again, and keeps asking for a while, since the service's answer to it
          says nothing about the file's new state. */}
      <SubmittedFileActions
        file={file}
        actingUploader={actingUploader}
        onRetried={handleRetried}
      />

      {/* What the user may take away from this file: the file as it was submitted, and
          the generated error file when the service reported one. Both are offered to
          both roles, which is why this section carries no session or role. Both read
          the file's OWN values, so a re-read is all it takes for the error file of a
          new attempt to be the one on offer. */}
      <FileDownloadActions file={file} />

      {/* Every row of the file the user submitted, with what will happen to it —
          nothing at all until this file's validation has run, which that component
          decides for itself. It takes the same signal as the sections below, and grows
          no timer of its own: this page owns the only interval. */}
      <ImportPreview file={file} refreshSignal={refreshes} />

      {/* Which rows were rejected, and why — nothing at all unless this file's
          validation failed, which that component decides for itself. It takes the same
          signal as the history, because a file that fails validation AGAIN keeps the
          status it already had: without it the rows of the previous attempt would stay
          on screen for good. */}
      <RejectedRows file={file} refreshSignal={refreshes} />

      {/* The history is re-read by the same signal that re-reads the file, so the two
          never disagree about how far the file has got — and so there is one interval
          on this page rather than three. */}
      <FileProcessingHistory logId={file.Id} refreshSignal={refreshes} />
    </div>
  );
}
