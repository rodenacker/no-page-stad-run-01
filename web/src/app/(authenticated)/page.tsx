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
    redirect(destination);
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
