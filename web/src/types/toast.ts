/**
 * Toast notification type definitions
 * Defines interfaces for the toast notification system
 */

/**
 * ToastVariant - Available toast notification variants
 */
export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

/**
 * ToastLink - somewhere a notification takes the user.
 *
 * A REAL link (an anchor), never a click handler on the notification's body: a
 * clickable non-link cannot be reached or operated by keyboard, which the project's
 * WCAG 2.2 AA bar forbids. So a notification that offers the user somewhere to go
 * carries this rather than `onClick`.
 */
export interface ToastLink {
  /** Where it goes, as one of the app's own addresses. */
  href: string;
  /** What the link reads as — wording that names the destination. */
  label: string;
}

/**
 * ToastAction - something a notification asks the user to DO, on the spot.
 *
 * The counterpart of {@link ToastLink}: a link offers somewhere to GO, this offers
 * something to DO where there is no address to go to (running the approvals a batch
 * could not submit again, for instance). It renders as a real `<button>` inside the
 * notification — in the tab order, announced as a control, operable by keyboard —
 * never as `onClick` on the notification's body, which is a clickable non-control and
 * unreachable without a pointer under this project's WCAG 2.2 AA bar.
 *
 * Taking the action dismisses the notification, exactly as following a link does: a
 * report still offering to act on something already acted on would misreport the
 * screen behind it.
 */
export interface ToastAction {
  /** What the control reads as — wording that names what taking it does. */
  label: string;
  /** What it does. The notification goes away as it is taken. */
  onAction: () => void;
}

/**
 * Toast - Individual toast notification object
 */
export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration?: number; // Duration in milliseconds (default: 5000; 0 never auto-dismisses)
  dismissible?: boolean; // Whether user can manually dismiss (default: true)
  onClick?: () => void; // Optional click handler for interactive toasts
  link?: ToastLink; // Optional destination the notification takes the user to
  action?: ToastAction; // Optional thing to DO from inside the notification
}

/**
 * ToastOptions - Options for creating a new toast
 * Used when calling showToast function
 */
export interface ToastOptions {
  variant: ToastVariant;
  title: string;
  message?: string;
  /**
   * How long it stays, in milliseconds. OMITTED takes `TOAST_DEFAULTS.DURATION`;
   * `0` means it never fades on its own, which is how a notification the user must
   * act on stays until they act on it or dismiss it (source UI-19).
   */
  duration?: number;
  dismissible?: boolean;
  onClick?: () => void;
  link?: ToastLink;
  /**
   * Something for the user to DO from inside the notification, as a real button.
   * Pair it with `duration: 0` — a notification carrying an action must not fade
   * while the user is deciding whether to take it.
   */
  action?: ToastAction;
}

/**
 * ToastContextValue - Context value for toast provider
 * Provides toast state and functions to child components
 */
export interface ToastContextValue {
  toasts: Toast[];
  showToast: (options: ToastOptions) => void;
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
}

/**
 * ToastProps - Props for individual Toast component
 */
export interface ToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

/**
 * ToastContainerProps - Props for ToastContainer component
 * Optional position configuration for future enhancement
 */
export interface ToastContainerProps {
  position?:
    | 'top-right'
    | 'top-left'
    | 'bottom-right'
    | 'bottom-left'
    | 'top-center'
    | 'bottom-center';
  maxToasts?: number; // Maximum number of toasts to display at once (default: 3)
}

/**
 * Default toast configuration values
 */
export const TOAST_DEFAULTS = {
  DURATION: 5000, // 5 seconds
  MAX_TOASTS: 3,
  POSITION: 'top-right' as const,
  DISMISSIBLE: true,
} as const;

/**
 * Toast variant configuration
 * Maps variants to their visual properties
 *
 * Token-based, like every other colour in the app: a tinted surface is the status
 * token at low opacity and the text is the token itself, so each variant follows the
 * app into its dark version instead of staying stuck in light-mode greens and reds
 * (styling-centralisation.md rules 1-5).
 */
export const TOAST_VARIANT_CONFIG = {
  success: {
    bgColor: 'bg-success/10',
    borderColor: 'border-success/40',
    textColor: 'text-foreground',
    iconColor: 'text-success',
  },
  error: {
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive/40',
    textColor: 'text-foreground',
    iconColor: 'text-destructive',
  },
  info: {
    bgColor: 'bg-info/10',
    borderColor: 'border-info/40',
    textColor: 'text-foreground',
    iconColor: 'text-info',
  },
  warning: {
    bgColor: 'bg-warning/10',
    borderColor: 'border-warning/40',
    textColor: 'text-foreground',
    iconColor: 'text-warning',
  },
} as const;
