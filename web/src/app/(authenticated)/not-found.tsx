/**
 * What a signed-in person sees when they open an address that has no screen — mistyped,
 * bookmarked from something that has since changed, or (for now) a screen their roles
 * allow whose epic has not shipped yet (epic `expense-file-upload` R11, story 4 AC-7).
 *
 * It lives INSIDE the `(authenticated)` route group on purpose, and that placement is
 * the whole fix: `notFound()` is answered by the nearest `not-found` boundary above the
 * segment that raised it, so a file here keeps this group's layout — and therefore the
 * header and its navigation — on the page. With no boundary in the group, the same call
 * bubbled to Next's own root fallback, which renders outside every layout in the app:
 * the user landed on a page with no header at all and the browser's Back button as the
 * only way off it, which is exactly the dead end R11 exists to remove.
 *
 * Next answers this page with HTTP 404, as it should — it is a genuine "no such
 * address", not a screen that works.
 *
 * The wording is deliberately generic. This one page serves every unmatched address in
 * the signed-in area, so it must read sensibly for a typo as much as for the one screen
 * a later epic will build; it never says "coming soon", never names an unbuilt feature
 * and never promises a date (the user's decision at the manual test). The way onward is
 * named rather than repeated as a control: the header above is already carrying every
 * screen this person may open, plus the app's name back to the landing screen.
 *
 * Follows `PermissionDeniedMessage`'s shape — the app's other "this address did not work
 * for you" answer — so the two read as one app: the same heading, the same `alert`
 * default variant with its description at `text-foreground` and its title's one-line
 * clamp released (the destructive variant dims description text below the project's
 * WCAG 2.2 AA bar, requirements §6.6.5). Every colour comes from the tokens, so it holds
 * up in both the light and the dark version.
 */
import { MapPinOff } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function AuthenticatedNotFound() {
  return (
    <section className="grid max-w-prose gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Screen not found
      </h1>

      <Alert>
        <MapPinOff aria-hidden="true" />
        <AlertTitle className="line-clamp-none">
          There is no screen at this address
        </AlertTitle>
        <AlertDescription className="text-foreground gap-3">
          <p>
            The address may have been typed with a small mistake, or it may have
            changed since it was saved or shared.
          </p>
          <p>
            You are still signed in. Use the menu at the top of this page to go
            to a screen you can open, or the app&rsquo;s name to start again
            from the beginning.
          </p>
        </AlertDescription>
      </Alert>
    </section>
  );
}
