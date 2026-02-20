/** Base path prefix — reads from BASE_PATH env var, empty when not set. */
const basePath = process.env.BASE_PATH ?? "";

/** Prepend optional base path to route, e.g. url("/login") -> "/web/login" when BASE_PATH="/web". */
export const url = (route: string): string => `${basePath}${route}`;
