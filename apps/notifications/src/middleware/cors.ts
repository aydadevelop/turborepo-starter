import { createPrivateAppCorsOptions } from "@my-app/env/cors";
import { env } from "@my-app/env/server";
import { cors } from "hono/cors";

export const corsMiddleware = cors(createPrivateAppCorsOptions(env.CORS_ORIGIN));
