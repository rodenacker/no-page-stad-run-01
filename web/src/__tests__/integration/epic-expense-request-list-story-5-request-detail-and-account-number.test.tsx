/**
 * Story Metadata:
 * - Epic: expense-request-list — Story 5: open one request, with its account
 *   number protected
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — opening a request shows every value the service holds for it,
 *   including its currency, its rejection note when one exists, and who last
 *   changed it and when;
 * - AC-2 — the NEGATIVE criterion protecting BR1/R5: nothing in the list, and
 *   nothing in an opened request, offers any way to change an imported value;
 * - AC-3 — an opened request's account number is masked to its last four digits
 *   until a clearly-named reveal control is used, which reveals it for that ONE
 *   request only.
 *
 * AC-4 (masking survives searching, filtering, sorting and paging, and a reveal
 * never crosses to another request or page), AC-5 (icon-only controls name
 * themselves on hover and on keyboard focus) and AC-6 (the phone-width card
 * presentation with no sideways scrolling) are the Playwright spec's —
 * deliberately not duplicated here (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. The list component is the one story 1 established — a CLIENT component at
 *    `web/src/components/requests/ExpenseRequestList.tsx`, named export
 *    `ExpenseRequestList`, with NO required props, reading the full set in the
 *    browser through `get` from `@/lib/api/client` (never `fetch()` —
 *    CLAUDE.md §2). If story 1 named that file or export differently, rename the
 *    import below to match it rather than adding a second list component.
 *    `web/src/app/(authenticated)/requests/page.tsx` keeps its existing
 *    `requireSession()` / `canAccess()` server-side check exactly as it is — do
 *    NOT add a second gate, and do not move the fetch to the server (the
 *    Playwright specs intercept the BROWSER boundary).
 * 2. The detail is a PANEL/DIALOG OVER THE LIST — one request open at a time
 *    (the design choice the user made at the stories approval; an expandable row
 *    was rejected). It exposes `role="dialog"` (a Shadcn `dialog` or `sheet`,
 *    both of which do), and its accessible name NAMES the open request by its
 *    `Reference`, so the user can tell which request they are looking at.
 *    Dismissing it with Escape closes it — nothing else about the list changes.
 * 3. Every table row carries a control whose accessible name begins with "Open"
 *    and identifies the request, e.g. `Open request TXN-20260415-0001` (an
 *    icon-only control is fine — R15 requires the name either way). It is what
 *    opens the panel for that row's request.
 * 4. The panel shows the fields the table does not carry — `Currency`,
 *    `UserNote` (only when the request has one), `LastChangedUser`,
 *    `LastChangedDate` — alongside the request's identity, status, originating
 *    file, date and description. **Every value is printed as the service sent
 *    it**: nothing here reformats a date, re-cases a status or invents a
 *    fallback (this epic compares `TransactionDate` "as the service writes it"
 *    and its §Notes & Caveats say not to normalise on speculation). `Amount`
 *    presentation is story 1's table contract and is deliberately not re-pinned
 *    here.
 * 5. MASKING IS A POPIA COMPLIANCE REQUIREMENT (project.md §Compliance), not a
 *    formatting nicety. In the panel the account number shows its last four
 *    digits only, until a control named for what it does AND what it acts on
 *    (e.g. "Reveal account number") is activated. Then, and only then, the full
 *    value appears — for that one open request. There is NO reveal-all control
 *    anywhere. Reuse story 1's masking helper; do not write a second one.
 * 6. THE REVEAL IS LOCAL, PER-OPEN-PANEL STATE. Closing the panel forgets it:
 *    opening another request shows a masked number, and re-opening the SAME
 *    request shows it masked again. It must not live in a store, context, URL or
 *    ref that outlives the open panel — that is what makes AC-4's "not revealed
 *    on any other request or after moving to another page" true by construction.
 * 7. Read-only means read-only (BR1/R5): no editable field, no edit action, and
 *    no decide action — approving/rejecting is the NEXT epic (`expense-decisions`)
 *    and must not be pre-empted here, **not even as a disabled control**. The
 *    assertions below find disabled controls too, so a greyed-out "Approve"
 *    fails AC-2 exactly as a working one would.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy). The request bodies come from the
 * project-wide factory in `@/mocks/data/transaction`, shared with the Playwright
 * layer, so the two layers cannot drift onto different response shapes; its
 * `AccountNumber` values are FULL, unmasked numbers, because a test can only
 * prove masking happens if the mock hands the component something to mask.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): the list
 * component, the detail panel and the reveal control do not exist yet.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — these imports fail until implemented (TDD red).
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// Real production toast composition (not mocked) — the same one the root layout
// wraps every signed-in screen in, and the surface story 6's duplicate
// notification uses. Rendering the list inside it here keeps this file valid
// once that story lands.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';

// Project-wide Transaction factory: the single source of truth for the wire
// shape and its canonical values, shared with the Playwright layer. Never
// hand-write a response body in a test.
import {
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
  createTransaction,
  transactionListResponse,
  transactionWithStatus,
  transactionsForNarrowing,
} from '@/mocks/data/transaction';

import type { TransactionRead } from '@/mocks/data/transaction';

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;

type User = ReturnType<typeof userEvent.setup>;

/**
 * The whole screen, for the negative assertions that must hold everywhere — the
 * body rather than the render container, so the portalled detail panel and any
 * portalled menu are inside the scan too.
 */
const WHOLE_SCREEN = (): HTMLElement => document.body;

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = () =>
  render(
    <ToastProvider>
      <ExpenseRequestList />
      <ToastContainer />
    </ToastProvider>,
  );

/**
 * The table row for a named request, found by the reference the row carries
 * rather than by position — and required to be unique, so a widened match can
 * never quietly select the wrong request (testing-policy.md § anti-pattern 7).
 */
const rowFor = (reference: string): HTMLElement => {
  const rows = within(screen.getByRole('table'))
    .getAllByRole('row')
    .filter((row) => row.textContent?.includes(reference));

  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one table row carrying "${reference}", found ` +
        `${String(rows.length)} — the list must render one row per request, ` +
        `each identified by its Reference (see the implementation contract).`,
    );
  }
  return rows[0];
};

/** The control on a request's row that opens its detail panel. */
const openControlFor = (reference: string): HTMLElement =>
  within(rowFor(reference)).getByRole('button', { name: /^open/i });

/** Opens one request's panel and hands back the panel itself. */
const openRequest = async (
  user: User,
  reference: string,
): Promise<HTMLElement> => {
  const control = await waitFor(() => openControlFor(reference));
  await user.click(control);
  return await screen.findByRole('dialog');
};

/** Dismisses the open panel the way a keyboard user does. */
const closeOpenRequest = async (user: User): Promise<void> => {
  await user.keyboard('{Escape}');
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
};

/** Roles a user can type in, pick from, or toggle — i.e. change a value with. */
const EDITABLE_FIELD_ROLES = [
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'spinbutton',
  'checkbox',
  'radio',
  'switch',
  'slider',
] as const;

/** Roles a user can activate — where an "Edit" or "Approve" would show up. */
const CONTROL_ROLES = [
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
] as const;

/**
 * Names that would mean an imported request can be changed, or decided on. Used
 * for the whole screen, so it deliberately excludes words the NARROWING
 * controls legitimately use ("clear", "remove filter") — and the `\b` bounds
 * keep the STATUS VALUES "Approved" / "Rejected" out of it, since those are
 * text a request carries, not something a control offers to do.
 */
const CHANGES_A_REQUEST =
  /\b(edit|amend|modify|overwrite|approve|reject|decline|decide|save)\b/i;

/**
 * The same idea inside the panel, where only one request's own values live — so
 * anything change-shaped at all is illegitimate there, destructive words
 * included.
 */
const CHANGES_ANYTHING =
  /\b(edit|amend|modify|overwrite|update|change|correct|approve|reject|decline|decide|save|submit|delete|remove|discard)\b/i;

/** Anything a user could type in, pick from or toggle within `surface`. */
const editableFieldsIn = (surface: HTMLElement): HTMLElement[] =>
  EDITABLE_FIELD_ROLES.flatMap((role) => within(surface).queryAllByRole(role));

/** Every activatable control in `surface` whose accessible name matches. */
const controlsNamed = (surface: HTMLElement, name: RegExp): HTMLElement[] =>
  CONTROL_ROLES.flatMap((role) =>
    within(surface).queryAllByRole(role, { name }),
  );

/**
 * Buttons that submit a form. Role queries cannot express "submit", and a
 * read-only panel has nothing to submit, so this is checked directly.
 */
const submitButtonsIn = (surface: HTMLElement): HTMLElement[] =>
  within(surface)
    .queryAllByRole('button')
    .filter(
      (control) =>
        control instanceof HTMLButtonElement && control.type === 'submit',
    );

/** What a failed negative assertion should print: the offending control, named. */
const described = (element: HTMLElement): string =>
  `<${element.tagName.toLowerCase()}> "${(element.textContent ?? '').trim()}"`;

/** The last four digits of an account number, ignoring any grouping characters. */
const lastFourDigitsOf = (accountNumber: string): string =>
  accountNumber.replace(/\D/g, '').slice(-4);

describe('Epic expense-request-list, Story 5: open one request, with its account number protected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-1
  it('shows every value the service holds for the request that was opened — its currency, its rejection note when it has one, and who last changed it and when', async () => {
    const user = userEvent.setup();

    const rejected = transactionWithStatus(TRANSACTION_STATUS_REJECTED);
    // Fixture precondition: a rejected request is the one that carries a note,
    // so the assertions below really do exercise "when one exists".
    const rejectionNote = rejected.UserNote;
    if (rejectionNote === undefined) {
      throw new Error(
        'Fixture precondition failed: a rejected request must carry a UserNote ' +
          '(see @/mocks/data/transaction).',
      );
    }

    // A second request in another currency, decided by nobody, with no note —
    // so each value below is proved to come from the request that was opened.
    const imported = transactionWithStatus(TRANSACTION_STATUS_IMPORTED, {
      Id: 7002,
      Reference: 'TXN-20260415-0002',
      AccountNumber: '4412-9008-2245',
      Description: 'Woolworths Sandton',
      Amount: 487.32,
      TransactionDate: '2026-04-15 08:34:00',
      Currency: 'USD',
    });

    mockGet.mockResolvedValue(transactionListResponse([rejected, imported]));

    renderList();

    const detail = await openRequest(user, rejected.Reference);

    // The panel says WHICH request is open.
    expect(detail).toHaveAccessibleName(new RegExp(rejected.Reference));

    // Everything the service holds for it, each value exactly as it arrived —
    // including the three the table does not carry. (That none of it is
    // EDITABLE is AC-2's assertion, below.)
    const valuesTheServiceHolds: string[] = [
      rejected.Reference,
      rejected.FileName,
      rejected.TransactionDate,
      rejected.Description,
      rejected.Status,
      rejected.Currency,
      rejectionNote,
      rejected.LastChangedUser,
      rejected.LastChangedDate,
    ];
    valuesTheServiceHolds.forEach((value) => {
      expect(detail).toHaveTextContent(value);
    });

    // A request with no rejection note is not given one, and its own currency
    // and last-changed values are the ones shown.
    await closeOpenRequest(user);
    const importedDetail = await openRequest(user, imported.Reference);

    expect(importedDetail).toHaveAccessibleName(new RegExp(imported.Reference));
    expect(importedDetail).toHaveTextContent(imported.Currency);
    expect(importedDetail).toHaveTextContent(imported.LastChangedUser);
    expect(importedDetail).toHaveTextContent(imported.LastChangedDate);
    expect(importedDetail).not.toHaveTextContent(rejectionNote);
  });

  // AC-2
  it('offers no way to change an imported value — no editable field, no edit action and no decide action, in the list or in an opened request', async () => {
    const user = userEvent.setup();

    // The realistic spread: three statuses (rejected and approved included),
    // three originating files, both type codes and one the app cannot
    // translate — i.e. every kind of row that might tempt an edit control.
    const requests: TransactionRead[] = transactionsForNarrowing();
    const rejected = requests.find(
      (request) => request.Status === TRANSACTION_STATUS_REJECTED,
    );
    if (rejected === undefined) {
      throw new Error(
        'Fixture precondition failed: the narrowing spread must include a ' +
          'rejected request (see @/mocks/data/transaction).',
      );
    }

    mockGet.mockResolvedValue(transactionListResponse(requests));

    renderList();

    // Wait for the rows themselves, not for the open control, so the list-level
    // negatives below are reached whether or not the panel exists yet.
    await waitFor(() => rowFor(rejected.Reference));
    const table = screen.getByRole('table');

    // Every imported value in the list is TEXT the user reads, never a field
    // they can type in, pick from or toggle.
    expect(editableFieldsIn(table).map(described)).toEqual([]);

    // Nor does any row offer to throw a request away.
    expect(
      controlsNamed(table, /\b(delete|remove|discard)\b/i).map(described),
    ).toEqual([]);

    // Nowhere on the screen — rows, toolbar or anywhere else — is there a
    // control that would change an imported request or decide on one. Disabled
    // controls are found by this query too: deciding belongs to the next epic
    // and must not be pre-empted, not even greyed out.
    expect(
      controlsNamed(WHOLE_SCREEN(), CHANGES_A_REQUEST).map(described),
    ).toEqual([]);

    // ...and the same holds inside an opened request, which is the one place a
    // per-request "Approve" or an editable field would look natural.
    const detail = await openRequest(user, rejected.Reference);

    expect(editableFieldsIn(detail).map(described)).toEqual([]);
    expect(controlsNamed(detail, CHANGES_ANYTHING).map(described)).toEqual([]);
    expect(submitButtonsIn(detail).map(described)).toEqual([]);
    // Nothing to submit means nothing to submit: no form, and nothing the user
    // can type over in place.
    expect(detail.querySelector('form')).toBeNull();
    expect(detail.querySelector('[contenteditable="true"]')).toBeNull();
  });

  // AC-3
  it('masks an opened request’s account number to its last four digits until the named reveal control is used, and reveals the full number for that one request only', async () => {
    const user = userEvent.setup();

    const first = createTransaction();
    const second = createTransaction({
      Id: 7002,
      Reference: 'TXN-20260415-0002',
      AccountNumber: '4412-9008-2245',
      Description: 'Woolworths Sandton',
      Amount: 487.32,
      TransactionDate: '2026-04-15 08:34:00',
    });

    mockGet.mockResolvedValue(transactionListResponse([first, second]));

    renderList();

    // --- opened, and masked until asked otherwise (POPIA) -------------------
    const firstDetail = await openRequest(user, first.Reference);

    expect(firstDetail).toHaveTextContent(
      lastFourDigitsOf(first.AccountNumber),
    );
    expect(firstDetail).not.toHaveTextContent(first.AccountNumber);

    // The reveal control says what it acts on AND what it does (R15) — a bare
    // icon with no name, or a name that does not mention the account number,
    // fails here.
    const reveal = within(firstDetail).getByRole('button', {
      name: /account number/i,
    });
    expect(reveal).toHaveAccessibleName(/reveal|show/i);

    // One request at a time: a "reveal all" control is forbidden outright.
    expect(
      screen.queryAllByRole('button', {
        name: /(reveal|show|unmask) (all|every)/i,
      }),
    ).toEqual([]);

    await user.click(reveal);

    expect(screen.getByRole('dialog')).toHaveTextContent(first.AccountNumber);

    // --- closing it takes the full number off the screen entirely ----------
    await closeOpenRequest(user);
    expect(document.body).not.toHaveTextContent(first.AccountNumber);

    // --- another request is masked, and carries no trace of the first -------
    const secondDetail = await openRequest(user, second.Reference);

    expect(secondDetail).toHaveTextContent(
      lastFourDigitsOf(second.AccountNumber),
    );
    expect(secondDetail).not.toHaveTextContent(second.AccountNumber);
    expect(secondDetail).not.toHaveTextContent(first.AccountNumber);

    // --- and re-opening the first one starts masked again: the reveal is
    // per-open-panel state, and does not outlive the panel it was made in.
    await closeOpenRequest(user);
    const reopenedFirstDetail = await openRequest(user, first.Reference);

    expect(reopenedFirstDetail).not.toHaveTextContent(first.AccountNumber);
    expect(reopenedFirstDetail).toHaveTextContent(
      lastFourDigitsOf(first.AccountNumber),
    );
  });
});
