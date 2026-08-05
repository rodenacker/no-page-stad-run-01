'use client';

/**
 * The controls that narrow the expense request list: a free-text search box, three
 * pick-one filters — status, originating file and transaction type — and the two
 * two-bound ranges, amount and transaction date (brief R2/R3/R6/R7).
 *
 * Six things here are deliberate and easy to break:
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
 * - **Every range bound is a TYPEABLE field**, never a calendar popover on its own. The
 *   project's WCAG 2.2 AA keyboard-completability bar has to be evidenced against each of
 *   them, and a popover-only control can be neither completed from the keyboard nor
 *   filled by a browser test. A calendar affordance may be added *beside* a typeable
 *   field, never instead of it.
 * - **A bound holds exactly what was typed.** Nothing here corrects, swaps or blanks a
 *   value; what can be used as a bound — and whether the range it belongs to can be
 *   applied at all — is the narrowing layer's decision. `number` and `date` fields are
 *   what keep half-typed values out of it: the browser hands over a complete value or
 *   none.
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
  NarrowingField,
  RequestNarrowing,
} from '@/lib/transactions/narrowing';
import type { TransactionRead } from '@/types/transactions';

/** The search field's own wording — the label names what typing in it does. */
const SEARCH_LABEL = 'Search requests';
const SEARCH_HINT = 'Reference, description, file, amount or last 4 digits';

/**
 * Each bound's own wording. Each one names WHICH end of WHICH range it is, so the four
 * fields are told apart by their labels alone — by a screen reader as much as by a test.
 */
const MINIMUM_AMOUNT_LABEL = 'Minimum amount';
const MAXIMUM_AMOUNT_LABEL = 'Maximum amount';
const EARLIEST_DATE_LABEL = 'Earliest transaction date';
const LATEST_DATE_LABEL = 'Latest transaction date';

/**
 * Amounts are entered to the cent. Without a step, a browser refuses a decimal amount on
 * a `number` field, which would make the whole range unusable for the values this list
 * actually holds (9.99, 487.32).
 */
const AMOUNT_STEP = '0.01';

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

/** Stable ids, so each label and the control it names stay wired together. */
const SEARCH_INPUT_ID = 'expense-request-search';
const STATUS_FILTER_ID = 'expense-request-status-filter';
const FILE_FILTER_ID = 'expense-request-file-filter';
const TYPE_FILTER_ID = 'expense-request-type-filter';
const MINIMUM_AMOUNT_ID = 'expense-request-minimum-amount';
const MAXIMUM_AMOUNT_ID = 'expense-request-maximum-amount';
const EARLIEST_DATE_ID = 'expense-request-earliest-date';
const LATEST_DATE_ID = 'expense-request-latest-date';

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

interface BoundInputProps {
  /** The field's id; its label points at it, so the two cannot drift. */
  id: string;
  /** Which end of which range this is — the field's accessible name. */
  label: string;
  /**
   * `number` for an amount, `date` for a day. Either way the browser only ever hands
   * over a complete value, so nothing half-typed reaches the narrowing.
   */
  type: 'number' | 'date';
  /** Exactly what the user typed — never a corrected version of it. */
  value: string;
  onChange: (value: string) => void;
  /** Only meaningful for an amount: the smallest step the field accepts. */
  step?: string;
}

/**
 * One end of one range. All four are this same control, so the label wiring and the
 * "hold what was typed" rule are written once.
 */
function BoundInput({
  id,
  label,
  type,
  value,
  onChange,
  step,
}: BoundInputProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        step={step}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

interface RequestNarrowingControlsProps {
  /** The WHOLE fetched set — what the filters offer their choices from. */
  requests: TransactionRead[];
  /** What the search box holds, which is not yet what is applied (it is trimmed). */
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  /** What is currently applied, so each control shows its own chosen value. */
  narrowing: RequestNarrowing;
  /** The one channel every filter and every bound changes its own value through. */
  onFilterChange: (field: NarrowingField, value: string) => void;
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

      {/* The two ranges. Each end stands on its own: give one, the other, or both. */}
      <BoundInput
        id={MINIMUM_AMOUNT_ID}
        label={MINIMUM_AMOUNT_LABEL}
        type="number"
        step={AMOUNT_STEP}
        value={narrowing.minimumAmount}
        onChange={(value) => {
          onFilterChange('minimumAmount', value);
        }}
      />

      <BoundInput
        id={MAXIMUM_AMOUNT_ID}
        label={MAXIMUM_AMOUNT_LABEL}
        type="number"
        step={AMOUNT_STEP}
        value={narrowing.maximumAmount}
        onChange={(value) => {
          onFilterChange('maximumAmount', value);
        }}
      />

      <BoundInput
        id={EARLIEST_DATE_ID}
        label={EARLIEST_DATE_LABEL}
        type="date"
        value={narrowing.earliestDate}
        onChange={(value) => {
          onFilterChange('earliestDate', value);
        }}
      />

      <BoundInput
        id={LATEST_DATE_ID}
        label={LATEST_DATE_LABEL}
        type="date"
        value={narrowing.latestDate}
        onChange={(value) => {
          onFilterChange('latestDate', value);
        }}
      />
    </div>
  );
}
