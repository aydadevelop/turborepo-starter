import type { InferInsertModel } from "drizzle-orm";

import { organization, user } from "../../../schema/auth";
import type { TestDatabase } from "../../index";
import { upsertFixtureById } from "./helpers";

export const createOrganizationFixture = (
	db: TestDatabase,
	values: InferInsertModel<typeof organization>,
): Promise<typeof organization.$inferSelect> =>
	upsertFixtureById<
		InferInsertModel<typeof organization>,
		typeof organization.$inferSelect
	>(db, organization, values);

export const createUserFixture = (
	db: TestDatabase,
	values: InferInsertModel<typeof user>,
): Promise<typeof user.$inferSelect> =>
	upsertFixtureById<InferInsertModel<typeof user>, typeof user.$inferSelect>(
		db,
		user,
		values,
	);
