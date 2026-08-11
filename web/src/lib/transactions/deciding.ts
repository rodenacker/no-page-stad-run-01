/**
 * Deciding one expense payment request, as the user meets it: when the two decisions
 * are offered at all, and every word the screen says about them.
 *
 * Stated once here because THREE surfaces have to agree on it — the per-request
 * overflow (`RequestActions`), the opened request (`RequestDetailPanel`) and the list
 * that holds the confirmation and the notification (`ExpenseRequestList`). A label
 * spelled out in each of them would let the control that asks, the control that
 * confirms and the message that reports drift apart from one another.
 *
 * The transport — which call is made, and who it is attributed to — is
 * `lib/api/decisions.ts`; nothing here sends anything.
 */
import { DECISION_APPROVE, DECISION_REJECT } from '@/lib/api/decisions';
import { TRANSACTION_STATUS_IMPORTED } from '@/types/transactions';

import type { DecisionOutcome } from '@/lib/api/decisions';
import type { TransactionRead } from '@/types/transactions';

/**
 * The two decisions, in the order they are offered. Approve first: it is the common
 * one, and the list's own reading order should not put the refusal in front of it.
 */
export const DECIDE_OUTCOMES: readonly DecisionOutcome[] = [
  DECISION_APPROVE,
  DECISION_REJECT,
];

/**
 * Whether this request can still be decided (brief R6/BR3): only while it is
 * `Imported`. Every surface asks this rather than comparing statuses itself, so no
 * screen can start offering a decision on a request somebody has already decided.
 *
 * There is deliberately no other condition — no amount threshold (R8/BR5) and no
 * ownership check (R5/BR2, and `TransactionRead` carries no subject field to check).
 */
export const awaitsDecision = (request: TransactionRead): boolean =>
  request.Status === TRANSACTION_STATUS_IMPORTED;

/** What each decision is called where it is offered. */
const ACTION_VERB: Record<DecisionOutcome, string> = {
  [DECISION_APPROVE]: 'Approve',
  [DECISION_REJECT]: 'Reject',
};

/** How a recorded decision reads once it is done. */
const RECORDED_AS: Record<DecisionOutcome, string> = {
  [DECISION_APPROVE]: 'approved',
  [DECISION_REJECT]: 'rejected',
};

/** The control's visible wording; the row or panel around it says which request. */
export const decideActionLabel = (outcome: DecisionOutcome): string =>
  ACTION_VERB[outcome];

/**
 * The control's accessible name. Every per-request control on this screen names the
 * request it acts on — several rows carry the same two actions, so "Approve" on its
 * own would leave a screen-reader user with a list of identical controls.
 */
export const decideActionName = (
  outcome: DecisionOutcome,
  reference: string,
): string => `${ACTION_VERB[outcome]} request ${reference}`;

/** The confirmation names the request it is about — nothing vague like "this request". */
export const confirmationTitleFor = (
  outcome: DecisionOutcome,
  reference: string,
): string => `${ACTION_VERB[outcome]} request ${reference}?`;

/**
 * What accepting the confirmation does. It never prints an account number: naming a
 * request must not defeat the masking the list applies (project.md §Compliance).
 */
export const confirmationMessageFor = (outcome: DecisionOutcome): string =>
  `This records your ${outcome === DECISION_APPROVE ? 'approval' : 'rejection'} ` +
  'against your name. A request can carry only one decision, so this cannot be ' +
  'undone.';

/**
 * The confirming choice inside the dialog — deliberately not the same phrase as the
 * control that asked ("Approve") or the way out ("Cancel").
 */
export const confirmDecisionLabel = (outcome: DecisionOutcome): string =>
  `${ACTION_VERB[outcome]} request`;

/** The way out of the confirmation, which holds focus when it opens (NFR2). */
export const WAY_OUT_OF_CONFIRMATION = 'Cancel';

/* -------------------------------------------------------------------------- */
/* The note step — asked for BEFORE the confirmation, only on a rejection      */
/* -------------------------------------------------------------------------- */

/**
 * The note step names the request it is about, as everything else on this screen
 * does, and asks the question the note answers rather than restating the action.
 * Deliberately NOT worded like {@link confirmationTitleFor}: the two steps follow one
 * another, and a reader must be able to tell which one they are looking at.
 */
export const noteStepTitleFor = (reference: string): string =>
  `Why is request ${reference} being rejected?`;

/** What the note is for, and what becomes of it (R2/R16). */
export const NOTE_STEP_DESCRIPTION =
  'The reason is recorded with the request and shown with it afterwards. Nothing ' +
  'is recorded until you confirm on the next step.';

/** The field's own label — the note is a required one, so it carries the marker. */
export const REJECTION_NOTE_LABEL = 'Rejection note';

/** Said under the field, in the Approver's terms rather than the wire's. */
export const REJECTION_NOTE_HINT =
  'Say what is wrong with this request, in your own words.';

/**
 * The control that sends the note on. Its visible wording is "Continue" — this step
 * does not reject anything, the confirmation after it does — while its accessible
 * name says which request is being continued with, as every per-request control on
 * this screen does.
 *
 * The three phrases of a rejection are therefore all different: "Reject" asks,
 * "Continue" moves on, "Reject request" does it, and "Cancel" backs out.
 */
export const CONTINUE_FROM_NOTE_LABEL = 'Continue';

export const continueFromNoteName = (reference: string): string =>
  `${CONTINUE_FROM_NOTE_LABEL} to reject request ${reference}`;

/** The way out of the note step. Escape does the same thing. */
export const WAY_OUT_OF_NOTE_STEP = 'Cancel';

/** Announced while the decision is on its way, since nothing has changed yet. */
export const decisionInFlightMessage = (
  outcome: DecisionOutcome,
  reference: string,
): string =>
  `Recording your ${outcome === DECISION_APPROVE ? 'approval' : 'rejection'} of ` +
  `request ${reference}…`;

/** How the transient confirmation of a recorded decision reads (R11/R15). */
export const decisionRecordedTitle = (outcome: DecisionOutcome): string =>
  `Request ${RECORDED_AS[outcome]}`;

export const decisionRecordedMessage = (
  outcome: DecisionOutcome,
  reference: string,
): string => `Request ${reference} has been ${RECORDED_AS[outcome]}.`;

/**
 * Heads a decision the service would not record. The reason itself is the service's
 * own wording (`decisionFailureMessage`), and the message stays until the user
 * dismisses it — it is something they have to act on (R11).
 */
export const DECISION_REFUSED_TITLE = 'Could not record this decision';
