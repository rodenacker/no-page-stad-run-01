'use client';

/**
 * Who you are signed in as, and the menu that lets you leave.
 *
 * The trigger shows the person's own name and their role (epic brief R3), so the
 * button's accessible name IS their name — a user (and a screen reader) can tell
 * whose session this is before opening anything.
 *
 * The menu holds exactly one item, sign out. Kept deliberately bare: a `menu` may
 * only contain menu items, and anything else in it is an accessibility violation of
 * the project's WCAG 2.2 AA bar (requirements §6.6.5) — this shell is scanned in
 * both states, closed and open.
 */

import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { displayNameOf, roleLabelOf } from '@/lib/auth/identity';

import { SignOutButton } from './SignOutButton';

import type { UserInfoRead } from '@/types/auth';

export function UserMenu({ user }: { user: UserInfoRead }) {
  const name = displayNameOf(user);
  const roleLabel = roleLabelOf(user);

  return (
    /*
     * `modal={false}`: a modal menu marks everything outside itself
     * `aria-hidden` while leaving those elements focusable — which is an
     * accessibility violation the shell's real-browser scan reports
     * (`aria-hidden-focus`). A header menu is not a dialog and has no reason to
     * take the rest of the page out of the accessibility tree; Escape, the arrow
     * keys and click-outside all still close it.
     */
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto px-2 py-1.5">
          <span className="flex flex-col items-start text-left leading-tight">
            <span className="text-sm font-medium">{name}</span>
            {roleLabel !== '' && (
              <span className="text-muted-foreground text-xs font-normal">
                {roleLabel}
              </span>
            )}
          </span>
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem asChild>
          <SignOutButton />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
