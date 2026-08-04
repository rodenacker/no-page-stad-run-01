/**
 * Common Validation Schemas
 *
 * Zod schemas for validating user input across the application.
 * Provides type-safe validation with detailed error messages.
 */

import { z } from 'zod';

/**
 * Email validation schema
 * Validates email format and normalizes to lowercase
 */
export const emailSchema = z
  .string()
  .email('Invalid email address')
  .toLowerCase()
  .trim();

/**
 * Password validation schema
 * Requires minimum 8 characters with at least:
 * - One uppercase letter
 * - One lowercase letter
 * - One number
 * - One special character
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(
    /[^A-Za-z0-9]/,
    'Password must contain at least one special character',
  );

/**
 * Relaxed password schema for optional/less strict use cases
 * Only requires minimum length
 */
export const simplePasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters');

/**
 * The one message a sign-in form shows for a missing credential.
 *
 * It names both fields whichever one is missing (epic `sign-in-and-app-shell`
 * R4/R5) and is the wording the auth service itself uses for the same situation
 * (`documentation/auth-api.yaml` → `ErrorResponse` example), so the screen and the
 * service never contradict each other.
 */
export const REQUIRED_CREDENTIALS_MESSAGE =
  'Username and password are required.';

/**
 * Sign-in credentials (`documentation/auth-api.yaml` → `LoginRequest`).
 *
 * Presence is all that is checked here: the credential store owns what a valid
 * username or password looks like, and a frontend rule guessing at it would refuse
 * a real account. The username may be an email address in practice, so no
 * email-vs-username format rule either (epic brief §Notes & Caveats).
 */
export const signInSchema = z.object({
  username: z.string().trim().min(1, REQUIRED_CREDENTIALS_MESSAGE),
  password: z.string().min(1, REQUIRED_CREDENTIALS_MESSAGE),
});

export type SignInValues = z.infer<typeof signInSchema>;

/**
 * The one thing a user is told when the file they chose is not a CSV.
 *
 * The wording is the requirement's own (epic `expense-file-upload` R2/R7, source
 * F-05) and is deliberately about the file rather than about a field, because that
 * is what the user changed.
 */
export const CSV_ONLY_MESSAGE = 'Only CSV files can be uploaded.';

/** Asked for when no file setting has been chosen yet (BR1). */
export const FILE_SETTING_REQUIRED_MESSAGE =
  'Choose the file setting this file was prepared for.';

/** Asked for when no file has been chosen yet (BR1). */
export const FILE_REQUIRED_MESSAGE = 'Choose a CSV file to submit.';

/**
 * Whether a file's own name identifies a CSV.
 *
 * The check is on the NAME (`ExpenseFile.CurrentFileName`, epic
 * `expense-file-upload` R5) and NOT on the content type the browser reports: the
 * browser's guess depends on the operating system's file associations, so a
 * spreadsheet can arrive labelled `text/csv` and a genuine CSV as
 * `application/octet-stream`. The requirement is about the file name, so that is
 * what is checked.
 */
export const isCsvFileName = (fileName: string): boolean =>
  /\.csv$/i.test(fileName.trim());

/**
 * One expense-file submission (epic `expense-file-upload` BR1): a chosen setting,
 * and the chosen file's own name — which must identify a CSV.
 *
 * The file's BYTES are not modelled here. This schema is what decides whether the
 * submission may be sent at all, and every rule it expresses is about the two
 * values the user chose; the file itself is carried alongside them.
 *
 * `fileSettingId` is a string because that is what a listbox selection is; the
 * numeric `FileSettingId` the contract wants is resolved from the chosen setting.
 */
export const expenseFileSubmissionSchema = z.object({
  fileSettingId: z.string().min(1, FILE_SETTING_REQUIRED_MESSAGE),
  fileName: z
    .string()
    .min(1, FILE_REQUIRED_MESSAGE)
    .refine(isCsvFileName, CSV_ONLY_MESSAGE),
});

export type ExpenseFileSubmissionValues = z.infer<
  typeof expenseFileSubmissionSchema
>;

/**
 * User ID validation schema
 * Validates MongoDB ObjectId or UUID format
 */
export const userIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Invalid user ID format',
  );

/**
 * File upload validation schema
 * Validates file type and size
 */
export const fileUploadSchema = z.object({
  name: z.string().min(1, 'File name is required'),
  size: z.number().max(5 * 1024 * 1024, 'File size must be less than 5MB'), // 5MB limit
  type: z
    .string()
    .regex(
      /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/,
      'File type must be JPEG, PNG, GIF, WebP, or PDF',
    ),
});

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

/**
 * Search query schema
 */
export const searchSchema = z.object({
  q: z.string().min(1, 'Search query is required').max(200).trim(),
  filters: z.record(z.string(), z.string()).optional(),
});

/**
 * Generic form field validation
 */
export const formFieldSchemas = {
  name: z.string().min(1, 'Name is required').max(100).trim(),
  description: z.string().max(500).optional(),
  url: z.string().url('Invalid URL format').optional().or(z.literal('')),
  phoneNumber: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
    .optional()
    .or(z.literal('')),
  dateString: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
};

/**
 * Type-safe validation helper
 * Validates data against a schema and returns typed result
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validation result with success flag, data, and errors
 *
 * @example
 * ```ts
 * const result = validateRequest(paginationSchema, { page: '2', limit: '20' });
 * if (result.success) {
 *   // result.data is typed as { page: number, limit: number }
 *   console.log(result.data.page);
 * } else {
 *   console.error(result.errors);
 * }
 * ```
 */
export function validateRequest<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): { success: true; data: z.infer<T> } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    errors: result.error.issues.map((err: z.ZodIssue) => {
      const path = err.path.join('.');
      return path ? `${path}: ${err.message}` : err.message;
    }),
  };
}

/**
 * Async version of validateRequest for schemas with async refinements
 */
export async function validateRequestAsync<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): Promise<
  { success: true; data: z.infer<T> } | { success: false; errors: string[] }
> {
  const result = await schema.safeParseAsync(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    errors: result.error.issues.map((err: z.ZodIssue) => {
      const path = err.path.join('.');
      return path ? `${path}: ${err.message}` : err.message;
    }),
  };
}

/**
 * Sanitize HTML input to prevent XSS attacks
 * Strips HTML tags and dangerous characters
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"]/g, '') // Remove dangerous characters
    .trim();
}

/**
 * Create a schema with sanitization
 * Useful for text inputs that should not contain HTML
 */
export const sanitizedStringSchema = z.string().transform(sanitizeHtml);
