/** Base path prefix — reads from BASE_PATH env var, empty when not set. */
const basePath = process.env.BASE_PATH ?? "";

/** Prepend the optional base path to a route, e.g. url("/login") → "/web/login" when BASE_PATH="/web". */
export const url = (path: string): string => `${basePath}${path}`;
