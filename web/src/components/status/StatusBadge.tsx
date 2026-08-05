/**
 * The one way this app shows a status: a badge carrying the status TEXT beside an
 * intent colour and an icon — never colour alone (source UI-21, brief R14, WCAG 2.2
 * AA).
 *
 * Two things live here so no screen has to decide them again:
 *
 * - **The intents and their tokens.** Every colour is a token from `globals.css` with
 *   a value in both themes (styling-centralisation.md), so a status reads in light and
 *   dark with no per-screen work. Callers name an INTENT, not a colour.
 * - **What an unrecognised status looks like.** A value this app has no name for is
 *   shown neutral, with no icon claiming to know what it means, and above all with the
 *   service's own words. Every vocabulary on the wire belongs to the backend.
 *
 * A caller maps its own status vocabulary to a {@link StatusPresentation} — a
 * `Record<KnownStatus, StatusPresentation>` plus its own known-value guard — and hands
 * the raw status string here. The file list and the expense request list both do.
 *
 * It also carries marks that are not statuses but are read the same way — a short phrase
 * paired with an intent colour, never colour alone (see
 * `components/requests/PossibleDuplicateMark`). Anything of that shape belongs here
 * rather than in a badge of its own.
 */
import { Badge } from '@/components/ui/badge';

import type { LucideIcon } from 'lucide-react';

/**
 * What a status MEANS, in the four-plus-one vocabulary this project settled at
 * project level (project.md §Semantic status colors):
 *
 * - `informational` — under way, or simply where something stands
 * - `positive` — finished well
 * - `attention` — needs the user to do something
 * - `negative` — refused or rejected
 * - `neutral` — inert, cancelled, or a value this app does not recognise
 */
const STATUS_INTENTS = [
  'informational',
  'positive',
  'attention',
  'negative',
  'neutral',
] as const;

export type StatusIntent = (typeof STATUS_INTENTS)[number];

/**
 * The surface and paired foreground for each intent. Both themes are covered in
 * `globals.css`, so these are token names only — no colour value appears here.
 */
const INTENT_TONE: Record<StatusIntent, string> = {
  informational: 'bg-info text-info-foreground',
  positive: 'bg-success text-success-foreground',
  attention: 'bg-warning text-warning-foreground',
  negative: 'bg-destructive text-destructive-foreground',
  neutral: 'bg-muted text-muted-foreground border-border',
};

/** How one recognised status is shown: what it means, and the icon that says so. */
export interface StatusPresentation {
  intent: StatusIntent;
  icon: LucideIcon;
}

/**
 * The status as the service sent it, carried by a colour AND readable as text.
 *
 * `presentation` is omitted for a status this app does not recognise: the badge then
 * reads neutral and carries no icon, and the unfamiliar value still reaches the user.
 */
export function StatusBadge({
  status,
  presentation,
}: {
  status: string;
  presentation?: StatusPresentation;
}) {
  const StatusIcon = presentation?.icon;

  return (
    <Badge className={INTENT_TONE[presentation?.intent ?? 'neutral']}>
      {StatusIcon ? <StatusIcon aria-hidden="true" /> : null}
      {status}
    </Badge>
  );
}
