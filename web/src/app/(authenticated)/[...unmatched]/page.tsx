/**
 * Any address inside the app that matches no screen.
 *
 * Every registered address now has a screen of its own, so the only way to reach "no
 * such screen" is a mistyped or stale address — and that is precisely the case R11 was
 * about: the user must be able to leave by the app's own header rather than the
 * browser's Back button. Without this segment such an address would be answered by
 * Next's built-in root fallback, which renders outside every layout and therefore
 * carries no header at all.
 *
 * It does nothing but hand the address to the group's own `not-found.tsx`, so the
 * answer is the same one any `notFound()` inside this group produces: HTTP 404, the
 * group's wording, and the signed-in shell still around it. Being inside
 * `(authenticated)` also means a signed-out visitor is sent to sign in first, exactly
 * as they are for every other address in here.
 *
 * A real screen at a real address always wins over this segment — Next.js matches a
 * static route before a catch-all — so adding a screen needs no change here.
 */
import { notFound } from 'next/navigation';

export default function UnmatchedAddressPage(): never {
  notFound();
}
