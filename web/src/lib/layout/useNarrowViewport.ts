'use client';

/**
 * Whether the reader is at phone width, as a hook — the ONE way a component asks
 * (`request-list-redesign` R4, `files-view-redesign` R3).
 *
 * `./viewport.ts` owns the crossover and the subscription; this is only the React reading
 * of it, stated once because five listings now switch presentation on it — the expense
 * request list and the four on the two expense-files screens. Five inline copies of the
 * same three-argument `useSyncExternalStore` call is how one of them quietly ends up
 * watching something else, or copying the width into state.
 *
 * It is the BROWSER'S OWN STATE, WATCHED — never copied into React state. The media query
 * already has an answer before React runs, and an effect that copied it into `useState`
 * could disagree with what is on screen (see `./viewport.ts` for the whole reasoning,
 * including why the server's honest answer is "not narrow").
 */

import { useSyncExternalStore } from 'react';

import {
  isNarrowViewport,
  isNarrowViewportOnServer,
  subscribeToViewportWidth,
} from '@/lib/layout/viewport';

/** True while the reader's viewport is narrower than the crossover `./viewport.ts` states. */
export const useNarrowViewport = (): boolean =>
  useSyncExternalStore(
    subscribeToViewportWidth,
    isNarrowViewport,
    isNarrowViewportOnServer,
  );
