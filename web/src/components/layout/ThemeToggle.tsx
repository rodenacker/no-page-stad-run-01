'use client';

/**
 * The switch in the header that changes the app between its light and its dark
 * version (story 5 AC-3).
 *
 * Three deliberate choices:
 *
 * - **It is one plain button, not a two-step menu and not a checkbox.** One press
 *   moves the whole app to the other version, immediately — nothing to open first,
 *   nothing to confirm. Story 3 settled that the theme control is a standalone header
 *   control rather than an entry inside the user menu.
 * - **Its accessible name says the version it will switch TO**, and changes with the
 *   active version ("Switch to dark theme" while the light version is showing,
 *   "Switch to light theme" while the dark one is). A name that never changed would
 *   leave a screen-reader user unable to tell which version they are looking at
 *   (project's WCAG 2.2 AA bar, requirements §6.6.5).
 * - **It keeps no copy of which version is showing.** That was already decided before
 *   first paint by the root layout's inline script, and it lives on the document
 *   itself, so this button *watches* it rather than storing its own answer — see
 *   `subscribeToTheme` in `lib/theme/theme.ts`. That is also why the server-rendered
 *   name is the neutral "Switch theme": the server cannot know a browser's own
 *   setting, and rendering a guess would make the button briefly claim the wrong
 *   thing. The real name is in place as soon as the page is interactive.
 *
 * It needs no provider around it: `lib/theme/theme.ts` is where the light/dark
 * decision lives, shared with the layout's before-paint script (CLAUDE.md §6 — the
 * existing root layout is extended, no new provider stack is nested inside it).
 *
 * The sun/moon icons swap by CSS (`dark:`), not by state, so the right one is on
 * screen from the first paint too.
 */

import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import {
  activeTheme,
  applyTheme,
  rememberTheme,
  subscribeToTheme,
} from '@/lib/theme/theme';

import type { Theme } from '@/lib/theme/theme';

const OTHER_THEME: Record<Theme, Theme> = { light: 'dark', dark: 'light' };

/** On the server there is no browser to ask, so there is no version to name yet. */
const noThemeOnServer = (): null => null;

export function ThemeToggle() {
  // The active version is browser state, not React state: `useSyncExternalStore` reads
  // it straight from the document on every render and re-renders this button when it
  // changes — including a mid-session change to the computer's own setting.
  const theme = useSyncExternalStore<Theme | null>(
    subscribeToTheme,
    activeTheme,
    noThemeOnServer,
  );

  const nextTheme: Theme = theme === null ? 'dark' : OTHER_THEME[theme];
  const label =
    theme === null ? 'Switch theme' : `Switch to ${nextTheme} theme`;

  const switchTheme = (): void => {
    // Both writes go outward, to the browser. The new name on this button follows on
    // its own, because applying a version announces it and this component is watching.
    applyTheme(nextTheme);
    // From now on this is the user's own choice, and it outranks their computer's
    // setting on every later visit in this browser (AC-4).
    rememberTheme(nextTheme);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={switchTheme}
    >
      <Sun aria-hidden="true" className="dark:hidden" />
      <Moon aria-hidden="true" className="hidden dark:block" />
    </Button>
  );
}
