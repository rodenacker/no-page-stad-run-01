/**
 * An account number as a list of expense payment requests may show it: its last four
 * digits, and nothing else in the markup.
 *
 * This is POPIA (project.md §Compliance), not formatting — so it lives in one place and
 * every surface that prints an account number uses it: the table row, a failed file's
 * rejected rows, and the opened request's panel before its reveal control is used. (The
 * phone-width listing prints no account number at all — a reader gets it by opening the
 * request, which is the strongest form this requirement can take.) The digits
 * themselves come from story 1's one masking helper (`lastFourDigitsOf`); nothing here
 * re-implements it.
 *
 * The dots are decoration a screen reader skips; what it reads instead says which four
 * digits these are. The full value is never rendered, never put in a `title` or `data-`
 * attribute, and never shipped to the browser's DOM in any other form — a value parked
 * in an attribute leaks exactly as surely as one printed in a cell.
 */
import { lastFourDigitsOf } from '@/lib/transactions/display';

/** Said when the service sent an account number with no digits in it at all. */
const NOT_AVAILABLE = 'Not available';

export function MaskedAccountNumber({
  accountNumber,
}: {
  accountNumber: string;
}) {
  const lastFour = lastFourDigitsOf(accountNumber);

  if (lastFour === '') {
    return <span className="text-muted-foreground">{NOT_AVAILABLE}</span>;
  }

  return (
    <span className="tabular-nums">
      <span aria-hidden="true">••••</span>
      <span className="sr-only">ending in </span>
      {lastFour}
    </span>
  );
}
