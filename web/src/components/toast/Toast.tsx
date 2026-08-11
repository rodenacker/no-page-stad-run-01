'use client';

/**
 * Toast - Individual toast notification component
 * Provides feedback for operations with success, error, info, and warning variants
 * Auto-dismisses after specified duration and supports manual dismissal
 *
 * Every colour here comes from the theme tokens (`text-success`, `text-destructive`,
 * `bg-card`, …) rather than a fixed palette value, so a toast follows the app into its
 * dark version like everything else does (styling-centralisation.md rules 1-5).
 *
 * A notification can also offer somewhere to GO (`toast.link`), and that is a real
 * anchor rather than a click handler on the notification's body: a clickable non-link
 * is not in the tab order, is not announced as a destination, and cannot be opened in
 * a new tab — which the project's WCAG 2.2 AA bar does not allow for something the
 * user is expected to act on. Following it dismisses the notification, because acting
 * on it is one of the two ways it goes away (the other being the dismiss control).
 *
 * A `duration` of 0 (or none at all on the toast object) is a notification that never
 * fades: what the user must act on stays until they do (source UI-19).
 */

import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { ToastProps } from '@/types/toast';

export function Toast({ toast, onDismiss }: ToastProps) {
  // Auto-dismiss after duration
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(toast.id);
      }, toast.duration);

      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onDismiss]);

  // Icon component based on variant
  const getIcon = () => {
    switch (toast.variant) {
      case 'success':
        return (
          <svg
            className="w-5 h-5 text-success"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
              clipRule="evenodd"
            />
          </svg>
        );
      case 'error':
        return (
          <svg
            className="w-5 h-5 text-destructive"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
              clipRule="evenodd"
            />
          </svg>
        );
      case 'warning':
        return (
          <svg
            className="w-5 h-5 text-warning"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        );
      case 'info':
        return (
          <svg
            className="w-5 h-5 text-info"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
              clipRule="evenodd"
            />
          </svg>
        );
    }
  };

  // Border color based on variant
  const getBorderColor = () => {
    switch (toast.variant) {
      case 'success':
        return 'border-success';
      case 'error':
        return 'border-destructive';
      case 'warning':
        return 'border-warning';
      case 'info':
        return 'border-info';
    }
  };

  // ARIA role based on variant
  const getAriaRole = () => {
    return toast.variant === 'error' ? 'alert' : 'status';
  };

  // ARIA live based on variant
  const getAriaLive = () => {
    return toast.variant === 'error' ? 'assertive' : 'polite';
  };

  const handleToastClick = () => {
    if (toast.onClick) {
      toast.onClick();
      onDismiss(toast.id);
    }
  };

  return (
    <div
      className={`
        bg-card text-card-foreground rounded-lg shadow-lg border-l-4 ${getBorderColor()} p-4
        flex items-start gap-3 pointer-events-auto
        animate-in slide-in-from-right fade-in duration-300
        ${toast.onClick ? 'cursor-pointer hover:shadow-xl transition-shadow' : ''}
      `}
      role={getAriaRole()}
      aria-live={getAriaLive()}
      aria-atomic="true"
      onClick={toast.onClick ? handleToastClick : undefined}
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.message && (
          <p className="text-muted-foreground text-sm mt-1">{toast.message}</p>
        )}
        {toast.link && (
          <Button asChild variant="outline" size="sm" className="mt-3">
            {/* A real link, so it can be tabbed to, announced as somewhere to go and
                opened in a new tab. Following it is acting on the notification, so
                the notification goes with it. */}
            <Link
              href={toast.link.href}
              onClick={() => {
                onDismiss(toast.id);
              }}
            >
              {toast.link.label}
            </Link>
          </Button>
        )}
      </div>

      {/* Dismiss Button */}
      {toast.dismissible !== false && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(toast.id);
          }}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex-shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="Dismiss notification"
        >
          <svg
            className="w-5 h-5"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      )}
    </div>
  );
}
