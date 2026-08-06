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
 * Four things here are deliberate and easy to break:
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
 */

import { CircleSlash, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { FileProcessingHistory } from '@/components/files/FileProcessingHistory';
import { FileStatusBadge } from '@/components/files/FileStatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchSubmittedFiles, fileLookupFailureMessage } from '@/lib/api/files';
import { UPLOAD_PATH } from '@/lib/auth/access-map';

import type { ReactNode } from 'react';

import type { FileLog, FileLogList } from '@/types/files';

/** What the screen is called before — or instead of — a file's own name. */
const FALLBACK_TITLE = 'Submitted file';

/** Announced while the file is being resolved — a shape on its own says nothing. */
const LOADING_MESSAGE = 'Loading this file…';

/** How the way back to the list reads, and where it goes. */
const BACK_LABEL = 'Back to Expense files';

/**
 * The one answer for a file that is not in the active list: cancelled, unknown, or an
 * identifier that was never usable.
 *
 * The title carries the phrase a user scans for; the sentence below it explains why
 * without repeating that phrase, and without dressing it up as a system failure —
 * nothing went wrong.
 */
const UNAVAILABLE_TITLE = 'This file is not available';
const UNAVAILABLE_MESSAGE =
  'It may have been cancelled, or the address may point to a file that no longer exists. Open one of the files still in play from the Expense files list.';

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

/** One of the file's own values, printed exactly as the service reported it. */
function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/** The way back to the list this file was opened from. */
function BackToFilesLink() {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={UPLOAD_PATH}>{BACK_LABEL}</Link>
    </Button>
  );
}

export function SubmittedFileDetail({ logId }: { logId: string | undefined }) {
  /** The identifier as it arrived, with nothing but surrounding space removed. */
  const requestedLogId = logId?.trim() ?? '';
  const [state, setState] = useState<FileState>(
    requestedLogId === '' ? UNAVAILABLE : LOADING,
  );
  /** Bumped by the read-again action; asking again is what re-runs the read. */
  const [readsRequested, setReadsRequested] = useState(0);

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
  }, [requestedLogId, readsRequested, readFile]);

  const readAgain = (): void => {
    setState(LOADING);
    setReadsRequested((reads) => reads + 1);
  };

  if (state.phase === 'loading') {
    return (
      <section className="grid gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {FALLBACK_TITLE}
        </h1>
        <div role="status" className="grid gap-2">
          <span className="sr-only">{LOADING_MESSAGE}</span>
          {/* Placeholders stand in for the values on their way; the sentence above
              is what a screen reader is given, since a shape says nothing. */}
          <Skeleton aria-hidden="true" className="h-6 w-64" />
          <Skeleton aria-hidden="true" className="h-24 w-full" />
        </div>
      </section>
    );
  }

  if (state.phase === 'unavailable') {
    return (
      <section className="grid max-w-prose gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {FALLBACK_TITLE}
        </h1>
        <Alert>
          <CircleSlash aria-hidden="true" />
          <AlertTitle className="line-clamp-none">
            {UNAVAILABLE_TITLE}
          </AlertTitle>
          <AlertDescription className="text-foreground gap-3">
            <p>{UNAVAILABLE_MESSAGE}</p>
            <BackToFilesLink />
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  if (state.phase === 'failed') {
    return (
      <section className="grid max-w-prose gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {FALLBACK_TITLE}
        </h1>
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">{FAILED_TITLE}</AlertTitle>
          <AlertDescription className="text-foreground gap-3">
            <p>{state.message}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={readAgain}
              >
                {READ_AGAIN_LABEL}
              </Button>
              <BackToFilesLink />
            </div>
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  const { file } = state;

  return (
    <div className="grid gap-8">
      <div className="grid justify-items-start gap-3">
        <BackToFilesLink />
        {/* The file names the screen it is about. Every value below it is the
            service's own, printed as it arrived (brief BR5). */}
        <h1 className="text-2xl font-semibold tracking-tight break-words">
          {file.CurrentFileName}
        </h1>
      </div>

      <section aria-labelledby={SUMMARY_HEADING_ID} className="grid gap-4">
        <h2
          id={SUMMARY_HEADING_ID}
          className="text-lg font-semibold tracking-tight"
        >
          {SUMMARY_HEADING}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label={FIELD.setting}>{file.SettingName}</DetailField>
          <DetailField label={FIELD.processed}>{file.ProcessDate}</DetailField>
          <DetailField label={FIELD.status}>
            <FileStatusBadge status={file.CurrentStatus} />
          </DetailField>
          <DetailField label={FIELD.records}>
            <span className="tabular-nums">{file.RecordCount}</span>
          </DetailField>
          <DetailField label={FIELD.activity}>
            {file.LastExecutedActivityName}
          </DetailField>
        </dl>
      </section>

      <FileProcessingHistory logId={file.Id} />
    </div>
  );
}
