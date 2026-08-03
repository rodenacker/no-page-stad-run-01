'use client';

/**
 * Every expense file that has been submitted, as the transactions service reports
 * it — the screen both the Finance Uploader and the Approver watch (brief R3, R9).
 *
 * Three things about this component are deliberate and easy to break:
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
 *   cookie travel by itself, and what makes the three states below this component's
 *   own business rather than a server render's.
 * - **All three non-data states are answered** (project.md NFR-base-5): a busy state
 *   that is announced and not merely drawn, a plain sentence when nothing has been
 *   submitted yet, and — when the list cannot be loaded — the service's own wording
 *   plus one action that asks for it again. A failed load is never a blank screen.
 *
 * The status chip pairs an intent colour with the status TEXT and an icon, never
 * colour alone (brief §Feature NFRs, source UI-21). Every colour is a token from
 * `globals.css` with a value in both themes, so the chip reads in light and dark
 * without per-screen work (styling-centralisation.md).
 */

import {
  CircleCheck,
  CircleSlash,
  FileUp,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { serviceMessageOf } from '@/lib/api/errors';
import { fetchSubmittedFiles } from '@/lib/api/files';
import { subscribeToFileSubmissions } from '@/lib/files/fileSubmissions';
import {
  FILE_STATUS_CANCELLED,
  FILE_STATUS_IMPORTED,
  FILE_STATUS_UPLOADED,
  FILE_STATUS_VALIDATING,
  FILE_STATUS_VALIDATION_FAILED,
  isKnownFileStatus,
} from '@/types/files';

import type { LucideIcon } from 'lucide-react';

import type { FileLog, FileLogList, FileStatus } from '@/types/files';

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

/** How each recognised status is shown: an intent colour and an icon, beside its text. */
interface StatusPresentation {
  /** Token-based surface + paired foreground; both themes are covered in globals.css. */
  tone: string;
  icon: LucideIcon;
}

/**
 * Intent per status, following the mapping already settled at project level
 * (project.md §Semantic status colors, brief §Feature NFRs): in-progress and
 * finished-well states are informational and successful, a failed validation is a
 * warning the user acts on, and a cancelled file is neutral.
 */
const STATUS_PRESENTATION: Record<FileStatus, StatusPresentation> = {
  [FILE_STATUS_UPLOADED]: {
    tone: 'bg-info text-info-foreground',
    icon: FileUp,
  },
  [FILE_STATUS_VALIDATING]: {
    tone: 'bg-info text-info-foreground',
    icon: LoaderCircle,
  },
  [FILE_STATUS_VALIDATION_FAILED]: {
    tone: 'bg-warning text-warning-foreground',
    icon: TriangleAlert,
  },
  [FILE_STATUS_IMPORTED]: {
    tone: 'bg-success text-success-foreground',
    icon: CircleCheck,
  },
  [FILE_STATUS_CANCELLED]: {
    tone: 'bg-muted text-muted-foreground border-border',
    icon: CircleSlash,
  },
};

/**
 * A status this app has no name for: shown in neutral, with no icon claiming to know
 * what it means, and — above all — with the service's own words (brief BR5).
 */
const UNRECOGNISED_STATUS_TONE = 'bg-muted text-muted-foreground border-border';

/** The status as the service sent it, carried by a colour AND readable as text. */
function FileStatusBadge({ status }: { status: string }) {
  const presentation = isKnownFileStatus(status)
    ? STATUS_PRESENTATION[status]
    : undefined;
  const StatusIcon = presentation?.icon;

  return (
    <Badge className={presentation?.tone ?? UNRECOGNISED_STATUS_TONE}>
      {StatusIcon ? <StatusIcon aria-hidden="true" /> : null}
      {status}
    </Badge>
  );
}

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

export function SubmittedFilesList() {
  const [state, setState] = useState<ListState>(LOADING);
  /** Bumped by Try again; asking for the list again is what re-runs the read. */
  const [readsRequested, setReadsRequested] = useState(0);

  useEffect(() => {
    // A read that is still in flight when this component goes away — or when the
    // user asks for the list again — must not land on a screen that has moved on.
    let watching = true;

    void fetchSubmittedFiles()
      .then((body) => {
        if (watching) {
          setState({ phase: 'loaded', files: filesIn(body) });
        }
      })
      .catch((error: unknown) => {
        if (watching) {
          // The service's own wording when it sent one; never the API client's
          // internal placeholder (`serviceMessageOf` draws that line).
          setState({
            phase: 'failed',
            message: serviceMessageOf(error) ?? FAILED_MESSAGE,
          });
        }
      });

    return () => {
      watching = false;
    };
  }, [readsRequested]);

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

  return (
    <section aria-labelledby={HEADING_ID} className="grid gap-4">
      <h2 id={HEADING_ID} className="text-lg font-semibold tracking-tight">
        {HEADING}
      </h2>

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
              activity and how many records it holds.
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}
    </section>
  );
}
