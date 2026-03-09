import type { DomainEvent } from "./types";

export interface QueueProducer {
	send(message: unknown, options?: { delaySeconds?: number }): Promise<void>;
}

type EventPusher = (event: DomainEvent, queue?: QueueProducer) => Promise<void>;
const pushers: EventPusher[] = [];

export const registerEventPusher = (pusher: EventPusher): void => {
	pushers.push(pusher);
};

export const clearEventPushers = (): void => {
	pushers.length = 0;
};

export const emitDomainEvent = async (event: DomainEvent, queue?: QueueProducer): Promise<void> => {
	await Promise.allSettled(pushers.map((p) => p(event, queue)));
};

export class EventBus {
	constructor(private readonly queue?: QueueProducer) {}

	async emit(event: DomainEvent): Promise<void> {
		await emitDomainEvent(event, this.queue);
	}
}
