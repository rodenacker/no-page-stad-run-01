'use client';

/**
 * The controls that narrow the expense request list: a free-text search box and three
 * pick-one filters — status, originating file and transaction type (brief R2/R3/R6/R7).
 *
 * Four things here are deliberate and easy to break:
 *
 * - **The choices are the values PRESENT in the fetched requests**, computed from the
 *   whole fetched set (not from what is currently listed, which would make a filter
 *   unable to offer its way back). The service owns each of these vocabularies, so
 *   there is no accepted-value list to check against and nothing it sent may be
 *   missing (brief §Notes & Caveats — a user-confirmed decision at INTAKE).
 * - **A transaction type is offered under the same wording the table cell uses**, from
 *   the one helper in `lib/transactions/display.ts`. A value the app has no wording for
 *   is offered exactly as the service sent it and is a legitimate choice, never an
 *   error.
 * - **Each filter is a Shadcn `select` (Radix), never a native `<select>`.** The native
 *   option list is drawn by the operating system, so the project's WCAG 2.2 AA
 *   keyboard-completability bar cannot be evidenced against it.
 * - **Each trigger is named for the FIELD it narrows by**, through `aria-labelledby`
 *   pointing at its visible label. A Radix trigger is a button, so its accessible name
 *   would otherwise be whatever it currently displays — the value, not the field —
 *   leaving the control unnamed for assistive technology.
 */

import { useMemo } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { transactionTypeLabel } from '@/lib/transactions/display';
import {
  FILE_FIELD_NAME,
  STATUS_FIELD_NAME,
  TRANSACTION_TYPE_FIELD_NAME,
  filterChoicesIn,
} from '@/lib/transactions/narrowing';

import type {
  FilterChoice,
  PickOneFilterField,
  RequestNarrowing,
} from '@/lib/transactions/narrowing';
import type { TransactionRead } from '@/types/transactions';

/** The search field's own wording — the label names what typing in it does. */
const SEARCH_LABEL = 'Search requests';
const SEARCH_HINT = 'Reference, description, file, amount or last 4 digits';

/** What "no choice made" reads as on each filter, before and after it is cleared. */
const ANY_STATUS_LABEL = 'All statuses';
const ANY_FILE_LABEL = 'All files';
const ANY_TYPE_LABEL = 'All types';

/**
 * The one choice that is not a value from the data. Every real choice's value carries
 * the prefix below, so a value the service sent can never collide with it — Radix needs
 * each item's value to be a distinct, non-empty string.
 */
const RESET_CHOICE_VALUE = 'reset';
const VALUE_PREFIX = 'value:';

/** Stable ids, so each label and the trigger it names stay wired together. */
const SEARCH_INPUT_ID = 'expense-request-search';
const STATUS_FILTER_ID = 'expense-request-status-filter';
const FILE_FILTER_ID = 'expense-request-file-filter';
const TYPE_FILTER_ID = 'expense-request-type-filter';

interface PickOneFilterProps {
  /** The trigger's id; its label is named from it, so the two cannot drift. */
  id: string;
  /** The field this filter narrows by — the trigger's accessible name. */
  field: string;
  /** What no choice at all reads as, both as the placeholder and as the reset choice. */
  resetLabel: string;
  /** The service's value currently chosen, or `''` for none. */
  value: string;
  /** One choice per distinct value present in the fetched requests. */
  choices: FilterChoice[];
  onChange: (value: string) => void;
}

/**
 * One pick-one filter. All three are this same control, so the label wiring, the reset
 * choice and the "offer what the data holds" rule are written once.
 */
function PickOneFilter({
  id,
  field,
  resetLabel,
  value,
  choices,
  onChange,
}: PickOneFilterProps) {
  const labelId = `${id}-label`;

  return (
    <div className="grid gap-2">
      <Label id={labelId} htmlFor={id}>
        {field}
      </Label>
      <Select
        value={value === '' ? '' : `${VALUE_PREFIX}${value}`}
        onValueChange={(chosen) => {
          onChange(
            chosen.startsWith(VALUE_PREFIX)
              ? chosen.slice(VALUE_PREFIX.length)
              : '',
          );
        }}
      >
        {/* The trigger takes the id its label points at, and is NAMED by that label
            rather than by the value it happens to be showing. */}
        <SelectTrigger id={id} aria-labelledby={labelId} className="w-full">
          <SelectValue placeholder={resetLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={RESET_CHOICE_VALUE}>{resetLabel}</SelectItem>
          {choices.map((choice) => (
            <SelectItem
              key={choice.value}
              value={`${VALUE_PREFIX}${choice.value}`}
            >
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface RequestNarrowingControlsProps {
  /** The WHOLE fetched set — what the filters offer their choices from. */
  requests: TransactionRead[];
  /** What the search box holds, which is not yet what is applied (it is debounced). */
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  /** What is currently applied, so each control shows its own chosen value. */
  narrowing: RequestNarrowing;
  onFilterChange: (field: PickOneFilterField, value: string) => void;
}

export function RequestNarrowingControls({
  requests,
  searchInput,
  onSearchInputChange,
  narrowing,
  onFilterChange,
}: RequestNarrowingControlsProps) {
  const statusChoices = useMemo(
    () => filterChoicesIn(requests, (request) => request.Status),
    [requests],
  );
  const fileChoices = useMemo(
    () => filterChoicesIn(requests, (request) => request.FileName),
    [requests],
  );
  const typeChoices = useMemo(
    () =>
      filterChoicesIn(
        requests,
        (request) => request.TransactionType,
        transactionTypeLabel,
      ),
    [requests],
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="grid gap-2">
        <Label htmlFor={SEARCH_INPUT_ID}>{SEARCH_LABEL}</Label>
        <Input
          id={SEARCH_INPUT_ID}
          type="search"
          autoComplete="off"
          placeholder={SEARCH_HINT}
          value={searchInput}
          onChange={(event) => {
            onSearchInputChange(event.target.value);
          }}
        />
      </div>

      <PickOneFilter
        id={STATUS_FILTER_ID}
        field={STATUS_FIELD_NAME}
        resetLabel={ANY_STATUS_LABEL}
        value={narrowing.status}
        choices={statusChoices}
        onChange={(value) => {
          onFilterChange('status', value);
        }}
      />

      <PickOneFilter
        id={FILE_FILTER_ID}
        field={FILE_FIELD_NAME}
        resetLabel={ANY_FILE_LABEL}
        value={narrowing.fileName}
        choices={fileChoices}
        onChange={(value) => {
          onFilterChange('fileName', value);
        }}
      />

      <PickOneFilter
        id={TYPE_FILTER_ID}
        field={TRANSACTION_TYPE_FIELD_NAME}
        resetLabel={ANY_TYPE_LABEL}
        value={narrowing.transactionType}
        choices={typeChoices}
        onChange={(value) => {
          onFilterChange('transactionType', value);
        }}
      />
    </div>
  );
}
