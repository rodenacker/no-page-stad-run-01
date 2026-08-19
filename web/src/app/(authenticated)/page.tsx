/**
 * The app's front door for a signed-in user — and the whole app's front door, since
 * it sits at `/` inside the gated route group. This REPLACES the starter template's
 * welcome page: a signed-out visitor typing the app's address is redirected to the
 * sign-in screen by the layout's gate instead of being greeted by a page that has
 * nothing to do with this project (CLAUDE.md §6, AC-3).
 *
 * WHERE A VISIT BELONGS is decided here, from the roles on the session resolved for
 * THIS navigation (epic `role-aware-landing` BR1) — never from where an earlier
 * visit went:
 *
 *   Approver and not Importer  →  the expense request list
 *   Importer and not Approver  →  the expense files screen
 *   both recognised roles      →  the chooser below, so they pick for themselves
 *   no recognised role         →  the chooser below, which is the "nothing has been
 *                                 made available to your account yet" message
 *
 * A person who only ever uses one of the two screens was being made to choose it
 * every time, so for them the choosing is done here instead. The redirect is Next's
 * SERVER-side `redirect()`, issued before any markup is returned (BR3/NFR1): the
 * chooser is never sent to the browser at all, so there is nothing that could flash
 * up first, and the browser's history behaves as a normal navigation rather than a
 * client-pushed state change.
 *
 * The decision reads the two role names through the same helpers every other
 * permission decision uses (`hasRole` over `ROLE_IMPORTER` / `ROLE_APPROVER`) and
 * takes its destinations from the route access map, so it cannot drift from the map
 * (R6). It is deliberately ONE-DIRECTIONAL — nothing on either destination sends the
 * person back here (BR4) — and it changes no `allowedRoles`: both screens stay open
 * to both roles, and a directly-typed address for either one is unaffected (BR2/R8).
 *
 * BEING SENT ON MUST NOT COST A BACK PRESS (R9). This address is on the way to
 * somewhere, never a place anyone stays, so it must not keep a history entry of its
 * own — hence the explicit REPLACE below. Two journeys depend on it: pressing Back
 * after arriving, and the app's own name in the header, which points here from every
 * screen (`components/layout/AppHeader.tsx`) and so brings a single-role person
 * straight through to their own screen. Leave a landing entry behind and both turn
 * into a trap: Back returns here, the decision runs again, and the person is thrown
 * forward onto the screen they were trying to leave, with whatever they visited
 * before it now unreachable.
 *
 * The decision also sits BEHIND the session gate, never in front of it (R7): the
 * layout has already resolved the session by the time this runs, so a signed-out
 * visitor is answered by the gate and no destination is worked out for them.
 *
 * What the chooser offers is decided by the roles on that same session, and the
 * signed-in person's own name and role are shown once, by the shell's header.
 *
 * `requireSession()` is called again here even though the layout already gated this
 * request: a layout cannot hand props to the page beneath it. It resolves to the
 * same identity without a second call to the auth service — see the note in
 * `lib/auth/requireSession.ts` — which is what makes this decision free of any extra
 * auth traffic (NFR2).
 */
import { redirect } from 'next/navigation';

import { RoleEntryPoints } from '@/components/dashboard/RoleEntryPoints';
import { REQUESTS_PATH, UPLOAD_PATH } from '@/lib/auth/access-map';
import { requireSession } from '@/lib/auth/requireSession';
import { hasRole } from '@/lib/auth/roles';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';

import type { Metadata } from 'next';
import type { RoleBearer } from '@/lib/auth/roles';

export const metadata: Metadata = {
  title: 'Employee Expenses',
  description:
    'Import batches of employee expense payment requests and review the requests waiting for a decision.',
};

/**
 * The screen this identity's roles say it belongs on, or `undefined` when the person
 * should be asked instead — which is both the identity holding BOTH recognised roles
 * (there is a genuine choice to make) and the identity holding neither (there is
 * nothing to send them to, and the chooser is what says so).
 *
 * Each role is asked for by name rather than counted, so an auth service that
 * returned a role twice, or returned a role this project does not recognise
 * alongside a real one, still resolves to the same answer.
 */
const destinationFor = (session: RoleBearer): string | undefined => {
  const holdsImporter = hasRole(session, ROLE_IMPORTER);
  const holdsApprover = hasRole(session, ROLE_APPROVER);

  if (holdsApprover && !holdsImporter) {
    return REQUESTS_PATH;
  }

  if (holdsImporter && !holdsApprover) {
    return UPLOAD_PATH;
  }

  return undefined;
};

export default async function SignedInHomePage() {
  const session = await requireSession();
  const destination = destinationFor(session);

  if (destination !== undefined) {
    // Never returns — the chooser below is not rendered, and no markup is produced
    // for this navigation at all.
    //
    // 'replace' is stated rather than left to the default, because the default is
    // not one value: `redirect()` replaces when a page resolves it and PUSHES when a
    // server action does. Pushing is the trap R9/BR4 forbid — a landing entry left in
    // history would re-fire the moment someone pressed Back — so this says which one
    // it is rather than inheriting it. (Written as the literal the parameter's own
    // type is made of, not as `RedirectType.replace`: the value is the same, and this
    // way the only thing this page needs from `next/navigation` remains `redirect`
    // itself.)
    //
    // It is NOT, on its own, what makes R9/BR4 hold, so do not read it as the whole
    // guarantee: this type is carried into browser history only for a redirect a
    // SERVER ACTION resolved. On a document load the browser gets a real 3xx, which
    // never leaves an entry for `/` behind; on a client-side navigation (the header's
    // app name) the router follows this redirect while fetching and the destination
    // simply becomes the canonical address of the navigation already in flight, so
    // `/` takes no entry of its own there either. What actually holds the guarantee
    // is this epic's story-2 E2E spec, which walks Back and the app's name in a real
    // browser — keep it passing.
    redirect(destination, 'replace');
  }

  return (
    <div className="grid gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Employee expenses
      </h1>
      <RoleEntryPoints user={session} />
    </div>
  );
}
