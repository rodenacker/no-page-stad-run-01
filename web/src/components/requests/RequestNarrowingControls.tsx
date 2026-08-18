'use client';

/**
 * The controls that narrow the expense request list, as ONE RULED STRIP of underlined
 * fields: a free-text search box, three pick-one filters — status, originating file and
 * transaction type — and the two two-bound ranges, amount and transaction date
 * (`expense-request-list` R2/R3/R6/R7; `request-list-redesign` R12/BR6).
 *
 * Nine things here are deliberate and easy to break:
 *
 * - **The eight controls live inside exactly ONE grouping element that says what it
 *   does** — a `<fieldset>` named natively by its `<legend>` ({@link
 *   NARROWING_STRIP_LABEL}). "Reads as one ruled strip" is a visual claim, and this is
 *   its only non-CSS half: the accessibility tree is where "these fields are one thing"
 *   is observable. A second group over a subset of the fields, or a field that escapes
 *   the fieldset, breaks the contract even if every control still works.
 * - **The fields are marked by an UNDERLINE and nothing else** (R12/BR6): no border box,
 *   no filled input surface, no rounded corner. The strip's own rules and each field's
 *   underline are the whole notation.
 * - **⚠ Every underline is `--input`, never `--border`.** `--input` is deliberately the
 *   darker of the two precisely so a field's outline clears 3:1 against the ground (WCAG
 *   1.4.11, project convention). An underline is now the ONLY thing marking a field, so
 *   swapping in `--border` is an accessibility regression that looks like a styling
 *   preference. The Shadcn primitives already default to `border-input`; what is
 *   overridden below is the border's WIDTH and RADIUS, never its colour.
 * - **The labels are tracked micro-labels, upper-cased in CSS rather than in the DOM.**
 *   So the words a screen reader is given read as words, the wording stays exactly what
 *   the app already owns (`lib/transactions/narrowing.ts`'s field names and the bound
 *   labels below), and the notation belongs to the presentation. Never rewrite a label to
 *   `MIN` in the markup to get the look.
 * - **⚠ A range the wrong way round is reported HERE, in the strip, as a `role="alert"`
 *   line — never as a box and never as a toast.** The border that used to carry that
 *   error state is gone with the boxes, so the error's new home in the notation is a
 *   destructive, heavier RULE on the two bounds of that range plus this in-place message.
 *   The reports are handed in rather than derived here, from the same value the rows and
 *   the applied summary read, so the screen can never report a range it is quietly
 *   applying — or apply one it says it has not.
 * - **The choices are the values PRESENT in the fetched requests**, computed from the
 *   whole fetched set (not from what is currently listed, which would make a filter
 *   unable to offer its way back). The service owns each of these vocabularies, so
 *   there is no accepted-value list to check against and nothing it sent may be
 *   missing (brief §Notes & Caveats — a user-confirmed decision at INTAKE).
 * - **A transaction type is offered under the same wording the table cell uses**, from
 *   the one helper in `lib/transactions/display.ts`. A value the app has no wording for
 *   is offered exactly as the service sent it and is a legitimate choice, never an
 *   error.
 * - **Each filter is a Shadcn `select` (Radix), never a native `<select>`**, and each
 *   trigger is named for the FIELD it narrows by through `aria-labelledby` pointing at
 *   its visible label. The native option list is drawn by the operating system, so the
 *   project's WCAG 2.2 AA keyboard-completability bar cannot be evidenced against it; and
 *   a Radix trigger is a button, so its accessible name would otherwise be whatever it
 *   currently displays — the value, not the field.
 * - **Every range bound is a TYPEABLE field holding exactly what was typed.** Never a
 *   calendar popover on its own: the keyboard-completability bar has to be evidenced
 *   against each of them, and a popover-only control can be neither completed from the
 *   keyboard nor filled by a browser test (a calendar affordance may sit BESIDE a typeable
 *   field, never instead of it). Nothing here corrects, swaps or blanks a value — what can
 *   be used as a bound, and whether the range it belongs to can be applied at all, is the
 *   narrowing layer's decision.
 *
 * The strip runs full-bleed to the layout's padding, exactly as the control block above
 * it does: `-mx-4` cancels `<main>`'s `px-4` and the strip re-applies it, so its rules
 * reach the edge of the page while its labels line up with the app's name in the header
 * and with the rows beneath it. Change that layout value and this changes with it.
 */

import { useMemo } from 'react';

import {
  FIELD_LABEL_CLASS,
  RULED_FIELD_CLASS,
} from '@/components/requests/fieldNotation';
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

import type { ReactNode } from 'react';

import type {
  FilterChoice,
  NarrowingField,
  RangeReport,
  RequestNarrowing,
} from '@/lib/transactions/narrowing';
import type { TransactionRead } from '@/types/transactions';

/**
 * What the strip itself is called — the one grouping every narrowing field sits inside,
 * and the words its `<legend>` carries. It says what the fields DO, because that is what
 * a reader arriving at the group needs to know before reading eight labels.
 */
export const NARROWING_STRIP_LABEL = 'Narrow the batch';

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

/**
 * The ids `rangeReports()` gives its two entries (`lib/transactions/narrowing.ts`). They
 * are matched here so the bounds of the range being reported carry the error in the
 * notation — the destructive, heavier underline — and are described by the report itself.
 * Two ranges, two ids: a third range added there needs its bounds wiring up here.
 */
const AMOUNT_RANGE_REPORT_ID = 'amountRange';
const DATE_RANGE_REPORT_ID = 'dateRange';

/** Ties a reported range to the two bound fields it is about (`aria-describedby`). */
const reportElementId = (reportId: string): string =>
  `expense-request-narrowing-report-${reportId}`;

/**
 * A field in this strip: the shared ruled notation (`fieldNotation.ts` — an underline and
 * nothing else, with the primitive's own `border-input` COLOUR deliberately left alone,
 * see the ⚠ in this file's header), sized to fill its column.
 *
 * The notation itself is imported rather than restated: the foot's requests-per-page field
 * wears the same one, and two copies of the string is how the underline on one of them
 * quietly drifts from the others.
 */
const UNDERLINED_FIELD_CLASS = `${RULED_FIELD_CLASS} h-9 w-full text-sm`;

/** A figure or a date is fixed-field notation: mono, and tabular so bounds line up. */
const FIGURE_FIELD_CLASS = 'font-mono tabular-nums';

/**
 * A range the wrong way round: the two bounds of that range carry a destructive underline
 * at double weight. The weight is what survives being read by someone who cannot tell the
 * colours apart; the message below the fields is what says WHY.
 */
const REPORTED_BOUND_CLASS =
  'aria-invalid:border-b-2 aria-invalid:border-destructive';

/**
 * How wide each kind of field sits before the strip's line wraps onto the next one — the
 * search field the widest, since it is the only one holding prose. Each states a basis AND
 * the same value as a minimum: the basis is what decides where the line wraps, the minimum
 * is what stops a field being squeezed narrower than its own values (a date bound has to
 * hold `2026-04-30` and its calendar affordance). Wrapping, never sideways scrolling — the
 * strip has to hold at 360px (R4).
 */
const SEARCH_WIDTH_CLASS = 'min-w-56 grow-[2] basis-56';
const FILTER_WIDTH_CLASS = 'min-w-40 grow basis-40';
const BOUND_WIDTH_CLASS = 'min-w-36 grow basis-36';

/** One field in the strip: its micro-label over the underlined control itself. */
function StripField({
  width,
  children,
}: {
  /** How much of the strip's line this field takes before the row wraps. */
  width: string;
  children: ReactNode;
}) {
  return <div className={`grid gap-1.5 ${width}`}>{children}</div>;
}

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
 * choice, the underline notation and the "offer what the data holds" rule are written
 * once.
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
    <StripField width={FILTER_WIDTH_CLASS}>
      <Label
        id={labelId}
        htmlFor={id}
        className={`${FIELD_LABEL_CLASS} text-muted-foreground`}
      >
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
        <SelectTrigger
          id={id}
          aria-labelledby={labelId}
          className={`${UNDERLINED_FIELD_CLASS} justify-between`}
        >
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
    </StripField>
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
  /**
   * The report about the range this bound belongs to, while it is the wrong way round.
   * Present means the underline carries the error and this field is described by the
   * message; `undefined` is the ordinary case.
   */
  report?: RangeReport;
}

/**
 * One end of one range. All four are this same control, so the label wiring, the
 * underline notation, the "hold what was typed" rule and the reported-range treatment are
 * written once.
 */
function BoundInput({
  id,
  label,
  type,
  value,
  onChange,
  step,
  report,
}: BoundInputProps) {
  return (
    <StripField width={BOUND_WIDTH_CLASS}>
      <Label
        htmlFor={id}
        className={`${FIELD_LABEL_CLASS} text-muted-foreground`}
      >
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        step={step}
        autoComplete="off"
        value={value}
        // The bound is not invalid in itself — the RANGE is the wrong way round — but
        // this is the field the reader has to change, and the report it points at is
        // what says which way round it should be.
        aria-invalid={report !== undefined}
        aria-describedby={
          report === undefined ? undefined : reportElementId(report.id)
        }
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className={`${UNDERLINED_FIELD_CLASS} ${FIGURE_FIELD_CLASS} ${REPORTED_BOUND_CLASS}`}
      />
    </StripField>
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
  /**
   * The ranges entered the wrong way round, from `rangeReports()` — read by the caller
   * off the same narrowing the rows and the applied summary are drawn from, so the strip
   * cannot report a range the list is quietly applying. Empty in the ordinary case.
   */
  rangeReports: RangeReport[];
}

export function RequestNarrowingControls({
  requests,
  searchInput,
  onSearchInputChange,
  narrowing,
  onFilterChange,
  rangeReports,
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

  /** Which of the two ranges is being reported, if either. */
  const amountReport = rangeReports.find(
    (report) => report.id === AMOUNT_RANGE_REPORT_ID,
  );
  const dateReport = rangeReports.find(
    (report) => report.id === DATE_RANGE_REPORT_ID,
  );

  return (
    /* ONE group, named for what it does — see the first ⚠ in this file's header. The
       rule at the foot is the strip's own; each field carries the other one. */
    <fieldset className="border-input -mx-4 border-b px-4 pb-4">
      <legend className={`${FIELD_LABEL_CLASS} text-muted-foreground mb-3 p-0`}>
        {NARROWING_STRIP_LABEL}
      </legend>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <StripField width={SEARCH_WIDTH_CLASS}>
          <Label
            htmlFor={SEARCH_INPUT_ID}
            className={`${FIELD_LABEL_CLASS} text-muted-foreground`}
          >
            {SEARCH_LABEL}
          </Label>
          <Input
            id={SEARCH_INPUT_ID}
            type="search"
            autoComplete="off"
            placeholder={SEARCH_HINT}
            value={searchInput}
            onChange={(event) => {
              onSearchInputChange(event.target.value);
            }}
            className={UNDERLINED_FIELD_CLASS}
          />
        </StripField>

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
          report={amountReport}
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
          report={amountReport}
        />

        <BoundInput
          id={EARLIEST_DATE_ID}
          label={EARLIEST_DATE_LABEL}
          type="date"
          value={narrowing.earliestDate}
          onChange={(value) => {
            onFilterChange('earliestDate', value);
          }}
          report={dateReport}
        />

        <BoundInput
          id={LATEST_DATE_ID}
          label={LATEST_DATE_LABEL}
          type="date"
          value={narrowing.latestDate}
          onChange={(value) => {
            onFilterChange('latestDate', value);
          }}
          report={dateReport}
        />
      </div>

      {/* A range the wrong way round, reported IN PLACE and applied nowhere: the list
          stays exactly as it was, which is the whole point. One announced line per range,
          in the strip's own notation — no box around it (the boxes are what this story
          removed) and never a toast, which would take the report away from the fields it
          is about. */}
      {rangeReports.length > 0 && (
        <div className="mt-4 grid gap-1">
          {rangeReports.map((report) => (
            <p
              key={report.id}
              id={reportElementId(report.id)}
              role="alert"
              className="text-destructive flex flex-wrap items-baseline gap-x-2 text-sm"
            >
              <span className={FIELD_LABEL_CLASS}>{report.field}</span>
              <span>{report.message}</span>
            </p>
          ))}
        </div>
      )}
    </fieldset>
  );
}
