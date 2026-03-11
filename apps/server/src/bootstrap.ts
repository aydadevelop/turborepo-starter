import { db } from "@my-app/db";
import { env } from "@my-app/env/server";
import {
	GoogleCalendarAdapter,
	registerBookingLifecycleSync,
	registerCalendarAdapter,
} from "@my-app/calendar";
import { registerNotificationEventPusher } from "@my-app/notifications/events-bridge";
import {
	configurePaymentWebhookAdaptersFromEnv,
	createCloudPaymentsPaymentProvider,
	registerPaymentProvider,
} from "@my-app/payment";

let integrationsRegistered = false;

const parseGoogleServiceAccountKey = (): Record<string, unknown> => {
	try {
		return JSON.parse(
			process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "{}",
		) as Record<string, unknown>;
	} catch {
		return {};
	}
};

export const registerServerIntegrations = (): void => {
	if (integrationsRegistered) {
		return;
	}

	registerCalendarAdapter(
		"google",
		new GoogleCalendarAdapter(parseGoogleServiceAccountKey()),
	);
	registerBookingLifecycleSync(db);
	registerNotificationEventPusher(undefined, db);
	registerPaymentProvider(createCloudPaymentsPaymentProvider());
	configurePaymentWebhookAdaptersFromEnv({
		CLOUDPAYMENTS_PUBLIC_ID: env.CLOUDPAYMENTS_PUBLIC_ID,
		CLOUDPAYMENTS_API_SECRET: env.CLOUDPAYMENTS_API_SECRET,
	});

	integrationsRegistered = true;
};
