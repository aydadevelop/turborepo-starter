import type { PgBoss, SendOptions } from "pg-boss";
import { startBoss } from "./index";

export interface QueueProducer {
	send(message: unknown, options?: { delaySeconds?: number }): Promise<void>;
}

let bossReady: Promise<PgBoss> | undefined;

function ensureBoss(): Promise<PgBoss> {
	if (!bossReady) {
		bossReady = startBoss();
	}
	return bossReady;
}

export function createPgBossProducer(queueName: string): QueueProducer {
	return {
		async send(message, options) {
			const boss = await ensureBoss();
			const sendOptions: SendOptions = options?.delaySeconds
				? { startAfter: options.delaySeconds }
				: {};
			await boss.send(queueName, message as object, sendOptions);
		},
	};
}
