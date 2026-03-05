import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () =>
	new Response(JSON.stringify({ ok: true }), {
		headers: { "content-type": "application/json" },
	});
