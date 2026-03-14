import type { DomainEvent } from "./types";

type EventPusher = (event: DomainEvent) => Promise<void>;
const pushers: EventPusher[] = [];

export const registerEventPusher = (pusher: EventPusher): void => {
	pushers.push(pusher);
};

export const clearEventPushers = (): void => {
	pushers.length = 0;
};

export const emitDomainEvent = async (event: DomainEvent): Promise<void> => {
	await Promise.allSettled(pushers.map((p) => p(event)));
};

export class EventBus {
	async emit(event: DomainEvent): Promise<void> {
		await emitDomainEvent(event);
	}
}
