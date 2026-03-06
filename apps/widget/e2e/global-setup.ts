import { bootstrapLocalE2EDatabase } from "../../../packages/db/scripts/bootstrap-local-e2e.mjs";
import { upsertContaktlyWidgetConfig } from "../../../packages/db/scripts/upsert-contaktly-widget-config.mjs";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const isLocalUrl = (value: string): boolean => {
	try {
		const parsed = new URL(value);
		return LOCAL_HOSTNAMES.has(parsed.hostname);
	} catch {
		return false;
	}
};

export default async function globalSetup(): Promise<void> {
	if (process.env.PLAYWRIGHT_SKIP_SEED === "1") {
		console.log(
			"[widget:e2e:global-setup] Skipping DB seed (PLAYWRIGHT_SKIP_SEED=1)"
		);
		return;
	}

	const widgetURL = process.env.PLAYWRIGHT_WIDGET_URL;
	if (widgetURL && !isLocalUrl(widgetURL)) {
		console.log(
			`[widget:e2e:global-setup] Skipping DB seed for remote widget URL (${widgetURL})`
		);
		return;
	}

	const anchorDate = process.env.PLAYWRIGHT_SEED_ANCHOR_DATE ?? "2026-03-15";
	await bootstrapLocalE2EDatabase({ anchorDate });
	await upsertContaktlyWidgetConfig({
		configId: "ctly-demo-founder-booking-url",
		bookingUrl: "https://calendly.com/demo-team/intro",
		allowedDomains: ["localhost", "127.0.0.1"],
	});
}
