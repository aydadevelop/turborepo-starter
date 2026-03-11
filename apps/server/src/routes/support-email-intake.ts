import { internalServerRouteProcedures } from "@my-app/api/handlers/internal/server-routes";
import { createProcedureClient } from "@orpc/server";
import { Hono } from "hono";

export const supportEmailIntakeRoutes = new Hono();
const processSupportEmailIntakeProcedureClient = createProcedureClient(
	internalServerRouteProcedures.support.emailIntakeProcess
);

supportEmailIntakeRoutes.post("/api/support/inbound/email", async (c) => {
	const result = await processSupportEmailIntakeProcedureClient({
		request: c.req.raw,
	});
	return c.json(result.body, result.status);
});
