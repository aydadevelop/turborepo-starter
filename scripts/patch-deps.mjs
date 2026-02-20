/**
 * postinstall script – previously patched Set-Cookie header bugs in better-call
 * and alchemy. Both issues are now fixed upstream:
 *
 * - alchemy ≥ 0.83.3 fixes writeMiniflareResponseToNode() to use appendHeader()
 *   for each Set-Cookie header so multiple cookies aren't overwritten.
 *   See: https://github.com/alchemy-run/alchemy/releases/tag/v0.83.3
 *
 * - The Hono auth route handler in apps/server/src/routes/auth.ts now splits
 *   combined Set-Cookie strings using splitSetCookies() before the response
 *   leaves the worker, so browsers receive separate Set-Cookie headers.
 *
 * This script is kept as a no-op in case future dependency upgrades reintroduce
 * the issue. Add patches back here if needed.
 */

console.log("postinstall patches: 0 applied, 0 skipped (no patches needed)");
