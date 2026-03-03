import pg from "pg";

const DEFAULT_DATABASE_URL =
	"postgresql://postgres:postgres@localhost:5432/myapp";

const connectionString = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

const quote = (identifier: string) => `"${identifier}"`;

export const createDbClient = async (): Promise<pg.Client> => {
	const client = new pg.Client({ connectionString });
	await client.connect();
	return client;
};

/**
 * Delete all rows created by a test namespace.
 *
 * Seed data uses `seed_` prefixed IDs.  Test data uses its own namespace prefix
 * (e.g. `t_1_abc`) so the two never collide.  This function deletes by matching
 * the namespace in the `id` column (text columns) and in the `email` column for
 * the user table.
 */
export const cleanupNamespace = async (
	client: pg.Client,
	namespace: string
): Promise<void> => {
	const likePattern = `${namespace}%`;

	// Order matters — delete children before parents to respect FK constraints.
	const textIdTables = [
		"assistant_message",
		"assistant_chat",
		"notification_in_app",
		"notification_delivery",
		"notification_intent",
		"notification_event",
		"notification_preference",
		"user_consent",
		"invitation",
		"member",
		"account",
		"session",
		"organization",
	];

	for (const table of textIdTables) {
		await client.query(
			`DELETE FROM ${quote(table)} WHERE ${quote("id")} LIKE $1`,
			[likePattern]
		);
	}

	// user table — match by email (namespaced) or id
	await client.query(
		`DELETE FROM ${quote("user")} WHERE ${quote("email")} LIKE $1 OR ${quote("id")} LIKE $2`,
		[likePattern, likePattern]
	);

	// todo table — uses numeric IDs; look for metadata or text prefix
	await client.query(
		`DELETE FROM ${quote("todo")} WHERE ${quote("text")} LIKE $1`,
		[likePattern]
	);
};
