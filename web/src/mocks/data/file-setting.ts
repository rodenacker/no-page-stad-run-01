/**
 * Project-wide entity factory: FileSetting.
 *
 * Single source of truth for canonical `FileSettingRead` VALUES (the shape lives
 * in the production module `src/types/files.ts` and is re-exported below).
 * Imported by BOTH test layers (Vitest via `@/mocks/data/file-setting`, Playwright
 * via a relative `../src/mocks/data/file-setting`) and by any runtime mock layer —
 * never re-declared in a test file.
 *
 * Shape anchored to `documentation/transactions-api.yaml` →
 * `components.schemas.FileSettingRead` / `FileSettingReadList`: exact field names
 * and PascalCase casing. `GET /v1/file-settings` returns
 * `{ FileSettings: FileSettingRead[] }` — build that body with
 * {@link fileSettingListResponse}, never by hand.
 *
 * Only READ is in this epic's scope (populate the upload picker);
 * `PUT /v1/file-settings/{SettingId}` is out of scope, so there is no write-shape
 * factory here.
 *
 * Import discipline (so the Playwright layer can import this without alias
 * plumbing): type-only imports, and sibling factories by relative path.
 */
import type { FileSettingRead, FileSettingReadList } from '../../types/files';

export type { FileSettingRead, FileSettingReadList };

/**
 * Canonical `FileSettingRead`. Defaults to the active monthly expense-import
 * setting; override any field.
 */
export const createFileSetting = (
  overrides: Partial<FileSettingRead> = {},
): FileSettingRead => ({
  Id: 11,
  Name: 'Monthly Expense Import',
  SourceName: 'Finance Shared Folder',
  TypeName: 'Expense CSV',
  IsActive: true,
  SourceId: 3,
  TypeId: 1,
  Direction: 'Import',
  ProcessDefinitionName: 'Expense File Validation',
  LastChangedUser: 'System',
  LastChangedDate: '2026-04-30 15:00:00',
  ...overrides,
});

/**
 * Two distinct ACTIVE settings — the picker must offer more than one, so a test
 * can prove the user really chose one rather than reading a lone default.
 * Names, sources and types all differ, so a selection can be asserted by name
 * without ambiguity.
 */
export const activeFileSettings = (): FileSettingRead[] => [
  createFileSetting(),
  createFileSetting({
    Id: 12,
    Name: 'Travel Claims Import',
    SourceName: 'Travel Desk Upload',
    TypeName: 'Travel Claim CSV',
    IsActive: true,
  }),
];

/** A retired setting — present in the raw list, but not offered in the picker. */
export const inactiveFileSetting = (): FileSettingRead =>
  createFileSetting({
    Id: 13,
    Name: 'Legacy Petty Cash Import',
    SourceName: 'Archive Folder',
    TypeName: 'Legacy CSV',
    IsActive: false,
  });

/**
 * The full list as the service returns it: both active settings plus one
 * inactive. Use this when the test is about the picker filtering `IsActive`;
 * use {@link activeFileSettings} when inactive settings are beside the point.
 */
export const allFileSettings = (): FileSettingRead[] => [
  ...activeFileSettings(),
  inactiveFileSetting(),
];

/**
 * `GET /v1/file-settings` response body. Defaults to {@link allFileSettings} so
 * the `IsActive` filter has something to filter; pass `[]` for the empty case.
 */
export const fileSettingListResponse = (
  settings: FileSettingRead[] = allFileSettings(),
): FileSettingReadList => ({ FileSettings: settings });
