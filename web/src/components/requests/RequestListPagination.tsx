'use client';

/**
 * The foot of the expense request listing: its CONTINUATION LINE, the requests-per-page
 * field beside it, and the way forward and back (`request-list-redesign` R14; the paging
 * behaviour itself is `expense-request-list` R12 / UI-16 and is unchanged).
 *
 * `RECORDS 1–20 OF 428 · PAGE 1 OF 22`. This is no longer a row of controls with a couple
 * of figures scattered through it — a listing worked down a page states its own
 * continuation, which is also why UI-16's always-visible, disabled navigation reads
 * naturally down here rather than looking broken.
 *
 * Eleven things here are deliberate and easy to break:
 *
 * - **The line is ONE element whose entire text is the line.** Not "20" over here, "428
 *   requests" over there and "Page 1 of 22" in the middle of the controls: five figures in
 *   one reading, in the order R14 states them. Scattering them across siblings again — or
 *   wrapping the figures in spans of their own — would leave no single element holding the
 *   line, which is the difference between a continuation line and a caption.
 * - **And there is exactly ONE of it on the whole screen.** No second copy for narrow
 *   viewports, no screen-reader-only duplicate: a reader cannot act on two statements of
 *   where they are, and the range and the page counter each appear once in the page's text.
 * - **The figures describe the slice the rows are drawn from**, because they come from the
 *   same calculation (`recordRangeOf`, beside `pageOf` in `lib/transactions/ordering.ts`).
 *   The last page of 428 at 20 a page reads `RECORDS 421–428 OF 428`, not `421–440`.
 * - **A single record collapses to `RECORDS 1 OF 1`**, not `RECORDS 1–1 OF 1`. R14 fixes
 *   the notation for a multi-record page and says nothing about the one-record case; the
 *   collapsed form is this story's decision, and the Playwright spec pins it.
 * - **THE LINE BRINGS NO RULE OF ITS OWN.** The listing above it already closes its bottom
 *   edge with a hairline (R13, story 5), and the line sits directly beneath that: a top
 *   rule here would put two hairlines a gap apart with nothing between them, which reads as
 *   an empty band rather than as a closed listing. That one rule is the listing's closing
 *   edge AND this line's own top edge — if the listing ever stops drawing it, this is where
 *   it has to come back.
 * - **Nothing is ever removed from the screen.** When the narrowed set fits one page the
 *   two page controls are still rendered and merely `disabled` — R2/UI-16 says visible but
 *   unusable, and taking them away is a defect rather than a simplification. The page-size
 *   field stays usable either way: a reader who has narrowed to three requests may still
 *   reasonably change the size.
 * - **They are real `<button>`s, not links.** Paging changes no address (the whole set is
 *   already in the browser and the endpoint takes no parameters), so these are state
 *   controls. `disabled` is what makes "cannot be used" programmatically determinable, and
 *   it takes them out of the tab order, which is why the keyboard-only sweep never lands on
 *   a control that does nothing. Shadcn's `pagination` primitive supplies the surrounding
 *   landmark; its own previous/next slots are anchors, which cannot be disabled, so the
 *   primitives composed here are the ones that can.
 * - **The page size is a Shadcn `select`, never a native `<select>`.** The native option
 *   list is drawn by the operating system, so no option ever takes focus in the page and the
 *   project's WCAG 2.2 AA keyboard-completability bar cannot be evidenced against it. R14
 *   presents it as a FIELD — the shared ruled notation, an underline and nothing else — and
 *   that is a styling decision, not a semantic one: it is still a real, labelled,
 *   keyboard-operable choice, named for the FIELD through its own label rather than by
 *   whatever size it happens to be showing (a Radix trigger is a button, so its accessible
 *   name would otherwise be "20").
 * - **The sizes on offer are owned elsewhere.** `PAGINATION.PAGE_SIZE_OPTIONS` states
 *   5/10/20/50 and the default of 20 once, for the selector and the rows it sizes both.
 *   This file restyles the selector; it must never re-declare them.
 * - **Nothing here is a live region.** The rows themselves are the answer to a page change,
 *   and the page count moves on every keystroke in the search box — announcing "page 2 of 3"
 *   as well would talk over the reader the whole time they are narrowing the list.
 * - **The page controls are NOT a list.** The primitive's `PaginationContent` /
 *   `PaginationItem` slots are a `ul`/`li` pair, and at phone width the list's own requests
 *   are the screen's list — one `listitem` per request (`expense-request-list` R16). Two
 *   more `listitem`s down here would make "one card per request" untrue for anything reading
 *   the page by role, so these controls sit in a plain row inside the primitive's labelled
 *   landmark.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';

import {
  FIELD_LABEL_CLASS,
  RULED_ACTION_ICON_CLASS,
  RULED_ACTION_WITH_ICON_CLASS,
  RULED_FIELD_CLASS,
} from '@/components/requests/fieldNotation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { pageSizeFrom, recordRangeOf } from '@/lib/transactions/ordering';
import { PAGINATION } from '@/lib/utils/constants';

/** Names the field the selector sets — not the value it is showing. */
const PAGE_SIZE_LABEL = 'Requests per page';

/** What the two page controls read as; both name the direction they move in. */
const PREVIOUS_LABEL = 'Previous';
const NEXT_LABEL = 'Next';

/** Names the landmark, so it is not just a second unlabelled "navigation". */
const PAGES_LABEL = 'Expense request pages';

/** Stable ids, so the label and the trigger it names stay wired together. */
const PAGE_SIZE_ID = 'expense-request-page-size';
const PAGE_SIZE_LABEL_ID = `${PAGE_SIZE_ID}-label`;

/**
 * The continuation line's own words, and the two marks that punctuate it (R14's notation).
 *
 * The words are stated in sentence case and upper-cased in CSS, like every other label on
 * this screen: the capitals are `text-transform`, so what a screen reader is given still
 * reads as words. The range dash is an EN dash — a range, not a subtraction — and the
 * halves are joined by a middle dot, which is a separator rather than punctuation either
 * half owns.
 */
const RECORDS_WORD = 'Records';
const PAGE_WORD = 'Page';
const OUT_OF_WORD = 'of';
const RANGE_DASH = '–';
const HALVES_SEPARATOR = '·';

/**
 * The whole line, as one string (see this file's header — it has to be one element's whole
 * text). A page holding a single record states that one record's number rather than a range
 * of it to itself: `RECORDS 1 OF 1`, not `RECORDS 1–1 OF 1`.
 */
const continuationLine = ({
  firstRecord,
  lastRecord,
  total,
  pageNumber,
  pageCount,
}: {
  firstRecord: number;
  lastRecord: number;
  total: number;
  pageNumber: number;
  pageCount: number;
}): string => {
  const records =
    firstRecord === lastRecord
      ? String(firstRecord)
      : `${String(firstRecord)}${RANGE_DASH}${String(lastRecord)}`;
  return (
    `${RECORDS_WORD} ${records} ${OUT_OF_WORD} ${String(total)} ` +
    `${HALVES_SEPARATOR} ${PAGE_WORD} ${String(pageNumber)} ${OUT_OF_WORD} ${String(pageCount)}`
  );
};

/**
 * How the line is set: the screen's own tracked micro-label notation, in full ink because
 * it STATES something rather than naming a figure beside it — and tabular, so the line holds
 * its width as the reader pages through rather than shuffling sideways under them (R14,
 * "figures in mono"). No middle type tier is invented for it (R16): it is the same notation
 * the column heads above it are set in.
 *
 * Deliberately allowed to wrap at 360px: the alternative is a line that pushes the page
 * sideways, which R4 forbids. Wrapping changes nothing about it being one element.
 */
const CONTINUATION_LINE_CLASS = `${FIELD_LABEL_CLASS} tabular-nums`;

/**
 * The requests-per-page field: the shared ruled notation, as wide as the figure it holds
 * plus its chevron. Mono and tabular like every other figure on the screen, so choosing 5
 * after 50 does not move the controls beside it.
 */
const PAGE_SIZE_FIELD_CLASS = `${RULED_FIELD_CLASS} h-8 w-auto min-w-14 justify-between font-mono text-sm tabular-nums`;

/**
 * A page control: the same ruled action notation every other non-row control on this screen
 * wears (`RequestActions`, the export, Clear all) — a tracked micro-label on a rule. There
 * are no boxed buttons left on this screen for an outlined one to match, and what tells
 * these two apart is the word and the direction of the glyph, never weight or colour. The
 * primitive's own `disabled:opacity-50` is what makes an unusable control look unusable.
 */
const PAGE_CONTROL_CLASS = RULED_ACTION_WITH_ICON_CLASS;

interface RequestListPaginationProps {
  /** How many requests the current search and filters left — what is being paged. */
  total: number;
  /** How many a page holds at the moment. */
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  /** The page being read, counting from 0. */
  pageIndex: number;
  /** How many pages the narrowed set fills; never below 1. */
  pageCount: number;
  onPageChange: (pageIndex: number) => void;
}

export function RequestListPagination({
  total,
  pageSize,
  onPageSizeChange,
  pageIndex,
  pageCount,
  onPageChange,
}: RequestListPaginationProps) {
  const hasPreviousPage = pageIndex > 0;
  const hasNextPage = pageIndex + 1 < pageCount;
  /**
   * Which records this page holds — the SAME calculation the rows above were sliced with,
   * so the line can never describe a page the listing is not showing.
   */
  const { firstRecord, lastRecord } = recordRangeOf(total, pageIndex, pageSize);

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      {/* THE CONTINUATION LINE (R14). One element, whose whole text is the line, and the
          only statement of the records range and the page counter on the screen. */}
      <p className={CONTINUATION_LINE_CLASS}>
        {continuationLine({
          firstRecord,
          lastRecord,
          total,
          pageNumber: pageIndex + 1,
          pageCount,
        })}
      </p>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        {/* The page size as a FIELD, in the strip's notation: its micro-label over the
            underlined control, exactly as the narrowing fields above are drawn. Still a
            real labelled choice — "field" is how it looks, not what it is. */}
        <div className="grid gap-1">
          <Label
            id={PAGE_SIZE_LABEL_ID}
            htmlFor={PAGE_SIZE_ID}
            className={`${FIELD_LABEL_CLASS} text-muted-foreground whitespace-nowrap`}
          >
            {PAGE_SIZE_LABEL}
          </Label>
          <Select
            value={String(pageSize)}
            onValueChange={(chosen) => {
              onPageSizeChange(pageSizeFrom(chosen));
            }}
          >
            {/* Named by its label rather than by the size it is displaying. */}
            <SelectTrigger
              id={PAGE_SIZE_ID}
              aria-labelledby={PAGE_SIZE_LABEL_ID}
              size="sm"
              className={PAGE_SIZE_FIELD_CLASS}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* The four sizes R2 fixes, from the one place they are stated. */}
              {PAGINATION.PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Named for what it pages, rather than keeping the primitive's generic
            "pagination": the signed-in shell already has a navigation landmark, and
            two landmarks called the same thing tell a screen-reader user nothing. */}
        <Pagination
          aria-label={PAGES_LABEL}
          className="mx-0 w-auto justify-end"
        >
          <div className="flex flex-row items-center gap-4">
            <Button
              type="button"
              variant="ghost"
              className={PAGE_CONTROL_CLASS}
              disabled={!hasPreviousPage}
              onClick={() => {
                onPageChange(pageIndex - 1);
              }}
            >
              <ChevronLeft
                aria-hidden="true"
                className={RULED_ACTION_ICON_CLASS}
              />
              {PREVIOUS_LABEL}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={PAGE_CONTROL_CLASS}
              disabled={!hasNextPage}
              onClick={() => {
                onPageChange(pageIndex + 1);
              }}
            >
              {NEXT_LABEL}
              <ChevronRight
                aria-hidden="true"
                className={RULED_ACTION_ICON_CLASS}
              />
            </Button>
          </div>
        </Pagination>
      </div>
    </div>
  );
}
