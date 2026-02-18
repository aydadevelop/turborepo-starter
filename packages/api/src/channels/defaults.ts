import type { NotificationQueueProducer } from "../context";
import {
	AvitoInboundAdapter,
	AvitoOutboundAdapter,
	EmailInboundAdapter,
	EmailOutboundAdapter,
	SputnikInboundAdapter,
	SputnikOutboundAdapter,
	TelegramInboundAdapter,
	TelegramOutboundAdapter,
	WebInboundAdapter,
	WebOutboundAdapter,
} from "./adapters";
import { ChannelAdapterRegistry } from "./registry";
import { createTelegramQueueStrategy } from "./telegram-queue-strategy";

export interface ChannelRegistryConfig {
	telegramBotToken?: string;
	telegramApiBaseUrl?: string;
	/** When set, Telegram replies are queued for async delivery via the notification worker. */
	notificationQueue?: NotificationQueueProducer;
}

export const createChannelRegistry = (
	config: ChannelRegistryConfig = {}
): ChannelAdapterRegistry => {
	const registry = new ChannelAdapterRegistry();

	registry.registerOutbound(
		new TelegramOutboundAdapter({
			botToken: config.telegramBotToken,
			apiBaseUrl: config.telegramApiBaseUrl,
			queueStrategy: createTelegramQueueStrategy(config.notificationQueue),
		})
	);
	registry.registerOutbound(new EmailOutboundAdapter());
	registry.registerOutbound(new WebOutboundAdapter());
	registry.registerOutbound(new AvitoOutboundAdapter());
	registry.registerOutbound(new SputnikOutboundAdapter());

	registry.registerInbound(new TelegramInboundAdapter());
	registry.registerInbound(new EmailInboundAdapter());
	registry.registerInbound(new WebInboundAdapter());
	registry.registerInbound(new AvitoInboundAdapter());
	registry.registerInbound(new SputnikInboundAdapter());

	return registry;
};
