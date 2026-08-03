# Template Feedback

Append-only. One entry per template-level bug found while building this project.

## [template] Starter template hardcodes a single stale API base URL and a client-held-token auth path, in five places

- Symptom: the scaffold assumes one backend at `http://localhost:8042` and a `NEXT_PUBLIC_API_TOKEN` auth header. This project has two backend services and cookie-session auth (the template's own encouraged `bff` option), so five files had to be corrected in the first story of the first epic: `web/src/lib/utils/constants.ts` (`API_BASE_URL` default), `web/src/lib/api/client.ts` (`getAuthHeader()` / `requiresAuth`), `web/src/types/api.ts` (`requiresAuth` flag), `web/README.md`, and `web/scripts/setup-env.js` (fallback `.env.local` contents). Removing the stale constant also broke `tsc` (`TS2305` at `client.ts:16`) and the shipped `web/src/__tests__/integration/api-client.test.ts`, whose `requiresAuth flag` block asserted the browser-held-token behaviour that `authentication-intake.md` Rule 10 forbids for cookie-session projects — a shipped test asserting a forbidden path.
- Workaround applied: rewired the constants to same-origin API paths, replaced the client's `requiresAuth` token path with an optional `baseUrl` override for server-side calls, and rewrote the template test block to assert the cookie-session contract.
- Suggested fix: ship the API base URL as configuration-only with no literal default, and make the token/auth-header path opt-in scaffolding (or generated per auth method during INTAKE) rather than baked into `client.ts` + its shipped test. At minimum, keep the stale URL in one place instead of five.
- Affected: `web/src/lib/utils/constants.ts`, `web/src/lib/api/client.ts`, `web/src/types/api.ts`, `web/src/__tests__/integration/api-client.test.ts`, `web/README.md`, `web/scripts/setup-env.js`
