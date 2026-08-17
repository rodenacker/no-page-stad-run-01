'use client';

/**
 * Every expense file that has been submitted, as the transactions service reports
 * it — the screen both the Importer and the Approver watch (brief R3, R9) —
 * keeping itself current while any of those files is still being processed.
 *
 * Five things about this component are deliberate and easy to break:
 *
 * - **Everything on screen is the service's own value** (brief BR5). The status, the
 *   most recent activity and the record count are printed as they arrived, and so is
 *   the process date: nothing here computes, reformats or infers a value. A status
 *   the app has never heard of is shown as written rather than blanked, remapped to a
 *   known one, or treated as an error — the backend owns that vocabulary, and a new
 *   value must reach the user instead of disappearing (project.md's "displayed, not
 *   policed" stance).
 * - **The read happens in the BROWSER**, through the shared API client at the app's
 *   own same-origin address (`lib/api/files.ts`). That is what lets the session
 *   cookie travel by itself, what makes the three states below this component's
 *   own business rather than a server render's, and what makes keeping the rows
 *   current possible at all.
 * - **All three non-data states are answered** (project.md NFR-base-5): a busy state
 *   that is announced and not merely drawn, a plain sentence when nothing has been
 *   submitted yet, and — when the list cannot be loaded — the service's own wording
 *   plus one action that asks for it again. A failed load is never a blank screen.
 * - **The rows keep themselves up to date, and only while that is worth doing**
 *   (brief Feature NFR "List currency", R10/BR2). While any listed file is still
 *   working (`Uploaded` / `Validating`) the SAME list call is re-read on a timer and
 *   the rows catch up in place; once nothing is in progress the timer stops and the
 *   screen goes quiet. There is one timer at most, and it is cleared when this
 *   component goes away.
 * - **A re-read that fails changes nothing on screen.** The failed-load state above
 *   belongs to a read that left the user with nothing; a screen already showing real
 *   values keeps them rather than losing them to one unanswered request (story 3
 *   AC-5). Every re-read — the timer's and the one a submission asks for — behaves
 *   that way.
 * - **What just happened is announced once, on the transition.** A file reaching
 *   `Imported` and a file reaching `Validation failed` are each told to the user
 *   through the root layout's one notification surface, from the previous status per
 *   file id — so a file that already had that outcome when the screen opened is never
 *   announced, and a file that keeps it across every later re-read is not announced
 *   twice. The rejected-rows one does not fade and carries the way to the file's own
 *   rejected rows (`file-validation-and-retry` FR9 / NFR-3).
 *
 * The status chip pairs an intent colour with the status TEXT and an icon, never
 * colour alone (brief §Feature NFRs, source UI-21). It is `components/files/
 * FileStatusBadge` — the one file-status vocabulary in the project, shared with a
 * file's own page, and itself built on the shared `components/status/StatusBadge`,
 * which owns the intents and their tokens.
 *
 * Each row also offers the way INTO that file's own page, as a real navigational link
 * carrying the file's identifier (`file-validation-and-retry` FR8): a link, not a
 * button that pushes a route, so it can be opened in a new tab and is announced as a
 * link.
 *
 * DELETING A FILE FROM A ROW (`file-deletion` R1, R5, R9, R10, R11, R12, BR2, BR7)
 * adds four things to that, and each of them is easy to get subtly wrong:
 *
 * - **The delete sits IN THE ROW**, beside the `Open` link — never behind a per-row
 *   menu that has to be opened first, which would put a control between a keyboard
 *   user and the action (story 3 AC-6).
 * - **Who may delete is decided on the SERVER** and arrives as `actingUploader`. Its
 *   absence means NO delete control at all — the opposite polarity to `viewerRoles`
 *   below, deliberately, and the reason the two are separate props. See
 *   {@link SubmittedFilesListProps}.
 * - **ONE confirmation, shared with the file's own page.** The dialog a row opens is
 *   `DeleteFileConfirmation`, which owns the title, all three states of the
 *   description and the two dialog labels. A second confirmation written for this
 *   surface would read differently for the same file, however plausible its wording.
 *   One controller serves the whole table, since only one row can be being confirmed
 *   at a time.
 * - **A deleted row goes because the list RE-READ ITSELF.** A success asks for the
 *   list again through the very same read the auto-refresh and a submission already
 *   use (`readsRequested`) — never a locally spliced array standing in for the
 *   service's answer, and never a second timer (R12, Feature NFR "List currency").
 *   A refusal is reported here in the SERVICE's own words with the dialog closed, the
 *   row exactly where it was and the delete still on offer; nothing on screen implies
 *   the file went anywhere it did not.
 */

import { PanelRightOpen, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DeleteFileConfirmation,
  useDeleteFileConfirmation,
} from '@/components/files/DeleteFileConfirmation';
import { FileStatusBadge } from '@/components/files/FileStatusBadge';
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
import { useToast } from '@/contexts/ToastContext';
import { serviceDetailOf, serviceMessageOf } from '@/lib/api/errors';
import {
  deleteFailureMessage,
  deleteSubmittedFile,
  fetchSubmittedFiles,
} from '@/lib/api/files';
import { DELETE_FILE_LABEL } from '@/lib/files/deleteConfirmation';
import { submittedFileAddress } from '@/lib/files/fileAddress';
import { subscribeToFileSubmissions } from '@/lib/files/fileSubmissions';
import { ROLE_IMPORTER } from '@/types/auth';
import {
  FILE_STATUS_IMPORTED,
  FILE_STATUS_VALIDATION_FAILED,
  isFileInProgress,
} from '@/types/files';

import type { FileLog, FileLogList } from '@/types/files';

/** What the section is called, and what ties its heading to it. */
const HEADING_ID = 'submitted-files-heading';
const HEADING = 'Submitted files';

/** Announced while the list is being read, so the wait is not colour and motion only. */
const LOADING_MESSAGE = 'Loading the submitted files…';

/** Nothing has been submitted yet — an empty list is an answer, not a failure. */
const EMPTY_MESSAGE = 'No files have been submitted yet.';

/** Names what did not happen, so the alert is not just an apology. */
const FAILED_TITLE = 'Could not load the submitted files';

/**
 * Shown when the read failed with nothing readable from the service. The client's own
 * placeholders ("Internal Server Error: …") are never put in front of a user, so this
 * plain sentence stands in for them (project.md NFR-base-5).
 */
const FAILED_MESSAGE =
  'The submitted files could not be loaded. Please try again.';

/**
 * How long the screen waits before asking the service again while a file is still
 * being processed.
 *
 * Short enough that a file finishing is news rather than history, long enough that a
 * screen left open all afternoon is not a load on the service — and it only ever runs
 * while something is actually in progress. Anything up to a minute satisfies this
 * story's tests; the value itself is nobody's contract.
 */
const REFRESH_INTERVAL_MS = 15_000;

/** Said when a submitted file has finished importing (brief R10). */
const IMPORTED_TITLE = 'File imported';

/**
 * What the user is told when a file finishes: the file's own name and the record
 * count the SERVICE reported, both verbatim (brief BR5) — the screen counts nothing.
 */
const importedMessage = (file: FileLog): string =>
  `${file.CurrentFileName} finished importing. Records imported: ${file.RecordCount}.`;

/**
 * Said when a submitted file finishes validating and some of its rows were rejected
 * (`file-validation-and-retry` FR9, source R91). The status the service reported is
 * the title, so the notification and the file's own row say the same word.
 */
const REJECTED_ROWS_TITLE = FILE_STATUS_VALIDATION_FAILED;

/**
 * Names the file, and nothing else: which file it was is the whole point — a
 * notification that does not name it leaves the user hunting. How MANY rows were
 * rejected is not in the list response, and the screen invents no number.
 */
const rejectedRowsMessage = (file: FileLog): string =>
  `Some rows in ${file.CurrentFileName} were rejected. Open the file to see which rows, and why.`;

/** Where the notification takes the user: that file's own page and its rejected rows. */
const REJECTED_ROWS_LINK_LABEL = 'Open the rejected rows';

/**
 * A notification that never fades on its own.
 *
 * `0` is how the existing toast machinery expresses that — the 5s default applies
 * only when a duration is OMITTED — and it keeps its dismiss control, because state
 * the user must act on stays until they act on it or dismiss it (this epic's NFR-3,
 * source UI-19).
 */
const STAYS_UNTIL_ACTED_ON = 0;

/**
 * How a row offers the way into that file's own page.
 *
 * The visible wording is short because it sits in a column of its own on every row;
 * the file's name follows it for a screen reader, so the links are told apart by more
 * than their position. That extra wording is deliberately NOT the bare file name: the
 * name already has its own cell, and a second element carrying exactly the same text
 * would make the row's own file ambiguous to anything that reads by text.
 */
const OPEN_LABEL = 'Open';
const openLabelFor = (file: FileLog): string =>
  `the file ${file.CurrentFileName}`;

/**
 * How a row's delete action names the file it is about, for a screen reader.
 *
 * The visible wording is the shared `DELETE_FILE_LABEL` — the SAME phrase the file's
 * own page uses, because the two surfaces must not develop separate vocabulary — and
 * the file's name follows it, so a row's delete is told apart from another row's by
 * more than its position. As with the `Open` link above, that extra wording is
 * deliberately not the BARE file name: the name already has its own cell, and a
 * second element carrying exactly the same text would make the row's own file
 * ambiguous to anything reading the table by text.
 */
const deleteLabelFor = (file: FileLog): string =>
  `named ${file.CurrentFileName}`;

/** The last column holds what can be DONE with a row, not one named action. */
const ACTIONS_COLUMN_LABEL = 'Actions';

/** Announced while the delete is on its way, since the row has not changed yet. */
const deletingMessage = (file: FileLog): string =>
  `Deleting ${file.CurrentFileName}…`;

/**
 * Names what did not happen, AND which file it did not happen to — on a list of many
 * files, "this file" would leave the user guessing which row the message is about.
 */
const deleteRefusedTitleFor = (file: FileLog): string =>
  `Could not delete ${file.CurrentFileName}`;

/**
 * Says what the screen still shows and what to do about it — the row is untouched and
 * its own action is still right there (`file-deletion` R10/R11).
 */
const STILL_LISTED_MESSAGE =
  'The file is still listed, exactly as it was. Choose its delete action again to ask once more.';

/** Where a row's delete is: none asked for, one on its way, or one the service refused. */
type DeleteState =
  | { phase: 'idle' }
  | { phase: 'working'; file: FileLog }
  | { phase: 'refused'; file: FileLog; message: string };

const NO_DELETE: DeleteState = { phase: 'idle' };

/** Where the list is: being read, read, or unreadable. */
type ListState =
  | { phase: 'loading' }
  | { phase: 'loaded'; files: FileLog[] }
  | { phase: 'failed'; message: string };

const LOADING: ListState = { phase: 'loading' };

/**
 * The files in a response body, tolerating a body that carries none: an absent
 * property is the empty list, which is a legitimate answer and not a failure.
 */
const filesIn = (body: FileLogList | undefined): FileLog[] =>
  Array.isArray(body?.FileLog) ? body.FileLog : [];

/**
 * What the screen may tell this list about the person in front of it. Both answers are
 * decided on the SERVER by `/upload`; nothing here reads a session in the browser.
 *
 * THE TWO PROPS HAVE OPPOSITE DEFAULTS, AND THAT IS THE POINT — they answer two
 * different questions, so copying one's convention into the other is a real defect
 * rather than an inconsistency:
 *
 * - `viewerRoles` is the signed-in person's role names (`rolesOf(session)`). It is
 *   OPTIONAL, and a list rendered WITHOUT it still speaks up: this component's
 *   original contract carries no session prop at all (`expense-file-upload` story 3),
 *   so withholding a notification from a caller that has not said who is watching
 *   would silently change shipped behaviour.
 * - `actingUploader` is the Finance Uploader's own name where the session may DELETE a
 *   file, and `undefined` otherwise (`actingUploaderIn(session)` — the same value the
 *   file's own page hands `SubmittedFileActions`). Its ABSENCE means NO DELETE CONTROL
 *   AT ALL: the safe default, so a caller that has said nothing about who is acting
 *   cannot be handed a destructive action the server never authorised. Absent, never
 *   disabled (source UI-24). The same value is the `LastChangedUser` audit identity
 *   the delete call carries (`file-deletion` BR7), so the name the service records can
 *   never be something the browser chose for itself.
 */
interface SubmittedFilesListProps {
  viewerRoles?: string[];
  actingUploader?: string;
}

export function SubmittedFilesList({
  viewerRoles,
  actingUploader,
}: SubmittedFilesListProps = {}) {
  const [state, setState] = useState<ListState>(LOADING);
  /** Bumped by Try again, a submission, and a completed delete; asking for the list
   * again is what re-runs the read. */
  const [readsRequested, setReadsRequested] = useState(0);
  /** Where the delete asked for from a row has got to (one at a time, since one
   * confirmation serves the whole table). */
  const [deleteState, setDeleteState] = useState<DeleteState>(NO_DELETE);
  /**
   * Which file the user is being asked to confirm the deletion of, and what is known
   * about the expense payment requests it produced. ONE controller for the table:
   * only one row can be being confirmed at a time, and asking is the event that both
   * opens the confirmation and starts the count.
   */
  const deleteConfirmation = useDeleteFileConfirmation();
  /** The app's one notification surface, in the root layout (brief R10). */
  const { showToast } = useToast();

  /**
   * Whether the person watching this list is the one the rejected-rows notification
   * is addressed to — the Finance Uploader, which the auth service calls
   * `Importer` (`types/auth.ts`; matching on "Finance Uploader" recognises nobody).
   *
   * An Approver watching the same list is not told about rejected rows (this epic's
   * AC-5) — their rows still keep themselves current, which is what they came for.
   * A caller that has not said who is watching is told, per the contract above.
   *
   * Derived as a plain boolean rather than read from the array inside the callback
   * below, so a caller handing in a fresh array on every render cannot restart the
   * read or the refresh timer.
   */
  const tellsTheUploaderAboutRejectedRows =
    viewerRoles === undefined || viewerRoles.includes(ROLE_IMPORTER);

  /**
   * What status each listed file was last seen in, by file id. This is a record of
   * what the user has already been told — not something rendered — so it lives in a
   * ref, and it is what makes a file ARRIVING at an outcome tellable from a file that
   * already had that outcome when the screen opened: only the first is news.
   */
  const statusesAlreadySeen = useRef<Map<number, string>>(new Map());

  /**
   * Tells the user about every file that has just reached an outcome, and remembers
   * what each listed file is now.
   *
   * Two outcomes are announced, and the difference between them is deliberate:
   *
   * - `Imported` is good news and nothing is expected of the user, so it keeps the
   *   toast's own lifetime and fades on its own (brief R10).
   * - `Validation failed` is something the user must act on, so it does NOT fade
   *   (`STAYS_UNTIL_ACTED_ON`) and carries a link straight to that file's rejected
   *   rows (`file-validation-and-retry` FR9 / NFR-3, source R91 / UI-19).
   *
   * Both fire on the TRANSITION into the status, never on the status itself: a file
   * already finished on the first read has not just happened, and a file that stays
   * finished across every later re-read is not announced again.
   */
  const announceFinishedFiles = useCallback(
    (files: FileLog[]): void => {
      const seen = statusesAlreadySeen.current;

      files.forEach((file) => {
        const previousStatus = seen.get(file.Id);
        seen.set(file.Id, file.CurrentStatus);

        /** Nothing was known about this file yet, so nothing about it is news. */
        if (previousStatus === undefined) {
          return;
        }

        const justReached = (status: string): boolean =>
          previousStatus !== status && file.CurrentStatus === status;

        if (justReached(FILE_STATUS_IMPORTED)) {
          showToast({
            variant: 'success',
            title: IMPORTED_TITLE,
            message: importedMessage(file),
          });
        }

        if (
          justReached(FILE_STATUS_VALIDATION_FAILED) &&
          tellsTheUploaderAboutRejectedRows
        ) {
          showToast({
            // The intent this project gives a failed validation — the same one the
            // file's own status chip wears (`FileStatusBadge`), so the notification
            // and the row do not describe the outcome differently.
            variant: 'warning',
            title: REJECTED_ROWS_TITLE,
            message: rejectedRowsMessage(file),
            duration: STAYS_UNTIL_ACTED_ON,
            link: {
              href: submittedFileAddress(file),
              label: REJECTED_ROWS_LINK_LABEL,
            },
          });
        }
      });
    },
    [showToast, tellsTheUploaderAboutRejectedRows],
  );

  /**
   * Reads the list and puts what came back on screen.
   *
   * A failure is only ever reported as the failed-load state when there is nothing on
   * screen to lose (a first read, or a Try again, which puts the screen back into its
   * busy state first). When real rows are already showing, a failed read is left
   * unmentioned and those rows stay exactly as they were — a background refresh must
   * not blank the list or replace it with an error (story 3 AC-5).
   *
   * `stillWatching` is how a caller says its read no longer matters: this component
   * has gone away, or the screen has moved on.
   */
  const readList = useCallback(
    (stillWatching: () => boolean): Promise<void> =>
      fetchSubmittedFiles()
        .then((body) => {
          if (!stillWatching()) {
            return;
          }
          const files = filesIn(body);
          announceFinishedFiles(files);
          setState({ phase: 'loaded', files });
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
                  // The service's own wording when it sent one, from EITHER place a
                  // failure can carry it — the transactions service describes a
                  // failure with a 500, where the client keeps its own placeholder
                  // on `message` and the service's `Messages[]` on `details`. Never
                  // the placeholder itself: `serviceMessageOf` / `serviceDetailOf`
                  // draw that line (architecture.md §Shared building blocks).
                  message:
                    serviceMessageOf(error) ??
                    serviceDetailOf(error) ??
                    FAILED_MESSAGE,
                },
          );
        }),
    [announceFinishedFiles],
  );

  useEffect(() => {
    // A read that is still in flight when this component goes away — or when the
    // user asks for the list again — must not land on a screen that has moved on.
    let watching = true;

    void readList(() => watching);

    return () => {
      watching = false;
    };
  }, [readsRequested, readList]);

  /**
   * Whether any listed file is still working, which is the only reason to keep asking
   * the service anything. Read straight off what is on screen, so it cannot disagree
   * with the rows the user is looking at.
   */
  const somethingIsInProgress =
    state.phase === 'loaded' &&
    state.files.some((file) => isFileInProgress(file.CurrentStatus));

  /**
   * While something is in progress, the same list call is re-read on a timer and the
   * rows catch up in place (brief Feature NFR "List currency"). Once nothing is in
   * progress this effect stops running, which clears the timer: the screen goes quiet
   * rather than asking a settled question forever. One timer at most — it is tied to
   * that single fact, not to every render — and it goes away with the component.
   */
  useEffect(() => {
    if (!somethingIsInProgress) {
      return;
    }

    let watching = true;
    const refresh = setInterval(() => {
      void readList(() => watching);
    }, REFRESH_INTERVAL_MS);

    return () => {
      watching = false;
      clearInterval(refresh);
    };
  }, [somethingIsInProgress, readList]);

  /**
   * A file submitted elsewhere on this screen is not in this list yet, and the
   * upload's answer carries no file identifier — so the only way it can appear is a
   * re-read (brief §Notes & Caveats). The rows already on screen deliberately stay
   * put while that read is in flight: nothing about them has been invalidated, and
   * blanking them would be a worse answer than showing them a moment out of date.
   */
  useEffect(
    () =>
      subscribeToFileSubmissions(() => {
        setReadsRequested((reads) => reads + 1);
      }),
    [],
  );

  const readAgain = (): void => {
    setState(LOADING);
    setReadsRequested((reads) => reads + 1);
  };

  /**
   * Deletes the file the user has just confirmed, and lets the SERVICE decide what the
   * screen then shows (`file-deletion` R9/R10/R11/R12).
   *
   * On success nothing is removed from anything here: the list is simply asked again,
   * through the same read `Try again` and a submission already use. That is what makes
   * the row's disappearance the service's answer rather than this component's opinion
   * of it — and it is also how everything ELSE that has moved on since the last read
   * arrives at the same time. The rows on screen deliberately stay put while that read
   * is in flight; blanking them would be a worse answer than showing them a moment out
   * of date, and no second timer is involved anywhere.
   *
   * On refusal the file and every row stay exactly as they were and the service's own
   * wording is reported above the table — never a claimed success, never a silent
   * no-op, and never navigation, which is the file page's behaviour on success and has
   * no meaning here. What the service does to a file that has already IMPORTED is
   * unverified (BR6), so whatever it answers is what the user is told.
   */
  const confirmDelete = (file: FileLog): void => {
    // Only a session the server named may delete, and a second press must not send a
    // second call while one is already on its way.
    if (actingUploader === undefined || deleteState.phase === 'working') {
      return;
    }
    setDeleteState({ phase: 'working', file });

    void deleteSubmittedFile(file.Id, actingUploader)
      .then(() => {
        setDeleteState(NO_DELETE);
        // The answer is the generic envelope and says nothing about the list, so the
        // list finds out by re-reading itself (R12).
        setReadsRequested((reads) => reads + 1);
      })
      .catch((error: unknown) => {
        // One state change, not two: the refusal being reported and the wait being
        // over are the same moment, and a reader must never meet one without the other.
        setDeleteState({
          phase: 'refused',
          file,
          // The service's own wording whenever it sent one, from EITHER place a failure
          // can carry it; never the client's internal placeholder.
          message: deleteFailureMessage(error),
        });
      });
  };

  return (
    <section aria-labelledby={HEADING_ID} className="grid gap-4">
      <h2 id={HEADING_ID} className="text-lg font-semibold tracking-tight">
        {HEADING}
      </h2>

      {/* A refused delete is reported HERE, on the screen behind the confirmation,
          which has already closed — a user is never held in a dialog to read why
          nothing happened, and the row it names is still in the table below. */}
      {deleteState.phase === 'refused' && (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">
            {deleteRefusedTitleFor(deleteState.file)}
          </AlertTitle>
          <AlertDescription className="text-foreground">
            <p>{deleteState.message}</p>
            <p>{STILL_LISTED_MESSAGE}</p>
          </AlertDescription>
        </Alert>
      )}

      {deleteState.phase === 'working' && (
        <p role="status" className="text-muted-foreground text-sm">
          {deletingMessage(deleteState.file)}
        </p>
      )}

      {state.phase === 'loading' && (
        <div role="status" className="grid gap-2">
          <span className="sr-only">{LOADING_MESSAGE}</span>
          {/* Placeholders stand in for the rows that are on their way; the sentence
              above is what a screen reader is given, since a shape says nothing. */}
          <Skeleton aria-hidden="true" className="h-10 w-full" />
          <Skeleton aria-hidden="true" className="h-10 w-full" />
          <Skeleton aria-hidden="true" className="h-10 w-full" />
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
        (state.files.length === 0 ? (
          <p className="text-muted-foreground max-w-prose">{EMPTY_MESSAGE}</p>
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Submitted expense files, with the setting each was sent against,
              when it was processed, its status, its most recent processing
              activity, how many records it holds and what can be done with it.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">File</TableHead>
                <TableHead scope="col">File setting</TableHead>
                <TableHead scope="col">Processed</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Most recent activity</TableHead>
                <TableHead scope="col" className="text-right">
                  Records
                </TableHead>
                <TableHead scope="col" className="text-right">
                  <span className="sr-only">{ACTIONS_COLUMN_LABEL}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.files.map((file) => (
                <TableRow key={file.Id}>
                  <TableCell className="font-medium">
                    {file.CurrentFileName}
                  </TableCell>
                  <TableCell>{file.SettingName}</TableCell>
                  <TableCell>{file.ProcessDate}</TableCell>
                  <TableCell>
                    <FileStatusBadge status={file.CurrentStatus} />
                  </TableCell>
                  <TableCell>{file.LastExecutedActivityName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {file.RecordCount}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {/* A real link, so the file's page can be opened in a new tab
                          and is announced as somewhere to go — never a button that
                          pushes a route. */}
                      <Button asChild variant="ghost" size="sm">
                        <Link href={submittedFileAddress(file)}>
                          <PanelRightOpen aria-hidden="true" />
                          {OPEN_LABEL}{' '}
                          <span className="sr-only">{openLabelFor(file)}</span>
                        </Link>
                      </Button>

                      {/* The delete, IN the row beside the link and reachable by Tab
                          alone — never behind a menu. There is no status condition on
                          it: a file may be deleted whatever its status, an `Imported`
                          one included (R3/BR1). A session the server did not name gets
                          no markup for it at all. */}
                      {actingUploader !== undefined && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            // Asking is the event that both opens the confirmation and
                            // starts reading what this file would destroy — never a
                            // render reacting to the dialog.
                            deleteConfirmation.ask(file);
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                          {DELETE_FILE_LABEL}{' '}
                          <span className="sr-only">
                            {deleteLabelFor(file)}
                          </span>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      {/* The epic's ONE confirmation, shared with the file's own page — it names the
          file, says what deleting actually destroys (the real request numbers for a
          file that has imported, the short warning otherwise, and its own state when
          the count could not be read), holds focus on the way out, and sends nothing
          until the confirming choice is taken. One for the whole table, since only one
          row can be being confirmed at a time. */}
      {actingUploader !== undefined && (
        <DeleteFileConfirmation
          confirmation={deleteConfirmation}
          onConfirm={confirmDelete}
        />
      )}
    </section>
  );
}
