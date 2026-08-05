'use client';

/**
 * The expense request list's page controls: how many requests a page holds, which page
 * is being read, and the way forward and back (brief R12).
 *
 * Five things here are deliberate and easy to break:
 *
 * - **Nothing is ever removed from the screen.** When the narrowed set fits one page
 *   the two page controls are still rendered and merely `disabled` — R12 says visible
 *   but unusable, and taking them away is a defect rather than a simplification. The
 *   page-size selector stays usable either way: a reader who has narrowed to three
 *   requests may still reasonably change the size.
 * - **They are real `<button>`s, not links.** Paging changes no address (the whole set
 *   is already in the browser and the endpoint takes no parameters), so these are
 *   state controls. `disabled` is what makes "cannot be used" programmatically
 *   determinable, and it takes them out of the tab order, which is why the
 *   keyboard-only sweep never lands on a control that does nothing. Shadcn's
 *   `pagination` primitive supplies the surrounding landmark and list; its own
 *   previous/next slots are anchors, which cannot be disabled, so the primitives
 *   composed here are the ones that can.
 * - **The page size is a Shadcn `select`, never a native `<select>`.** The native
 *   option list is drawn by the operating system, so no option ever takes focus in the
 *   page and the project's WCAG 2.2 AA keyboard-completability bar cannot be evidenced
 *   against it.
 * - **The selector is named for the FIELD, through its own label.** A Radix trigger is
 *   a button, so its accessible name would otherwise be whatever size it happens to be
 *   showing — leaving the control unnamed for assistive technology.
 * - **Nothing here is a live region.** The rows themselves are the answer to a page
 *   change; announcing "page 2 of 3" as well would talk over the reader every time
 *   they typed in the search box, since the page count changes as the list narrows.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { pageSizeFrom } from '@/lib/transactions/ordering';
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex items-center gap-2">
        <Label
          id={PAGE_SIZE_LABEL_ID}
          htmlFor={PAGE_SIZE_ID}
          className="font-normal whitespace-nowrap"
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
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGINATION.PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {total === 1 ? '1 request' : `${String(total)} requests`}
        </span>
      </div>

      {/* Named for what it pages, rather than keeping the primitive's generic
          "pagination": the signed-in shell already has a navigation landmark, and
          two landmarks called the same thing tell a screen-reader user nothing. */}
      <Pagination aria-label={PAGES_LABEL} className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasPreviousPage}
              onClick={() => {
                onPageChange(pageIndex - 1);
              }}
            >
              <ChevronLeft aria-hidden="true" />
              {PREVIOUS_LABEL}
            </Button>
          </PaginationItem>
          <PaginationItem className="text-muted-foreground px-2 text-sm whitespace-nowrap">
            {`Page ${String(pageIndex + 1)} of ${String(pageCount)}`}
          </PaginationItem>
          <PaginationItem>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasNextPage}
              onClick={() => {
                onPageChange(pageIndex + 1);
              }}
            >
              {NEXT_LABEL}
              <ChevronRight aria-hidden="true" />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
