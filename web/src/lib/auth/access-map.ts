/**
 * The one place that says which addresses a role may open, and how the signed-in
 * landing screen offers them.
 *
 * Everything about "may this person open this screen?" is answered from this map:
 * the landing screen's entry points (hidden when a role excludes them, never shown
 * disabled — brief R10) and the in-page denial for a directly-typed address (R11,
 * R13) are the same seeded facts read from two sides, so the two can never disagree.
 *
 * CROSS-EPIC CONVENTION. A later epic that ships one of these screens attaches it
 * to its entry here — it adds a page that checks `canAccess()` before rendering —
 * rather than building a second gating mechanism of its own. Widening or narrowing
 * who may open an address is an edit to `allowedRoles` below, in one place.
 *
 * The addresses themselves are chosen here and are authoritative project-wide: the
 * source documents (`documentation/requirements-application.md` §6.5) name actions,
 * not URLs. Roles come from the §6.5 roles-×-resources matrix.
 *
 * EVERY REGISTERED ADDRESS NOW HAS A SCREEN. Addresses were registered before their
 * screens existed, so permission denial was real and testable from the first epic
 * onward; `/upload` (the expense files screen) and `/requests` (the shared expense
 * request list) have both since shipped.
 *
 * WHY EVERY ADDRESS ALLOWS BOTH ROLES. §6.5 grants both roles READ on `Transaction`
 * and `ExpenseFile`, and each address below is a screen someone READS. What only one
 * role may DO is checked inside the screen that offers it — submitting a file is the
 * Importer's alone, deciding on a request is the Approver's — never by withholding the
 * address, which would take the whole screen away from a role entitled to read it.
 * That is why the wording of each entry point describes the screen rather than
 * promising the visitor an action.
 *
 * A signed-in account whose roles this project does not recognise is still excluded
 * from everything by the same rule (`hasRole` grants nothing for an unknown name): it
 * is offered no entry point and any address answers it with the in-page denial.
 */
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';

import { hasRole, type RoleBearer } from './roles';

import type { ProjectRole } from '@/types/auth';

/** The signed-in landing screen: the one address both roles may open. */
export const LANDING_PATH = '/';

/** Submit an expense file, and the list of submitted files (ships with its own epic). */
export const UPLOAD_PATH = '/upload';

/**
 * One submitted file: its own values, its processing history, and what may be done to
 * it. Reached from a file's row in the list at {@link UPLOAD_PATH}, with the file
 * identified in the query (`?LogId=<id>`) — which is why its entry below carries no
 * entry-point copy: on its own, without a file, the address means nothing.
 */
export const SUBMITTED_FILE_PATH = '/upload/file';

/** The shared expense request list, where requests are reviewed and decided. */
export const REQUESTS_PATH = '/requests';

/** How the landing screen offers an address the current roles allow. */
export interface EntryPointCopy {
  /** What the entry point is called, in the user's words. */
  label: string;
  /** One line saying what the screen is for. */
  description: string;
}

/** One address, who may open it, and how it is offered. */
export interface AccessMapEntry {
  /** The address, exactly as the app routes it. */
  path: string;
  /**
   * The permission this address needs, named as the requirements name it (§6.5) —
   * this is the wording a denied user is shown, so it stays recognisable to
   * whoever grants access.
   */
  permission: string;
  /** Every role that may open the address; any other role may not. */
  allowedRoles: readonly ProjectRole[];
  /**
   * Present when the landing screen offers this address as an entry point. The
   * landing screen itself has none — it is where the entry points are offered.
   */
  entryPoint?: EntryPointCopy;
}

/**
 * Seeded from requirements §6.5: uploading a file belongs to the Finance Uploader
 * — the auth service's `Importer` role (`@/types/auth`) — and reviewing and
 * deciding (including bulk approval) to the Approver.
 */
export const ACCESS_MAP: readonly AccessMapEntry[] = [
  {
    path: LANDING_PATH,
    permission: 'View main dashboard',
    allowedRoles: [ROLE_IMPORTER, ROLE_APPROVER],
  },
  {
    /**
     * BOTH roles, deliberately: §6.5 grants `ExpenseFile` READ to the Approver as
     * well, so both roles open this address and watch the same file list (epic
     * `expense-file-upload` R9). Submitting a file is the Importer's alone (R8 —
     * the requirements' "Finance Uploader") and is a role check on the submit
     * control INSIDE the screen, not on the address — which is why the wording
     * below describes the screen rather than promising the visitor they may send
     * something.
     */
    path: UPLOAD_PATH,
    permission: 'Upload an expense file',
    allowedRoles: [ROLE_IMPORTER, ROLE_APPROVER],
    entryPoint: {
      label: 'Expense files',
      description:
        'See every expense file that has been sent for import and how each one is getting on. New CSV files of employee expense payment requests are submitted here too.',
    },
  },
  {
    /**
     * BOTH roles, deliberately: §6.5 grants `FileProcessLog` READ to the Finance
     * Uploader and the Approver alike, and epic `file-validation-and-retry` BR4 gives
     * a file's processing history to both. Retrying or cancelling a file is the
     * Importer's alone (BR3) and is a role check on those controls INSIDE the screen,
     * never on the address.
     *
     * NO `entryPoint`, deliberately: this screen is reached from a file's row, and both
     * the landing screen and the header navigation render exactly what the map offers —
     * so advertising it there would offer a screen that means nothing without a file.
     */
    path: SUBMITTED_FILE_PATH,
    permission: "Read a file's processing history",
    allowedRoles: [ROLE_IMPORTER, ROLE_APPROVER],
  },
  {
    /**
     * BOTH roles, deliberately: §6.5 grants `Transaction` READ to the Finance
     * Uploader as well as the Approver, and requirements R86/R87 give both of them
     * the request list and its export (brief R20). Recording a DECISION on a request
     * is the Approver's alone and is a role check inside that flow, not on this
     * address — so the permission named here is the read this screen actually needs,
     * and the wording below describes the screen rather than promising the visitor a
     * decision they may not make.
     */
    path: REQUESTS_PATH,
    permission: 'Read the expense requests',
    allowedRoles: [ROLE_IMPORTER, ROLE_APPROVER],
    entryPoint: {
      label: 'Expense requests',
      description:
        'See every imported employee expense payment request with its current status, and open one for the full detail. Account numbers show only their last four digits.',
    },
  },
] as const;

/**
 * The address without anything that does not select a screen — a query string, a
 * fragment, or a trailing slash — so `/upload?from=email` and `/upload/` are
 * recognised as the registered `/upload` rather than treated as unknown addresses.
 */
const addressOf = (path: string): string => {
  const withoutQuery = path.replace(/[?#].*$/, '');
  return withoutQuery.length > 1
    ? withoutQuery.replace(/\/+$/, '')
    : withoutQuery;
};

/** The map entry for an address, or `undefined` when it is not registered. */
export const accessEntryFor = (path: string): AccessMapEntry | undefined => {
  const address = addressOf(path);
  return ACCESS_MAP.find((entry) => entry.path === address);
};

/**
 * Whether the roles on the CURRENT session may open the address (brief BR3 — the
 * roles are read from the identity resolved for this navigation, never cached).
 *
 * An address that is not registered grants nothing: a new screen becomes reachable
 * by being added to the map above, never by being missing from it.
 */
export const canAccess = (session: RoleBearer, path: string): boolean => {
  const entry = accessEntryFor(path);
  return (
    entry !== undefined &&
    entry.allowedRoles.some((role) => hasRole(session, role))
  );
};

/** An entry point as the landing screen renders it: one link, one description. */
export interface OfferedEntryPoint extends EntryPointCopy {
  /** Where the link goes. */
  path: string;
}

/**
 * The entry points to offer this session, in map order. An entry point the roles
 * exclude is simply not in the list — that is what makes it absent from the screen
 * rather than present and disabled (R10).
 */
export const entryPointsFor = (session: RoleBearer): OfferedEntryPoint[] =>
  ACCESS_MAP.reduce<OfferedEntryPoint[]>((offered, entry) => {
    if (entry.entryPoint && canAccess(session, entry.path)) {
      offered.push({ path: entry.path, ...entry.entryPoint });
    }
    return offered;
  }, []);
