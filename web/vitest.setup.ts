// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/vitest';

import { vi } from 'vitest';

// Accessibility is asserted in Playwright (real browser) via @axe-core/playwright,
// not in jsdom — see testing-policy.md § Where each scenario belongs. So there is
// no `vitest-axe` matcher to register here.

// React Testing Library ⇄ Vitest fake-timers safety net.
//
// Time-dependent *flows* (session timeout, polling, countdowns) belong in
// Playwright via `page.clock` — see testing-policy.md § Time-dependent behaviour.
// This shim only backstops the rare component-local `vi.useFakeTimers()` test:
// RTL's `waitFor`/`findBy*` only advance fake timers when it detects Jest's
// globals (`jestFakeTimersAreEnabled()` checks for a `jest` object + mocked
// `setTimeout`). Under Vitest the timers are mocked (Sinon `setTimeout.clock`)
// but there is no `jest` global, so RTL falls back to REAL-timer polling that
// never fires under a frozen fake clock → `waitFor`/`findBy*` deadlock.
//
// Exposing a minimal `globalThis.jest` shim backed by Vitest's timer API closes
// that gap. RTL only consults it when fake timers are actually active, so suites
// on real timers are unaffected. Test-environment only — no production code is
// touched. (Do NOT run `axe()` under fake timers — assert a11y on a real-timer
// render instead; that's why this file no longer needs an axe/`setTimeout` shim.)
if (typeof (globalThis as { jest?: unknown }).jest === 'undefined') {
  (globalThis as { jest?: unknown }).jest = {
    advanceTimersByTime: (ms: number) => void vi.advanceTimersByTime(ms),
  };
}

// jsdom implements no `window.matchMedia`, so any component that asks the browser a
// question about the environment — the header's theme switch asks for the computer's
// light/dark setting — throws the moment it mounts, in every test that happens to
// render it. This supplies the API with nothing matching (so a media query the test
// has not set up reads as "not applied", i.e. the light theme), matching the other
// browser-API polyfills below. A test that cares about a specific query stubs
// `matchMedia` itself for the duration of that test.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Pointer-capture and scroll-into-view, for Radix primitives in jsdom.
//
// jsdom implements none of the Pointer Capture API and no `scrollIntoView`. Radix
// uses both to run an accessible listbox — `Select` asks the event target
// `hasPointerCapture(pointerId)` on pointer-down to tell a click from a
// press-and-drag selection, and scrolls the highlighted item into view when the
// list opens. Without these a `user.click()` on a `Select` trigger dies with
// "target.hasPointerCapture is not a function" before the listbox ever opens, so
// the component cannot be driven in a test at all.
//
// These are honest do-nothing stands-in for browser APIs jsdom lacks, matching
// the `matchMedia` shim above — NOT a way to make a failing component pass:
// - `hasPointerCapture` reports false, i.e. "this element has not captured the
//   pointer", which is the true state in jsdom (nothing ever captures it);
// - `releasePointerCapture` is the no-op that state implies (Radix calls it on
//   the press-and-drag-to-select path);
// - `scrollIntoView` is a no-op because scrolling has no meaning in a layout
//   engine with no viewport — jsdom reports every element at 0×0 regardless.
// None of them swallow an error or fake a result a real browser would compute
// differently, so a genuinely broken interaction still fails: the click still has
// to land, the listbox still has to open, the option still has to be selectable.
//
// Kept to what Radix actually calls — `hasPointerCapture` and `scrollIntoView`
// were both confirmed load-bearing (click-to-open and keyboard-to-open alike die
// without them); `setPointerCapture` is deliberately NOT stubbed, because nothing
// in this stack calls it and an unused shim is one more thing to mistrust.
//
// Test-environment only; no production code is touched. Shared infrastructure —
// any epic rendering a Shadcn `select` / `dropdown-menu` / `popover` needs it.
if (typeof Element !== 'undefined') {
  if (typeof Element.prototype.hasPointerCapture !== 'function') {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (typeof Element.prototype.releasePointerCapture !== 'function') {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {};
  }
}

// Element size observation, for Radix popper-positioned primitives in jsdom.
//
// jsdom implements no `ResizeObserver`. Radix's `useSize` constructs one the
// moment a popper-positioned surface mounts — a `dropdown-menu`'s content, a
// `popover`, a `tooltip` — so WITHOUT this the content component throws
// "ResizeObserver is not defined" while committing, the menu never appears, and
// the primitive cannot be driven in a test at all (it also surfaces as an
// unhandled error that fails the run outright).
//
// An observer that records what it was asked to watch and never reports a change
// is the honest stand-in, exactly like the pointer-capture shims above: jsdom has
// no layout engine, reports every element at 0×0 and never lays anything out
// again, so "nothing ever resizes" is the true state rather than a convenient
// pretence. It fakes no measurement a real browser would compute differently, so
// a genuinely broken interaction still fails — the click still has to land, the
// menu still has to open, the item still has to be selectable.
//
// Test-environment only; no production code is touched. Shared infrastructure —
// any epic rendering a Shadcn `dropdown-menu` / `popover` / `tooltip` needs it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// Polyfill for Web APIs needed by Next.js
// These are required for testing files that import from 'next/server'
if (typeof Request === 'undefined') {
  global.Request = class Request {
    url: string;
    method: string;
    headers: Headers;

    constructor(input: string | Request, init?: RequestInit) {
      this.url = typeof input === 'string' ? input : input.url;
      this.method = init?.method || 'GET';
      this.headers = new Headers(init?.headers);
    }
  } as unknown as typeof Request;
}

if (typeof Response === 'undefined') {
  global.Response = class Response {
    status: number;
    statusText: string;
    headers: Headers;
    body: unknown;

    constructor(body?: BodyInit | null, init?: ResponseInit) {
      this.body = body;
      this.status = init?.status || 200;
      this.statusText = init?.statusText || 'OK';
      this.headers = new Headers(init?.headers);
    }

    json() {
      return Promise.resolve(JSON.parse(this.body as string));
    }
  } as unknown as typeof Response;
}

if (typeof Headers === 'undefined') {
  global.Headers = class Headers {
    private headers: Map<string, string> = new Map();

    constructor(init?: HeadersInit) {
      if (init) {
        if (Array.isArray(init)) {
          init.forEach(([key, value]) =>
            this.headers.set(key.toLowerCase(), value),
          );
        } else if (init instanceof Headers) {
          init.forEach((value, key) => this.headers.set(key, value));
        } else {
          Object.entries(init).forEach(([key, value]) =>
            this.headers.set(key.toLowerCase(), value),
          );
        }
      }
    }

    get(name: string) {
      return this.headers.get(name.toLowerCase()) || null;
    }

    set(name: string, value: string) {
      this.headers.set(name.toLowerCase(), value);
    }

    has(name: string) {
      return this.headers.has(name.toLowerCase());
    }

    delete(name: string) {
      this.headers.delete(name.toLowerCase());
    }

    forEach(callback: (value: string, key: string, parent: Headers) => void) {
      this.headers.forEach((value, key) => callback(value, key, this));
    }
  } as unknown as typeof Headers;
}
