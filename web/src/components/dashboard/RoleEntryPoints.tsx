/**
 * What the signed-in landing screen offers this person: one entry point per screen
 * their roles allow, and nothing at all for the ones they do not.
 *
 * HIDDEN, NEVER DISABLED (brief R10). An excluded entry point is not rendered —
 * not greyed out, not `aria-disabled`, not a dead card. Nobody is shown a door they
 * cannot open, so nothing here needs a disabled state.
 *
 * Each entry point is a real navigational LINK carrying its address, not a button
 * that pushes a route: a link can be opened in a new tab, copied, and read out as a
 * link by a screen reader, and the address is visible in the markup rather than
 * hidden in a handler.
 *
 * The offered set comes from the roles on the identity resolved for THIS navigation
 * (brief BR3) via the single route access map — this component holds no role logic
 * of its own, so a change to who may open a screen happens in `lib/auth/access-map`
 * and shows up here.
 */
import Link from 'next/link';

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { entryPointsFor } from '@/lib/auth/access-map';

import type { UserInfoRead } from '@/types/auth';

export function RoleEntryPoints({ user }: { user: UserInfoRead }) {
  const entryPoints = entryPointsFor(user);

  return (
    <section aria-labelledby="what-you-can-do" className="grid gap-4">
      <h2 id="what-you-can-do" className="text-lg font-semibold tracking-tight">
        What you can do
      </h2>

      {entryPoints.length === 0 ? (
        /* A signed-in person whose roles this project does not recognise. They are
           told where to go rather than left looking at an empty screen. */
        <p className="text-muted-foreground max-w-prose">
          Nothing has been made available to your account yet. Ask the account
          holder for the access you need.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {entryPoints.map((entryPoint) => (
            <li key={entryPoint.path}>
              <Link
                href={entryPoint.path}
                className="focus-visible:border-ring focus-visible:ring-ring/50 block h-full rounded-xl outline-none focus-visible:ring-[3px]"
              >
                <Card className="hover:border-ring h-full transition-colors">
                  <CardHeader>
                    <CardTitle>{entryPoint.label}</CardTitle>
                    <CardDescription>{entryPoint.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
