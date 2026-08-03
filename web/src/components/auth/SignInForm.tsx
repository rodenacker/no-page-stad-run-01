'use client';

/**
 * The sign-in form: two required fields, one submit, and one place errors appear.
 *
 * Three behaviours are deliberate and easy to break (epic
 * `sign-in-and-app-shell` R4–R12, R18):
 *
 * - WHEN things are reported. A missing field is reported when the user leaves it,
 *   a refused credential when they submit, and nothing at all while they are still
 *   typing (R6) — hence `onBlur` for both the first check and re-checks.
 * - WHAT a refusal says. The auth service's own wording is shown as given, in one
 *   place, and the app never adds a hint about which field was wrong, nor a failed-
 *   attempt count of its own: the service owns lockout (R12, R18).
 * - WHERE the call is made. The browser posts to the app's own address, so the
 *   session cookie the auth service sets reaches the browser (BR2). Not a Server
 *   Action.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { signIn, signInFailureMessage } from '@/lib/auth/signInApi';
import { SIGNED_IN_HOME_ROUTE } from '@/lib/utils/constants';
import { signInSchema, type SignInValues } from '@/lib/validation/schemas';

const EMPTY_CREDENTIALS: SignInValues = { username: '', password: '' };

/** The asterisk that marks a required field; the legend below explains it once. */
const RequiredMarker = () => <span aria-hidden="true">*</span>;

export function SignInForm() {
  const router = useRouter();
  const [refusal, setRefusal] = useState<string | null>(null);

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    // Presence is checked when the user leaves a field, and re-checked the same way
    // afterwards — never on a keystroke, not even once the form has been submitted
    // (R6). `reValidateMode` is what keeps that true after the first submission.
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: EMPTY_CREDENTIALS,
  });

  const onSubmit = async (values: SignInValues): Promise<void> => {
    setRefusal(null);
    try {
      await signIn(values);
      router.replace(SIGNED_IN_HOME_ROUTE);
      // The signed-in screens are server-rendered behind the session gate, so the
      // navigation must resolve against the session that was just established
      // rather than anything the router already held.
      router.refresh();
    } catch (error) {
      setRefusal(signInFailureMessage(error));
      // The user re-enters both, so neither value is kept (R12), and the cursor
      // goes back to the first field so re-entry needs no reach for the mouse.
      form.reset(EMPTY_CREDENTIALS);
      form.setFocus('username');
    }
  };

  return (
    <Form {...form}>
      <form
        // The app's own messages are the only ones shown: the browser's native
        // validation bubbles would otherwise pre-empt them, and they cannot be
        // worded to satisfy R4/R5.
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-6"
      >
        {refusal !== null && (
          <div
            role="alert"
            className="border-destructive text-destructive flex items-start gap-2 rounded-md border p-3 text-sm"
          >
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            {/* The service's wording, as given: no field-specific hint added, no
                attempt count, and shown here only — never also toasted, which would
                announce it to a screen reader twice. */}
            <span>{refusal}</span>
          </div>
        )}

        <p className="text-muted-foreground text-sm">
          <RequiredMarker /> indicates a required field
        </p>

        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Username <RequiredMarker />
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                  autoComplete="username"
                  // The first editable field holds focus when the form opens (R8).
                  autoFocus
                  required
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Password <RequiredMarker />
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </Form>
  );
}
