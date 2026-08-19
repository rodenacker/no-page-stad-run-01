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
 * HOW IT IS DRAWN — A REGISTER OF BATCHES, ONE RULED LINE EACH
 * (`files-view-redesign` R10/R11/R12, design brief §3 "Files list… a register of
 * batches, one ruled line each with its control totals"). Every part of that is
 * imported from `components/requests/fieldNotation.ts`, never restated here (BR6):
 *
 * - **Full-bleed to the page padding.** The listing's box is widened past `<main>`'s
 *   own `px-4` (`PAGE_BLEED_CLASS`) so every hairline row rule reaches the edge of
 *   the page, with that padding put back on the outer cells
 *   (`LISTING_EDGE_PADDING_CLASS`) so the values stay lined up with the labels above
 *   them. The closing hairline is drawn on that box, because the table primitive
 *   deliberately leaves its last row unruled and a register worked down a page needs
 *   a bottom edge as much as it needs the rules between its lines.
 * - **There is no card, no panel and no striped-row treatment.** What frames the
 *   register is the ruling. The primitive's per-row hover fill and its colour
 *   transition are cancelled at the row (`LISTING_ROW_CLASS`): a row that tints under
 *   the pointer is the stripe arriving one row at a time, which this design names as
 *   an anti-goal (BR9).
 * - **The column heads and this section's own heading are the same object**: the
 *   tracked 11px mono micro-label at the muted ink (`LISTING_LABEL_CLASS`). The
 *   capitals are `text-transform`, so every heading's wording — and the table's own
 *   accessible structure — is exactly the words the app wrote. Never retype a head in
 *   capitals to get the look.
 * - **A file's own record count is its "control total"**: right-aligned, mono and
 *   tabular (`FIGURE_CELL_CLASS`) so the digits line up column-perfect down the
 *   register. There is deliberately NO register-spanning total above the rows (BR5) —
 *   each line states its own, which is the whole of what this design asks for here.
 * - **The file name, the setting and the process date are identifiers**, set in the
 *   fixed-field face (`NOTATION_CELL_CLASS`) with no added weight: down a ruled column
 *   the mono face is what makes one file scannable against the next, so a `font-medium`
 *   on top of it is the card-era treatment rather than this one. The most recent
 *   activity is prose and stays in the text face.
 * - **Every control is a tracked label on a rule** (`RULED_ACTION_WITH_ICON_CLASS`,
 *   with its glyph sized on the ICON — a glyph that omits `RULED_ACTION_ICON_CLASS`
 *   quietly renders at the button primitive's 16px). That is the same notation the
 *   expense request's own controls wear, and it carries no colour: a delete is
 *   protected by its confirmation, not by how heavy or how red its button is.
 * - **Each answer that is not a row is a full-bleed ruled band** (`RULED_BAND_CLASS`)
 *   — the wait, nothing-submitted-yet, a failed read and a refused delete. With the
 *   card gone there is nothing else framing an answer, and the wording, the roles and
 *   the actions of all four are untouched.
 *
 * AND ON A PHONE IT IS THE SAME REGISTER, TIGHTENED (R3, source UI-23). Below the one
 * crossover `lib/layout/viewport.ts` states, each file becomes a group of ruled lines
 * carrying its own name, its status, its own control total and what last happened to it,
 * with both of its controls on a line of their own — the shared
 * `components/files/NarrowListing` composition, which the other three listings on these two
 * screens wear too. Three things about that switch are load-bearing:
 *
 * - **One presentation or the other, never both.** A seven-column table kept inside the
 *   primitive's own `overflow-x-auto` wrapper is exactly the contained sideways scroll R3
 *   refuses, so the table is not rendered at all at that width.
 * - **The column heads and the narrow labels are ONE wording** ({@link COLUMN}), so the two
 *   presentations cannot name the same value two ways.
 * - **A group offers exactly what a line offers** ({@link FileRowControls}): the same `Open`
 *   link and the same delete, from the same markup, so nothing can be reachable only on a
 *   wide screen.
 *
 * The status pairs an intent colour with the status TEXT and a drawn shape, never
 * colour alone (brief §Feature NFRs, source UI-21). It is `components/files/
 * FileStatusBadge` — the one file-status vocabulary in the project, shared with a
 * file's own page, and itself built on the shared `components/status/StatusBadge`,
 * which owns the intents and their shapes and has read as a RULED MARK rather than a
 * pill project-wide since `request-list-redesign`. Nothing here draws a second one.
 *
 * Each row also offers the way INTO that file's own page, as a real navigational link
 * carrying the file's identifier (`file-validation-and-retry` FR8): a link, not a
 * button that pushes a route, so it can be opened in a new tab and is announced as a
 * link.
 *
 * DELETING A FILE FROM A ROW (`file-deletion` R1, R5, R9, R10, R11, R12, BR2, BR7)
 * adds six things to that, and each of them is easy to get subtly wrong:
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
 *   One controller serves the whole table, since only one row can be being CONFIRMED
 *   at a time — and it is handed the rows currently on screen, so a file that imports
 *   while its own confirmation is open is described by what it is now rather than by
 *   the status it was in when the delete was chosen (BR5).
 * - **EVERY DELETE IN FLIGHT IS ITS OWN, KEYED BY FILE.** A confirmed delete is never
 *   dropped because a DIFFERENT row's delete happens to be on its way: the calls run
 *   alongside each other and each one's in-flight line and each refusal name their own
 *   file. One shared "a delete is working" flag would silently swallow the second
 *   file's confirmed delete — a user agreeing to something irreversible and getting
 *   silence — and would label the wait with the wrong file's name. The only press that
 *   is ignored is a second one for a file whose own delete is already on its way, and
 *   that one is not silent: its in-flight line is on screen, naming it.
 * - **A deleted row goes because the list RE-READ ITSELF.** A success asks for the
 *   list again through the very same read the auto-refresh and a submission already
 *   use (`readsRequested`) — never a locally spliced array standing in for the
 *   service's answer, and never a second timer (R12, Feature NFR "List currency").
 *   Only the LAST read asked for may answer, so a poll that set off before the delete
 *   and lands after that re-read cannot put the deleted row back on screen. A refusal
 *   is reported here in the SERVICE's own words with the dialog closed, the row exactly
 *   where it was and the delete still on offer; nothing on screen implies the file went
 *   anywhere it did not.
 * - **A KEYBOARD USER IS NOT DROPPED WHEN THEIR ROW GOES.** The dialog hands focus back
 *   to the control that opened it, and the re-read then takes that control off the page
 *   with the row — leaving focus on `<body>`, so the next Tab starts again at the top of
 *   the document (the epic's Keyboard completability NFR, WCAG 2.2 AA). So when a row
 *   this screen deleted has actually gone AND focus was lost with it, focus is moved to
 *   this section's own heading: the nearest thing that is still there, and the anchor a
 *   reader carries on from. Only then — a reader who has moved on to something else
 *   keeps their place.
 */

import { PanelRightOpen, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DeleteFileConfirmation,
  useDeleteFileConfirmation,
} from '@/components/files/DeleteFileConfirmation';
import { FileStatusBadge } from '@/components/files/FileStatusBadge';
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
import { useNarrowViewport } from '@/lib/layout/useNarrowViewport';
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

/**
 * How many ruled placeholder lines stand in for the register while it is being read.
 *
 * Enough to read as a register rather than as one stray line, few enough that the answer
 * landing does not shorten the page. They are `aria-hidden`: what a screen reader is given
 * is {@link LOADING_MESSAGE}, because a shape says nothing.
 */
const PLACEHOLDER_LINES = [1, 2, 3];

/**
 * A control a register row offers: the app's one ruled action notation, imported whole.
 *
 * Named here only so the two controls in a row cannot be given different ones by accident.
 * It is deliberately the SAME value the expense request's controls wear rather than a
 * files-only variant of it (`files-view-redesign` R12/BR6) — including its ink: the delete
 * carried `text-destructive` in the card era, and a single red control repeated once per
 * row is the loudest thing on a screen whose colour budget is ground, ink, hairline and the
 * four status tokens.
 */
const ROW_ACTION_CLASS = RULED_ACTION_WITH_ICON_CLASS;

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

/**
 * WHAT EACH OF A FILE'S VALUES IS CALLED — one wording, spent twice.
 *
 * The wide register heads its columns with these words and the narrow group labels its
 * fields with the same ones (R3/R10): a column head and a field label are the same object
 * in this design, and two copies is how the register and the phone-width register quietly
 * end up naming one value two ways. R10/R3 restyle these; they rename none of them.
 */
const COLUMN = {
  file: 'File',
  setting: 'File setting',
  processed: 'Processed',
  status: 'Status',
  activity: 'Most recent activity',
  records: 'Records',
} as const;

/**
 * What the register IS, for a phone-width reader who meets the list without seeing its
 * shape. The wide presentation says it in a table caption; at this width there is no
 * caption, so the list says it of itself.
 */
const NARROW_LISTING_LABEL = 'Submitted expense files';

/**
 * WHAT A FILE'S LINE OFFERS — one markup, rendered by both presentations, which is what
 * makes "nothing is reachable only on a wide screen" (R3) structural rather than a promise.
 *
 * The way in stays a real navigational link carrying the file's identifier
 * (`file-validation-and-retry` FR8) — a link, not a button that pushes a route, so it can be
 * opened in a new tab and is announced as somewhere to go. The delete sits beside it and is
 * reachable by Tab alone, never behind a menu that has to be opened first (`file-deletion`
 * story 3 AC-6): a session the server did not name gets no markup for it at all, and there
 * is no status condition on it — a file may be deleted whatever its status, an `Imported`
 * one included (R3/BR1).
 */
function FileRowControls({
  file,
  actingUploader,
  onAskToDelete,
}: {
  file: FileLog;
  /** The Finance Uploader's own name where this session may delete; `undefined` otherwise
   * — see {@link SubmittedFilesListProps}. Absent, never disabled (source UI-24). */
  actingUploader: string | undefined;
  onAskToDelete: (file: FileLog) => void;
}) {
  return (
    <>
      <Button asChild variant="ghost" className={ROW_ACTION_CLASS}>
        <Link href={submittedFileAddress(file)}>
          <PanelRightOpen
            aria-hidden="true"
            className={RULED_ACTION_ICON_CLASS}
          />
          {OPEN_LABEL} <span className="sr-only">{openLabelFor(file)}</span>
        </Link>
      </Button>

      {actingUploader !== undefined && (
        <Button
          type="button"
          variant="ghost"
          className={ROW_ACTION_CLASS}
          onClick={() => {
            // Asking is the event that both opens the confirmation and starts reading what
            // this file would destroy — never a render reacting to the dialog.
            onAskToDelete(file);
          }}
        >
          <Trash2 aria-hidden="true" className={RULED_ACTION_ICON_CLASS} />
          {DELETE_FILE_LABEL}{' '}
          <span className="sr-only">{deleteLabelFor(file)}</span>
        </Button>
      )}
    </>
  );
}

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

/** Where ONE file's delete has got to: on its way, or refused by the service. */
type WorkingDelete = { phase: 'working'; file: FileLog };
type RefusedDelete = { phase: 'refused'; file: FileLog; message: string };
type DeleteProgress = WorkingDelete | RefusedDelete;

/**
 * Every delete this screen has in play, by file id — never one state for the table.
 *
 * A table offers as many deletes as it has rows, and a user who has confirmed one does
 * not stop reading: the state has to be able to hold a second file's delete on its way
 * beside the first, and a refusal for one file beside another file's wait, each naming
 * the file it belongs to.
 */
type DeletesInPlay = ReadonlyMap<number, DeleteProgress>;

const NO_DELETES: DeletesInPlay = new Map<number, DeleteProgress>();

/** The same deletes with one file's changed, or dropped where it is `undefined`. */
const withDelete = (
  deletes: DeletesInPlay,
  fileId: number,
  progress: DeleteProgress | undefined,
): DeletesInPlay => {
  const next = new Map(deletes);
  if (progress === undefined) {
    next.delete(fileId);
  } else {
    next.set(fileId, progress);
  }
  return next;
};

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

/** No rows yet — one array, so a screen still loading hands out a stable one. */
const NO_FILES: readonly FileLog[] = [];

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
  /** Where each file's delete has got to — one entry per file, never one for the
   * table, so no row's confirmed delete can be lost to another row's. */
  const [deletes, setDeletes] = useState<DeletesInPlay>(NO_DELETES);
  /** The rows the service last gave us, which is also what the confirmation describes
   * its file from — a file that moves on under an open dialog moves the wording with
   * it (BR5). */
  const listedFiles = state.phase === 'loaded' ? state.files : NO_FILES;
  /**
   * Which file the user is being asked to confirm the deletion of, and what is known
   * about the expense payment requests it produced. ONE controller for the table: only
   * one row can be being CONFIRMED at a time (which is not the same as one delete at a
   * time — see `deletes` above).
   */
  const deleteConfirmation = useDeleteFileConfirmation(listedFiles);
  /** The app's one notification surface, in the root layout (brief R10). */
  const { showToast } = useToast();
  /**
   * Where focus is put when a row this screen deleted takes the focused control away
   * with it. `tabIndex={-1}` makes the heading focusable programmatically without
   * putting it in the tab order for everybody else.
   */
  const headingRef = useRef<HTMLHeadingElement>(null);
  /**
   * The file a deleted row still owes focus to, until it has actually left the list.
   * A record of something to DO on the next commit rather than something rendered, so
   * it is a ref: writing it changes nothing on screen.
   */
  const focusOwedFor = useRef<number | undefined>(undefined);
  /**
   * How many list reads have been ASKED for. Each read carries the number it was given
   * and may only answer while it is still the latest, so answers landing out of order
   * cannot leave the screen showing the older one — which is how a poll that set off
   * before a delete used to put the deleted row back (R11/R12). It counts asks, not
   * answers, so the most recent question is always the one that gets to answer.
   */
  const readsIssued = useRef(0);
  /**
   * Whether the reader is at phone width, which decides which of the two presentations of
   * this register is in the markup at all (R3). One crossover, read through the one hook
   * every listing in the app asks with — never a second breakpoint of this screen's own.
   */
  const narrowViewport = useNarrowViewport();

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
   *
   * A read is ALSO over the moment a later one has been asked for. The timer's read, a
   * submission's and a delete's are separate calls with no order to their answers, so
   * without that the older answer could land last and win: a poll that set off before
   * a delete would put the deleted row back on screen (R11/R12). Answering only while
   * still the latest is one rule covering all three, rather than the delete path
   * carrying a guard the others do not.
   */
  const readList = useCallback(
    (stillWatching: () => boolean): Promise<void> => {
      readsIssued.current += 1;
      const thisRead = readsIssued.current;
      const stillTheAnswer = (): boolean =>
        stillWatching() && readsIssued.current === thisRead;

      return fetchSubmittedFiles()
        .then((body) => {
          if (!stillTheAnswer()) {
            return;
          }
          const files = filesIn(body);
          announceFinishedFiles(files);
          setState({ phase: 'loaded', files });
        })
        .catch((error: unknown) => {
          if (!stillTheAnswer()) {
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
        });
    },
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

  /**
   * Puts focus somewhere deliberate once a row this screen deleted has actually gone.
   *
   * The confirmation hands focus back to the control that opened it, and the re-read
   * then unmounts that control with its row — which drops focus onto `<body>`, so the
   * reader's next Tab starts again at the top of the document (the epic's Keyboard
   * completability NFR). This runs after the commit that removed the row, which is why
   * "focus is on `<body>`" is exactly the state it has to answer for; a reader who has
   * meanwhile focused anything else is left where they are, because moving focus out
   * from under somebody is the same rudeness in the other direction.
   */
  useEffect(() => {
    const owed = focusOwedFor.current;
    if (owed === undefined || state.phase !== 'loaded') {
      return;
    }
    // Not gone yet: the delete has been accepted but the list has not answered again.
    if (state.files.some((file) => file.Id === owed)) {
      return;
    }
    focusOwedFor.current = undefined;

    const active = document.activeElement;
    if (active === null || active === document.body) {
      headingRef.current?.focus();
    }
  }, [state]);

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
   *
   * EACH FILE'S DELETE IS ITS OWN. The only press ignored here is a second one for a
   * file whose delete is already on its way — never one for another row, whose user has
   * just agreed to something irreversible and must not be met with silence.
   */
  const confirmDelete = (file: FileLog): void => {
    // Only a session the server named may delete...
    if (actingUploader === undefined) {
      return;
    }
    // ...and a second press on the SAME file must not send a second call. That file's
    // own in-flight line is on screen naming it, so nothing here is silent.
    if (deletes.get(file.Id)?.phase === 'working') {
      return;
    }
    setDeletes((current) =>
      withDelete(current, file.Id, { phase: 'working', file }),
    );

    void deleteSubmittedFile(file.Id, actingUploader)
      .then(() => {
        setDeletes((current) => withDelete(current, file.Id, undefined));
        // Where focus goes once the row this reader was standing on leaves the table.
        focusOwedFor.current = file.Id;
        // The answer is the generic envelope and says nothing about the list, so the
        // list finds out by re-reading itself (R12).
        setReadsRequested((reads) => reads + 1);
      })
      .catch((error: unknown) => {
        // One state change, not two: the refusal being reported and this file's wait
        // being over are the same moment, and a reader must never meet one without the
        // other.
        setDeletes((current) =>
          withDelete(current, file.Id, {
            phase: 'refused',
            file,
            // The service's own wording whenever it sent one, from EITHER place a
            // failure can carry it; never the client's internal placeholder.
            message: deleteFailureMessage(error),
          }),
        );
      });
  };

  /** Which files are being deleted, and which the service refused — in the order their
   * deletes were asked for, since a Map keeps what was put in it in that order. */
  const inFlightDeletes = [...deletes.values()].filter(
    (progress): progress is WorkingDelete => progress.phase === 'working',
  );
  const refusedDeletes = [...deletes.values()].filter(
    (progress): progress is RefusedDelete => progress.phase === 'refused',
  );

  return (
    <section aria-labelledby={HEADING_ID} className="grid gap-4">
      {/* The register's own name, in the same tracked micro-label notation as the column
          heads below it — a printed listing labels itself in the notation it is set in,
          and a bold sentence-case title here would be the last of the card era's
          hierarchy left on the screen (R10). The capitals are `text-transform`, so the
          heading a screen reader is given is still the words the app wrote.

          Focusable only on purpose (`tabIndex={-1}`), so it can be where a keyboard
          reader is put when the row they were standing on is deleted out from under
          them — without joining the tab order for anybody else. */}
      <h2
        id={HEADING_ID}
        ref={headingRef}
        tabIndex={-1}
        className={LISTING_LABEL_CLASS}
      >
        {HEADING}
      </h2>

      {/* A refused delete is reported HERE, on the screen behind the confirmation,
          which has already closed — a user is never held in a dialog to read why
          nothing happened, and the row it names is still in the table below. One per
          refused file, each naming its own: two files refused is two answers, not one
          overwriting the other. */}
      {refusedDeletes.map((refused) => (
        /* Composed as a ruled band, like every other answer on this register that is
           not a row (R12): the `alert` itself is stripped of the card the primitive
           ships with — no radius, no border of its own, no surface — and the band's
           own hairlines frame it, so a refusal reads as this register's own place
           rather than as a panel floating over it (BR9). Its wording and its role are
           untouched. */
        <div key={refused.file.Id} className={`${RULED_BAND_CLASS} py-4`}>
          <Alert className={RULED_ALERT_CLASS}>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className="line-clamp-none">
              {deleteRefusedTitleFor(refused.file)}
            </AlertTitle>
            <AlertDescription className="text-foreground">
              <p>{refused.message}</p>
              <p>{STILL_LISTED_MESSAGE}</p>
            </AlertDescription>
          </Alert>
        </div>
      ))}

      {/* One line per delete on its way, each its own live region naming its own file —
          so two deletes in flight cannot clear each other's announcement, and no wait
          is ever labelled with a file it does not belong to. */}
      {inFlightDeletes.map((working) => (
        <p
          key={working.file.Id}
          role="status"
          className="text-muted-foreground text-sm"
        >
          {deletingMessage(working.file)}
        </p>
      ))}

      {state.phase === 'loading' && (
        <div role="status">
          <span className="sr-only">{LOADING_MESSAGE}</span>
          {/* Placeholders stand in for the lines that are on their way, ruled and
              full-bleed exactly as those lines will be — so the register does not jump
              from a stack of floating boxes into a ruled page when the answer lands.
              Square, because nothing in this world has a radius. The sentence above is
              what a screen reader is given, since a shape says nothing. */}
          <div aria-hidden="true" className={`${PAGE_BLEED_CLASS} border-y`}>
            {PLACEHOLDER_LINES.map((line) => (
              <div key={line} className="border-b px-4 py-3.5 last:border-b-0">
                <Skeleton className="h-4 w-full rounded-none" />
              </div>
            ))}
          </div>
        </div>
      )}

      {state.phase === 'failed' && (
        /* The read left the reader with nothing, so this band stands where the register
           would be, ruled and full-bleed like it (R12). The `alert` is stripped of the
           primitive's card and the band's own hairlines frame it; the wording, the role
           and the retry are unchanged, the retry now wearing the same ruled notation as
           every other control on the screen. */
        <div className={`${RULED_BAND_CLASS} py-6`}>
          <Alert className={RULED_ALERT_CLASS}>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className="line-clamp-none">{FAILED_TITLE}</AlertTitle>
            <AlertDescription className="text-foreground gap-3">
              <p>{state.message}</p>
              {/* The bare notation, without the gap a glyph needs: this control is
                  words alone, exactly as the request list's own retry is. */}
              <Button
                type="button"
                variant="ghost"
                className={RULED_ACTION_CLASS}
                onClick={readAgain}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {state.phase === 'loaded' &&
        (state.files.length === 0 ? (
          /* Nothing has been submitted yet — an answer, and with no card to sit inside
             it is composed as a band of its own: the same hairlines and the same full
             bleed the lines would have had, so the reader is looking at an empty
             register rather than at a sentence on a blank page. The wording is
             unchanged, and it offers no next step — the slip that submits a file is
             already on this screen, immediately above. */
          <div className={`${RULED_BAND_CLASS} py-10`}>
            <p className="text-muted-foreground max-w-prose">{EMPTY_MESSAGE}</p>
          </div>
        ) : narrowViewport ? (
          /* THE SAME REGISTER ON A PHONE (R3, source UI-23): each file is one group of
             ruled lines — its own name, then its status, its own control total and the
             setting it was sent against, then its two controls — and the groups run
             together as one ruled sequence, because a box per file is the card treatment
             this design names as an anti-goal (BR9). The wide table is not rendered at
             all here: seven columns inside the primitive's `overflow-x-auto` wrapper is
             precisely the contained sideways scroll R3 refuses. */
          <NarrowListing label={NARROW_LISTING_LABEL}>
            {state.files.map((file) => (
              // Keyed by the file's own id, for the reason the wide row is: a re-read
              // brings a group UP TO DATE rather than rebuilding it, and a rebuilt group
              // drops the keyboard of whoever was standing on it.
              <NarrowRecord key={file.Id}>
                {/* This batch's real name — the primary identifier UI-23 asks for, in the
                    fixed-field face, broken mid-token if it has to be rather than pushing
                    the page sideways. */}
                <NarrowRecordLine>
                  <span className={`${NOTATION_CELL_CLASS} break-all`}>
                    {file.CurrentFileName}
                  </span>
                </NarrowRecordLine>

                {/* THE THREE KEY VALUES UI-23 ALLOWS, and no fourth: where the file
                    stands, its own control total (R11) and what last happened to it —
                    which together are what a reader watching a submission get on came for
                    (Key Workflow 3). The setting it was sent against is the value that
                    gives way at this width; it is one tap away on the file's own slip
                    (R17). The status names itself, so it carries no label — it is the
                    shared ruled mark, words beside a shape, never colour alone (R2). */}
                <NarrowRecordLine>
                  <FileStatusBadge status={file.CurrentStatus} />
                  <NarrowField label={COLUMN.records}>
                    <span className={FIGURE_CLASS}>{file.RecordCount}</span>
                  </NarrowField>
                  <NarrowField label={COLUMN.activity}>
                    {/* Prose, so it stays in the text face. */}
                    {file.LastExecutedActivityName}
                  </NarrowField>
                </NarrowRecordLine>

                {/* A line of its own, so both controls have the group's whole width to sit
                    across and wrap into at 360px. */}
                <NarrowRecordLine>
                  <FileRowControls
                    file={file}
                    actingUploader={actingUploader}
                    onAskToDelete={deleteConfirmation.ask}
                  />
                </NarrowRecordLine>
              </NarrowRecord>
            ))}
          </NarrowListing>
        ) : (
          /* The register runs full-bleed to the page padding (R10): the box is widened
             past `<main>`'s `px-4` so every hairline row rule reaches the edge of the
             page, while the values inside keep that padding through the outer cells. The
             closing hairline is drawn here rather than on the last row, which the table
             primitive deliberately leaves unruled — a register worked down a page needs a
             bottom edge as much as it needs the rules between its lines. There is no
             card, no panel and no striped-row treatment around it: what frames the
             register is the ruling. */
          <div className={`${PAGE_BLEED_CLASS} border-b`}>
            <Table className={LISTING_EDGE_PADDING_CLASS}>
              <TableCaption className="sr-only">
                Submitted expense files, with the setting each was sent against,
                when it was processed, its status, its most recent processing
                activity, how many records it holds and what can be done with
                it.
              </TableCaption>
              <TableHeader>
                <TableRow className={LISTING_ROW_CLASS}>
                  {/* The column heads: 11px tracked mono micro-labels at the muted ink,
                      capitalised by `text-transform` so each head's wording is exactly
                      the word the app wrote (R10). */}
                  <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                    {COLUMN.file}
                  </TableHead>
                  <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                    {COLUMN.setting}
                  </TableHead>
                  <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                    {COLUMN.processed}
                  </TableHead>
                  <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                    {COLUMN.status}
                  </TableHead>
                  <TableHead scope="col" className={LISTING_LABEL_CLASS}>
                    {COLUMN.activity}
                  </TableHead>
                  {/* Heads a column of figures, so it is right-aligned over them. */}
                  <TableHead
                    scope="col"
                    className={`${LISTING_LABEL_CLASS} text-right`}
                  >
                    {COLUMN.records}
                  </TableHead>
                  {/* The controls column: named for a screen reader, and nothing to
                      label on the page — the controls carry their own words. */}
                  <TableHead scope="col" className="text-right">
                    <span className="sr-only">{ACTIONS_COLUMN_LABEL}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.files.map((file) => (
                  // Keyed by the file's own id, which is what lets a re-read bring a
                  // line UP TO DATE rather than rebuilding it — a rebuilt row drops the
                  // keyboard of whoever was standing on it (story 1 AC-5).
                  <TableRow key={file.Id} className={LISTING_ROW_CLASS}>
                    {/* This batch's real name, and the setting it was sent against: the
                        two identifiers a register of batches is read by, in the
                        fixed-field face and at no added weight. */}
                    <TableCell className={NOTATION_CELL_CLASS}>
                      {file.CurrentFileName}
                    </TableCell>
                    <TableCell className={NOTATION_CELL_CLASS}>
                      {file.SettingName}
                    </TableCell>
                    {/* The process date exactly as the service wrote it (BR5) — a fixed
                        field, not a figure to be added up. */}
                    <TableCell className={NOTATION_CELL_CLASS}>
                      {file.ProcessDate}
                    </TableCell>
                    <TableCell>
                      <FileStatusBadge status={file.CurrentStatus} />
                    </TableCell>
                    {/* Prose, so it stays in the text face. */}
                    <TableCell>{file.LastExecutedActivityName}</TableCell>
                    {/* This line's own control total (R11): right-aligned, mono and
                        tabular, so the digits line up down the column. Its own — there
                        is no register-spanning total anywhere on this screen (BR5). */}
                    <TableCell className={FIGURE_CELL_CLASS}>
                      {file.RecordCount}
                    </TableCell>
                    {/* The line's own controls, held to the right-hand edge of the page
                        so they read as a column of margin annotations down the register
                        rather than as a ragged band in the middle of it. */}
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
                        {/* The SAME two controls the phone-width group offers, from one
                            piece of markup: the way into the file's own page and, for a
                            session the server named, the delete. */}
                        <FileRowControls
                          file={file}
                          actingUploader={actingUploader}
                          onAskToDelete={deleteConfirmation.ask}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
