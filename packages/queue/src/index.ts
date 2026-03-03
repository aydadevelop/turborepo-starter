import { PgBoss } from "pg-boss";

let boss: PgBoss | undefined;

export const NOTIFICATION_QUEUE = "notification-queue";
export const RECURRING_TASK_QUEUE = "recurring-task-queue";

export function getBoss(): PgBoss {
	if (!boss) {
		const connectionString =
			process.env.DATABASE_URL ??
			"postgresql://postgres:postgres@localhost:5432/myapp";
		boss = new PgBoss({ connectionString });
	}
	return boss;
}

export async function startBoss(): Promise<PgBoss> {
	const b = getBoss();
	await b.start();
	return b;
}

export async function stopBoss(): Promise<void> {
	if (boss) {
		await boss.stop();
		boss = undefined;
	}
}
