import type { SupportMessageChannel } from "@full-stack-cf-app/db/schema/support";
import type {
	ChannelRegistry,
	InboundChannelAdapter,
	OutboundChannelAdapter,
} from "./types";

export class ChannelAdapterRegistry implements ChannelRegistry {
	private readonly outbound = new Map<
		SupportMessageChannel,
		OutboundChannelAdapter
	>();

	private readonly inbound = new Map<
		SupportMessageChannel,
		InboundChannelAdapter
	>();

	registerOutbound(adapter: OutboundChannelAdapter): void {
		this.outbound.set(adapter.channel, adapter);
	}

	registerInbound(adapter: InboundChannelAdapter): void {
		this.inbound.set(adapter.channel, adapter);
	}

	getOutboundAdapter(
		channel: SupportMessageChannel
	): OutboundChannelAdapter | null {
		return this.outbound.get(channel) ?? null;
	}

	getInboundAdapter(
		channel: SupportMessageChannel
	): InboundChannelAdapter | null {
		return this.inbound.get(channel) ?? null;
	}

	listOutboundChannels(): SupportMessageChannel[] {
		return [...this.outbound.keys()];
	}

	listInboundChannels(): SupportMessageChannel[] {
		return [...this.inbound.keys()];
	}
}
