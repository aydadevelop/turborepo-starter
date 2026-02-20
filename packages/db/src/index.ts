import { env } from "@my-app/env/server";
import { drizzle } from "drizzle-orm/d1";

import { relations } from "./relations";
import * as schema from "./schema";

export const db = drizzle(env.DB, { schema, relations });
