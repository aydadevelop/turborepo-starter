import { auth } from "@full-stack-cf-app/auth";
import { Hono } from "hono";

export const authRoutes = new Hono();

authRoutes.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
