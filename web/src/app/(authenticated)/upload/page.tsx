/**
 * The upload address, registered now so that reaching it is answered by THIS app
 * rather than by a generic not-found page.
 *
 * The permission check runs on the server before anything is rendered: an Approver
 * who types this address in gets a rendered screen (HTTP 200) explaining which
 * permission is missing, inside the normal signed-in shell — the denial can never
 * fall through to a browser error page (brief R11, R13).
 *
 * The upload screen itself belongs to the file-upload epic. Until it ships, a
 * PERMITTED Finance Uploader following the entry point reaches not-found — the
 * accepted, temporary consequence of registering the address early (story 4 §
 * "Known interim state"). That epic replaces the `notFound()` below with the real
 * screen and leaves the check above exactly as it is.
 */
import { notFound } from 'next/navigation';

import { PermissionDeniedMessage } from '@/components/auth/PermissionDeniedMessage';
import { UPLOAD_PATH, canAccess } from '@/lib/auth/access-map';
import { requireSession } from '@/lib/auth/requireSession';

export default async function UploadPage() {
  const session = await requireSession();

  if (!canAccess(session, UPLOAD_PATH)) {
    return <PermissionDeniedMessage deniedPath={UPLOAD_PATH} />;
  }

  notFound();
}
