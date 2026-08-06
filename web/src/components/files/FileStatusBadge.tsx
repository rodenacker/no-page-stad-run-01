/**
 * A submitted file's `CurrentStatus`, as a chip: the status TEXT beside an intent
 * colour and an icon, never colour alone (source UI-21, brief §Feature NFRs, WCAG 2.2
 * AA).
 *
 * This is the FILE vocabulary only — what each of the five recognised file statuses
 * MEANS. The intents themselves, their tokens, and the neutral/iconless treatment of a
 * value this app has never heard of all belong to the shared
 * `components/status/StatusBadge`, which every list and screen in the project shares.
 *
 * It lives in its own module because more than one screen shows a file's status — the
 * submitted files list and a file's own page — and there must be exactly ONE file-status
 * map in the project. A second copy is how two screens end up disagreeing about what
 * `Validation failed` looks like.
 */
import {
  CircleCheck,
  CircleSlash,
  FileUp,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';

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
 * something the user acts on, and a cancelled file is inert. The colours those intents
 * wear belong to the shared badge, not here.
 */
const STATUS_PRESENTATION: Record<FileStatus, StatusPresentation> = {
  [FILE_STATUS_UPLOADED]: { intent: 'informational', icon: FileUp },
  [FILE_STATUS_VALIDATING]: { intent: 'informational', icon: LoaderCircle },
  [FILE_STATUS_VALIDATION_FAILED]: { intent: 'attention', icon: TriangleAlert },
  [FILE_STATUS_IMPORTED]: { intent: 'positive', icon: CircleCheck },
  [FILE_STATUS_CANCELLED]: { intent: 'neutral', icon: CircleSlash },
};

/**
 * The status as the service sent it. A status this app has no name for is left without
 * a presentation, so the shared badge shows it neutral and iconless — with the
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
