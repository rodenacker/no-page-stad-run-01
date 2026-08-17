/**
 * Story Metadata:
 * - Route: / (the ROOT LAYOUT — so every screen in the app, redesigned or not)
 * - Target File: web/src/app/layout.tsx
 * - Page Action: modify_existing
 *
 * Epic `request-list-redesign`, Story 1 — the app's new face, its ink, and the
 * direction on record (R9, R23, R24, R25, R28, BR9, BR10).
 *
 * This is a PRESENTATION-ONLY story on a shipped app: it changes what the app is set
 * in and how its blues are spent, and changes no behaviour whatsoever.
 *
 * ---------------------------------------------------------------------------
 * COVERAGE SPLIT — straight from the story's AC table (one tag, one layer)
 * ---------------------------------------------------------------------------
 * - AC-1 `playwright` — every screen's text really rendering in the two new faces,
 *   and the old face appearing nowhere. Only a real browser resolves a font stack,
 *   so this is NOT duplicated here.
 * - AC-2 `playwright` — the direction contract standing as the very first thing
 *   inside the page body. A `{/* … *\/}` JSX comment is compiled away, so the only
 *   honest check is the served document itself (BR10: it must survive the production
 *   build and be greppable for seed key `29469d17`).
 * - AC-3 `playwright` — the six screens this epic does not redesign still opening and
 *   reading correctly on the changed shared layer (R28). Whole-screen, real-browser.
 * - AC-4 `playwright` — light/dark still decided before first paint, a remembered
 *   choice still beating the OS setting. Needs a real reload and OS emulation.
 * - **AC-5 `none` (THIS FILE)** — both light and dark drawing every surface from the
 *   shared palette: nothing losing its colour, no text losing its readability.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE READS THE TOKEN LAYER AND THE ROOT LAYOUT
 * ---------------------------------------------------------------------------
 * AC-5's truth does not live in a rendered component — it lives in the palette
 * itself. jsdom loads no stylesheet, and `next/font` is a build-time transform that
 * cannot be imported into a Vitest run at all, so a component render can say nothing
 * about either. What CAN be checked before a browser is the declaration: the token
 * layer (`app/globals.css`) is this project's whole palette and face wiring expressed
 * as data (styling-centralisation.md rules 1–5), and the root layout is the one module
 * that loads a face.
 *
 * So both are parsed into token maps and asserted STRUCTURALLY — never as source
 * strings. In particular the readability half of AC-5 is *computed*: every ink/surface
 * pairing's WCAG contrast ratio is derived from the palette, so `--primary-foreground`
 * staying the dark ink rather than white (5.9:1, not the 2.5:1 white-on-#00AEEF
 * would give — R25) is PROVED rather than pinned to a hex literal that a test has no
 * business restating.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE DEVELOPER HAS TO DO TO TURN THIS GREEN (the contract)
 * ---------------------------------------------------------------------------
 * 1. Retire `Cabin`. Load `Public_Sans` (all text) and `Azeret_Mono` (figures,
 *    references, masked account numbers, control totals, field labels) with
 *    `next/font/google` in `app/layout.tsx` — two faces, no more (R24).
 * 2. Expose each ONLY as a CSS variable (`variable: '--font-…'`). No component may
 *    name a face; that indirection is what keeps a face swap a one-file change.
 * 3. Wire both in `globals.css` `@theme inline`: `--font-sans` reads the text face's
 *    variable, `--font-mono` reads the figure face's — each stack STARTING with the
 *    `var(--font-…)` and keeping its generic fallbacks behind it. `--font-cabin` goes.
 * 4. Leave every colour token as it is unless a later story adds one, and when it
 *    does, populate it in BOTH `:root` and `.dark` (R9).
 *
 * Also on this story but NOT assertable at this layer, so do not look for it here:
 * the direction contract must be EMITTED MARKUP as the first child of `<body>`
 * (AC-2, R23/BR10), and the `@media (prefers-reduced-motion: reduce)` block at the
 * end of `globals.css` must be left exactly as it is — story 9's digit roll works
 * *with* it (BR8).
 *
 * These assertions WILL FAIL until the faces are swapped (TDD red).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));

/** THE token layer: this project's whole palette and face wiring, in one file. */
const TOKEN_LAYER_PATH = resolve(HERE, '../../app/globals.css');

/** The one module allowed to load a face and expose it as a custom property. */
const ROOT_LAYOUT_PATH = resolve(HERE, '../../app/layout.tsx');

/**
 * Both files are read with their comments removed before anything is parsed — the
 * prose in them documents decisions and must never be able to satisfy or break an
 * assertion about a declaration.
 */
const declarationsSource = (path: string): string =>
  readFileSync(path, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');

const TOKEN_LAYER = declarationsSource(TOKEN_LAYER_PATH);
const ROOT_LAYOUT = declarationsSource(ROOT_LAYOUT_PATH);

/** The body of one un-nested rule in the token layer. */
const ruleBody = (label: string, rule: RegExp): string => {
  const found = rule.exec(TOKEN_LAYER);
  if (found === null) {
    throw new Error(
      `The token layer declares no \`${label}\` block. globals.css is the ONE place ` +
        `this project declares a colour or a face (styling-centralisation.md rules 1-5).`,
    );
  }
  return found[1];
};

/** Every `--name: value;` in a rule body, as a map of name (without `--`) to value. */
const declarationsIn = (body: string): Map<string, string> => {
  const declared = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    declared.set(name, value.trim());
  }
  return declared;
};

/** What the app can actually reach: `--color-primary: var(--primary)`, `--font-sans: …`. */
const EXPOSED = declarationsIn(
  ruleBody('@theme inline', /@theme\s+inline\s*\{([\s\S]*?)\}/),
);

/** The light version's values. */
const LIGHT = declarationsIn(
  ruleBody(':root', /(?:^|[};])\s*:root\s*\{([\s\S]*?)\}/),
);

/** The dark version's values. */
const DARK = declarationsIn(
  ruleBody('.dark', /(?:^|[};])\s*\.dark\s*\{([\s\S]*?)\}/),
);

/**
 * The custom property a declared value reads FIRST, or `null` when it names something
 * concrete instead. A font stack that resolves through a variable keeps the face a
 * token; one that names a family puts the face back into CSS, where a component could
 * reach past the token for it.
 */
const varReadFirst = (value: string): string | null => {
  const found = /^var\(\s*(--[\w-]+)/.exec(value);
  return found === null ? null : found[1];
};

const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const channelsOf = (hex: string): number[] => {
  const digits = hex.slice(1);
  const pairs =
    digits.length === 3
      ? [...digits].map((digit) => `${digit}${digit}`)
      : [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)];
  return pairs.map((pair) => parseInt(pair, 16) / 255);
};

/** WCAG 2.1 §Relative luminance. */
const luminanceOf = (hex: string): number => {
  const linear = (channel: number): number =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const [red, green, blue] = channelsOf(hex).map(linear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

/** WCAG 2.1 contrast ratio, whichever way round the two colours are given. */
const contrastRatio = (one: string, other: string): number => {
  const [dimmer, brighter] = [luminanceOf(one), luminanceOf(other)].sort(
    (a, b) => a - b,
  );
  return (brighter + 0.05) / (dimmer + 0.05);
};

/** The project's readability bar for body text (WCAG 2.2 AA, requirements §6.6.5). */
const READABLE = 4.5;

/**
 * The surface an ink token is meant to sit on: `--foreground` is the page's own ink,
 * so its surface is `--background`; every other `--x-foreground` sits on `--x`.
 */
const surfaceOf = (inkToken: string): string =>
  inkToken === 'foreground'
    ? 'background'
    : inkToken.slice(0, -'-foreground'.length);

interface Pairing {
  /** How the pairing reads, for a failure message someone can act on. */
  readonly pairing: string;
  readonly ratio: number;
}

/** Every ink-on-its-own-surface pairing one version of the theme declares. */
const inkPairingsIn = (version: Map<string, string>): Pairing[] =>
  [...version.entries()]
    .filter(
      ([token]) => token === 'foreground' || token.endsWith('-foreground'),
    )
    .flatMap(([inkToken, ink]) => {
      const surfaceToken = surfaceOf(inkToken);
      const surface = version.get(surfaceToken);
      if (
        surface === undefined ||
        !HEX_COLOUR.test(ink) ||
        !HEX_COLOUR.test(surface)
      ) {
        return [];
      }
      return [
        {
          pairing: `--${inkToken} on --${surfaceToken}`,
          ratio: contrastRatio(ink, surface),
        },
      ];
    });

/** The colours one version declares — the values a theme actually paints with. */
const coloursDeclaredIn = (version: Map<string, string>): string[] =>
  [...version.entries()]
    .filter(([, value]) => HEX_COLOUR.test(value))
    .map(([token]) => token);

describe('Epic request-list-redesign, Story 1: the new face, the ink, and the direction on record', () => {
  // AC-5
  it('gives every colour the app exposes a value in BOTH light and dark, and keeps every ink readable on the surface it sits on', () => {
    // The palette the app can reach: one Tailwind colour utility per custom property.
    // This is the set both versions owe a value to.
    const palette = [
      ...new Set(
        [...EXPOSED.entries()]
          .filter(([exposedAs]) => exposedAs.startsWith('color-'))
          .map(([, value]) => varReadFirst(value))
          .filter((token): token is string => token !== null)
          .map((token) => token.replace(/^--/, '')),
      ),
    ];

    // The parse found the real palette rather than an empty block — including the
    // tokens this redesign leans on hardest: the control block's saturated field, the
    // blue carrying interactive state and gutter marks, and plain ground and ink (R25).
    expect(palette).toEqual(
      expect.arrayContaining([
        'background',
        'foreground',
        'primary',
        'primary-foreground',
        'brand-accent',
        'brand-accent-foreground',
        'border',
        'muted-foreground',
        'success',
        'warning',
        'info',
        'destructive',
      ]),
    );

    // Nothing loses its colour in either version: a token the app exposes but one
    // version never populates is a surface that renders unstyled in that version.
    expect({
      unpopulatedInLight: palette
        .filter((token) => (LIGHT.get(token) ?? '') === '')
        .sort(),
      unpopulatedInDark: palette
        .filter((token) => (DARK.get(token) ?? '') === '')
        .sort(),
    }).toEqual({ unpopulatedInLight: [], unpopulatedInDark: [] });

    // ...and neither version quietly carries a colour the other has never heard of,
    // which is how one version drifts ahead of the other as stories 2-9 add surfaces.
    const light = new Set(coloursDeclaredIn(LIGHT));
    const dark = new Set(coloursDeclaredIn(DARK));
    expect({
      declaredInLightOnly: [...light]
        .filter((token) => !dark.has(token))
        .sort(),
      declaredInDarkOnly: [...dark].filter((token) => !light.has(token)).sort(),
    }).toEqual({ declaredInLightOnly: [], declaredInDarkOnly: [] });

    // No text loses its readability in either version. Computed from the palette, so
    // the deliberate pairings survive on their merits: `--primary-foreground` is the
    // dark ink because white on the brand blue is 2.5:1 (R25).
    const tooFaint = (version: Map<string, string>): string[] =>
      inkPairingsIn(version)
        .filter(({ ratio }) => ratio < READABLE)
        .map(({ pairing, ratio }) => `${pairing} — ${ratio.toFixed(2)}:1`)
        .sort();

    expect({
      tooFaintInLight: tooFaint(LIGHT),
      tooFaintInDark: tooFaint(DARK),
    }).toEqual({ tooFaintInLight: [], tooFaintInDark: [] });

    // And the pairings R25 names by hand are genuinely among the ones just measured,
    // in both versions — so an empty pairing list could never pass the check above.
    const namedByR25 = [
      '--primary-foreground on --primary',
      '--brand-accent-foreground on --brand-accent',
      '--foreground on --background',
    ];
    expect(inkPairingsIn(LIGHT).map(({ pairing }) => pairing)).toEqual(
      expect.arrayContaining(namedByR25),
    );
    expect(inkPairingsIn(DARK).map(({ pairing }) => pairing)).toEqual(
      expect.arrayContaining(namedByR25),
    );
  });

  // R24, R9 — the indirection that makes the face a token like every colour is.
  // (AC-1 checks the faces a browser actually RENDERS; this checks that no screen can
  // name one, which is what keeps the swap a one-file change and keeps the six
  // unredesigned screens on the same face as the redesigned one — R28.)
  it('loads the two faces in one place and hands them to every screen only as tokens, with Cabin gone', () => {
    // Each face the root layout loads is handed out as a custom property and nothing
    // else — `next/font` is given a `variable`, never a class a screen applies.
    const exposedByLayout = [
      ...ROOT_LAYOUT.matchAll(/variable:\s*'(--font-[\w-]+)'/g),
    ].map(([, variable]) => variable);

    // Cabin is retired: neither loaded nor read anywhere.
    expect({
      stillLoadedByTheLayout: exposedByLayout.filter(
        (variable) => variable === '--font-cabin',
      ),
      stillReadByTheTokenLayer: [...EXPOSED.entries()]
        .filter(([, value]) => value.includes('--font-cabin'))
        .map(([exposedAs]) => `--${exposedAs}`),
    }).toEqual({ stillLoadedByTheLayout: [], stillReadByTheTokenLayer: [] });

    // Two faces, no more (R24): one for words, one for figures, references, masked
    // account numbers, control totals and field labels.
    expect(exposedByLayout).toHaveLength(2);

    // Both stacks READ a variable rather than naming a family, so the face never
    // appears in CSS a component could reach for directly.
    const textFace = varReadFirst(EXPOSED.get('font-sans') ?? '');
    const figureFace = varReadFirst(EXPOSED.get('font-mono') ?? '');
    expect(textFace).toMatch(/^--font-/);
    expect(figureFace).toMatch(/^--font-/);

    // ...and between them they read exactly the two the layout loads — one each, so
    // figures cannot silently fall back to the text face or to the OS monospace stack.
    expect([textFace, figureFace]).toEqual(
      expect.arrayContaining(exposedByLayout),
    );
  });
});
