/**
 * A submitted file's `CurrentStatus`, as the shared ruled mark: the status TEXT beside a
 * shape drawn in the intent's colour, never colour alone (source UI-21, brief §Feature
 * NFRs, WCAG 2.2 AA).
 *
 * This is the FILE vocabulary only — what each of the five recognised file statuses
 * MEANS. The intents themselves, their tokens, the SHAPE each intent is drawn as, and
 * the neutral/shapeless treatment of a value this app has never heard of all belong to
 * the shared `components/status/StatusBadge`, which every list and screen in the project
 * shares. Nothing here draws anything: a second drawing of "imported" is how two screens
 * end up marking the same state two different ways.
 *
 * It lives in its own module because more than one screen shows a file's status — the
 * submitted files list and a file's own page — and there must be exactly ONE file-status
 * map in the project. A second copy is how two screens end up disagreeing about what
 * `Validation failed` looks like.
 */
import { StatusBadge } from '@/components/status/StatusBadge';
import {
  FILE_STATUS_CANCELLED,
  FILE_STATUS_IMPORTED,
  FILE_STATUS_UPLOADED,
  FILE_STATUS_VALIDATING,
  FILE_STATUS_VALIDATION_FAILED,
  isKnownFileStatus,
} from '@/types/files';

import type { StatusPresentation } from '@/components/status/StatusBadge';
import type { FileStatus } from '@/types/files';

/**
 * What each recognised file status MEANS, following the mapping settled at project
 * level (project.md §Semantic status colors, brief §Feature NFRs): in-progress and
 * finished-well states are informational and successful, a failed validation is
 * something the user acts on, and a cancelled file is inert. The colours and shapes those
 * intents wear belong to the shared mark, not here.
 */
const STATUS_PRESENTATION: Record<FileStatus, StatusPresentation> = {
  [FILE_STATUS_UPLOADED]: { intent: 'informational' },
  [FILE_STATUS_VALIDATING]: { intent: 'informational' },
  [FILE_STATUS_VALIDATION_FAILED]: { intent: 'attention' },
  [FILE_STATUS_IMPORTED]: { intent: 'positive' },
  [FILE_STATUS_CANCELLED]: { intent: 'neutral' },
};

/**
 * The status as the service sent it. A status this app has no name for is left without
 * a presentation, so the shared mark shows it neutral and SHAPELESS — with the
 * service's own words (brief BR5).
 */
export function FileStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge
      status={status}
      presentation={
        isKnownFileStatus(status) ? STATUS_PRESENTATION[status] : undefined
      }
    />
  );
}
