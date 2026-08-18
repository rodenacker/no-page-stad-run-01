/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/app/(authenticated)/page.tsx
 * - Page Action: modify_existing
 *
 * Epic `role-aware-landing`, Story 1 — land on the screen your role uses
 * (R1-R7, R10, BR1, BR3, NFR1, NFR2). This file owns the three criteria this
 * layer can answer: AC-3, AC-4 and AC-5. AC-1, AC-2 and AC-6 are the browser's,
 * and live in this story's Playwright spec — deliberately not restated here.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE PINS (the developer's contract — read before implementing)
 * ---------------------------------------------------------------------------
 * `(authenticated)/page.tsx` stays a server component. It resolves the session it
 * already resolves with `requireSession()`, and then — BEFORE returning any
 * markup — decides where this visit belongs:
 *
 *   Approver and not Importer  →  redirect to `/requests`
 *   Importer and not Approver  →  redirect to `/upload`
 *   both recognised roles      →  return today's chooser markup, unchanged
 *   no recognised role         →  return today's chooser markup, unchanged
 *                                 (which is the "nothing has been made
 *                                 available to your account yet" message)
 *
 * The redirect is Next's server-side `redirect()` from `next/navigation`, issued
 * from the page body before any JSX is returned (BR3/NFR1) — not a client-side
 * render swap, not a `useRouter().replace()` in an effect. Every test below
 * invokes the page exactly as a navigation does and observes WHICH OF THE TWO
 * ANSWERS came back — markup, or a redirect that never returns — so an
 * implementation that renders the chooser first and swaps it afterwards fails
 * here as well as in the browser.
 *
 * The roles are read through the helpers that already exist — `hasRole` /
 * `rolesOf` (`lib/auth/roles.ts`) over `ROLE_IMPORTER` / `ROLE_APPROVER`
 * (`types/auth.ts`) — and the destinations through `UPLOAD_PATH` /
 * `REQUESTS_PATH` (`lib/auth/access-map.ts`): R6 forbids a second copy of role
 * matching. The two addresses are nonetheless stated LITERALLY below, from the
 * brief's own destination table, so this file would still notice a destination
 * quietly changing under it rather than agreeing with whatever the code says.
 *
 * NOTHING ELSE MOVES. `RoleEntryPoints`, `entryPointsFor()` and `ACCESS_MAP` are
 * reused untouched (BR2). The two single-role cases BYPASS the chooser; they do
 * not replace it, and no `allowedRoles` entry changes.
 *
 * Mocked here, and why:
 * - `@/lib/auth/requireSession` — server-only; it reads `next/headers` cookies,
 *   which cannot run in jsdom. Mocking the dependency keeps the page itself real,
 *   exactly as the `request-list-redesign` story-2 tests do, so the decision under
 *   test is genuinely the one inside the component.
 * - `next/navigation` — the framework boundary a server-side redirect is issued
 *   through. The stub throws the way the real `redirect()` does (it never returns
 *   to its caller), so a page that redirects produces no markup here either, and
 *   where it sent the visit is observable.
 * - `next/link` — stubbed with the plain anchor it renders in the browser, so the
 *   entry points keep their `link` role and `href` without an App Router context.
 * Never the code under test.
 *
 * Every identity comes from the project-wide fixtures in `@/mocks/data/identity`
 * — the same module the Playwright layer imports, so the two layers cannot drift
 * onto different role sets. No userinfo body is authored here.
 * `userInfoForRoles([])` throws by design ("signed in holding no roles at all" is
 * not a state this project models), which is why the no-recognised-role case goes
 * through `userInfoWithUnrecognisedRole()` — an account whose only role name this
 * project does not recognise.
 *
 * RED PHASE, stated honestly. AC-5 is red until the decision exists: today every
 * visit renders the chooser, so the first assertion in that test fails. AC-3 and
 * AC-4 describe the two cases this story deliberately LEAVES ALONE — they pass
 * against the page as it stands and must still pass once the redirect lands.
 * Guarding them is their whole job; making them fail would mean asserting
 * something the story does not ask for.
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the landing address itself, decision and all.
import SignedInHomePage from '@/app/(authenticated)/page';
import { requireSession } from '@/lib/auth/requireSession';
// Project-wide identities, shared with the Playwright layer.
import {
  userInfoFor,
  userInfoForRoles,
  userInfoWithUnrecognisedRole,
} from '@/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/mocks/data/role';

import type { RenderResult } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from 'react';
import type { UserInfoRead } from '@/types/auth';

/**
 * The signal a server-side `redirect()` raises: it never returns to its caller,
 * so a page that issues one produces no markup at all. Declared through
 * `vi.hoisted` so the module factory below can throw it.
 */
const { RedirectIssued } = vi.hoisted(() => {
  class RedirectIssued extends Error {
    readonly destination: string;

    constructor(destination: string) {
      super(`The landing address redirected to "${destination}".`);
      this.name = 'RedirectIssued';
      this.destination = destination;
    }
  }

  return { RedirectIssued };
});

vi.mock('next/navigation', () => ({
  redirect: (destination: string): never => {
    throw new RedirectIssued(destination);
  },
}));

vi.mock('@/lib/auth/requireSession', () => ({ requireSession: vi.fn() }));

/**
 * `next/link` is stubbed with the plain anchor it renders in the browser, so each
 * entry point keeps its `link` role and its `href` without needing an App Router
 * context in jsdom. This mocks a library, never the code under test.
 */
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockRequireSession = requireSession as unknown as ReturnType<
  typeof vi.fn
>;

/* -------------------------------------------------------------------------- */
/* The destinations, from the brief's own table                               */
/* -------------------------------------------------------------------------- */

/** Where an Approver-only visit belongs: today's expense request list. */
const EXPENSE_REQUESTS_ADDRESS = '/requests';

/** Where an Importer-only visit belongs: today's expense files screen. */
const EXPENSE_FILES_ADDRESS = '/upload';

/** Both addresses, as the chooser offers them when it is the right answer. */
const BOTH_ENTRY_POINT_ADDRESSES = [
  EXPENSE_FILES_ADDRESS,
  EXPENSE_REQUESTS_ADDRESS,
].sort();

/* -------------------------------------------------------------------------- */
/* Today's chooser wording, which this story must leave exactly as it is       */
/* -------------------------------------------------------------------------- */

/** The chooser's own heading. */
const CHOOSER_HEADING = 'What you can do';

/** What each entry point is called, in the words on screen. */
const EXPENSE_FILES_LABEL = 'Expense files';
const EXPENSE_REQUESTS_LABEL = 'Expense requests';

/** The two halves of the message an account granted nothing is shown. */
const NOTHING_AVAILABLE =
  /nothing has been made available to your account yet/i;
const ASK_THE_ACCOUNT_HOLDER =
  /ask the account holder for the access you need/i;

/* -------------------------------------------------------------------------- */
/* Visiting the landing address                                               */
/* -------------------------------------------------------------------------- */

/** What one navigation to `/` answered with: a destination, or markup. */
interface LandingVisit {
  /** Where the visit was sent, or `null` when markup answered it instead. */
  readonly destination: string | null;
  /** What the page returned, or `null` when the visit was redirected away. */
  readonly markup: ReactElement | null;
}

/**
 * One navigation to the landing address for the given identity: invoke the async
 * server component exactly as a request does, and report which of the two answers
 * came back. A redirect never returns markup, which is the point — a person sent
 * to their screen is never handed the chooser first (BR3/NFR1).
 */
const visitLandingAddress = async (
  session: UserInfoRead,
): Promise<LandingVisit> => {
  mockRequireSession.mockResolvedValue(session);

  try {
    return { destination: null, markup: await SignedInHomePage() };
  } catch (error) {
    if (error instanceof RedirectIssued) {
      return { destination: error.destination, markup: null };
    }
    throw error;
  }
};

/**
 * The same visit, rendered — for the two cases the chooser still answers. Fails
 * loudly, and by name, if the visit was redirected instead.
 */
const renderLandingAddress = async (
  session: UserInfoRead,
): Promise<RenderResult> => {
  const visit = await visitLandingAddress(session);

  if (visit.markup === null) {
    throw new Error(
      `The landing address sent this identity to "${visit.destination ?? ''}". ` +
        'An identity that does not hold exactly one recognised role must be ' +
        "answered with today's chooser page instead (brief R3, R4).",
    );
  }

  return render(visit.markup);
};

/**
 * Every address the rendered screen offers, including any an implementation tried
 * to keep on screen while hiding it — so "offered nothing" cannot be satisfied by
 * a greyed-out or `aria-hidden` entry (R10, hidden and never disabled).
 */
const offeredAddresses = (): string[] =>
  screen
    .queryAllByRole('link', { hidden: true })
    .map((link) => link.getAttribute('href') ?? '')
    .sort();

/** The one entry point going to an address, with a plain failure when it is not. */
const entryPointTo = (address: string): HTMLElement => {
  const matching = screen
    .queryAllByRole('link', { hidden: true })
    .filter((link) => link.getAttribute('href') === address);

  if (matching.length !== 1) {
    throw new Error(
      `Expected exactly one entry point going to "${address}", found ` +
        `${String(matching.length)}. The chooser offers one link per screen the ` +
        'roles on this visit allow.',
    );
  }

  return matching[0];
};

describe('Epic role-aware-landing, Story 1: the landing address decides where a visit belongs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-3
  it("answers a person holding both roles with today's chooser, both entry points, wording unchanged", async () => {
    await renderLandingAddress(
      userInfoForRoles([ROLE_IMPORTER, ROLE_APPROVER]),
    );

    expect(
      screen.getByRole('heading', { name: CHOOSER_HEADING }),
    ).toBeInTheDocument();

    // Both screens are offered, and only those two — the person picks for
    // themselves, exactly as they do today.
    expect(offeredAddresses()).toEqual(BOTH_ENTRY_POINT_ADDRESSES);

    expect(
      within(entryPointTo(EXPENSE_FILES_ADDRESS)).getByText(
        EXPENSE_FILES_LABEL,
      ),
    ).toBeInTheDocument();
    expect(
      within(entryPointTo(EXPENSE_REQUESTS_ADDRESS)).getByText(
        EXPENSE_REQUESTS_LABEL,
      ),
    ).toBeInTheDocument();

    // ...and none of the other case's wording has leaked into this one.
    expect(screen.queryByText(NOTHING_AVAILABLE)).not.toBeInTheDocument();
  });

  // AC-4
  it("answers a person holding no recognised role with today's message and no entry point at all", async () => {
    await renderLandingAddress(userInfoWithUnrecognisedRole());

    expect(
      screen.getByRole('heading', { name: CHOOSER_HEADING }),
    ).toBeInTheDocument();

    // The same two sentences as today: what is available, and what to do about it.
    expect(screen.getByText(NOTHING_AVAILABLE)).toBeInTheDocument();
    expect(screen.getByText(ASK_THE_ACCOUNT_HOLDER)).toBeInTheDocument();

    // Nothing is offered — not a screen, not a disabled stand-in for one.
    expect(offeredAddresses()).toEqual([]);
  });

  // AC-5
  it('decides afresh on every visit, from the roles on that visit — never from where a previous visit went', async () => {
    // Visit 1 — the identity resolved for this visit holds Approver alone.
    const asApproverFirst = await visitLandingAddress(
      userInfoFor(ROLE_APPROVER),
    );

    expect(asApproverFirst.destination).toBe(EXPENSE_REQUESTS_ADDRESS);

    // Visit 2 — the roles have changed since that visit: Importer alone now. It
    // goes where THESE roles say, not where the last visit was sent.
    const asImporterNext = await visitLandingAddress(
      userInfoFor(ROLE_IMPORTER),
    );

    expect(asImporterNext.destination).toBe(EXPENSE_FILES_ADDRESS);

    // Visit 3 — both roles now. A destination remembered from either visit above
    // would send this one to a screen; the roles on this visit say show the
    // chooser, so the chooser is what answers.
    const asBothRoles = await renderLandingAddress(
      userInfoForRoles([ROLE_IMPORTER, ROLE_APPROVER]),
    );

    expect(
      screen.getByRole('heading', { name: CHOOSER_HEADING }),
    ).toBeInTheDocument();
    expect(offeredAddresses()).toEqual(BOTH_ENTRY_POINT_ADDRESSES);

    asBothRoles.unmount();

    // Visit 4 — a single role again, after a visit that rendered. Still decided
    // from this visit's roles, not remembered as "this person gets the chooser".
    const asApproverAgain = await visitLandingAddress(
      userInfoFor(ROLE_APPROVER),
    );

    expect(asApproverAgain.destination).toBe(EXPENSE_REQUESTS_ADDRESS);
  });
});
