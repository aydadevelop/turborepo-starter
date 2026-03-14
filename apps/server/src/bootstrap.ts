import path from "node:path";
import {
	GoogleCalendarAdapter,
	registerBookingLifecycleSync,
	registerCalendarAdapter,
} from "@my-app/calendar";
import { db } from "@my-app/db";
import { env } from "@my-app/env/server";
import { registerNotificationEventPusher } from "@my-app/notifications/events-bridge";
import { registerOrganizationOverlayProjector } from "@my-app/organization";
import {
	configurePaymentWebhookAdaptersFromEnv,
	createCloudPaymentsPaymentProvider,
	registerPaymentProvider,
} from "@my-app/payment";
import { NOTIFICATION_QUEUE } from "@my-app/queue";
import { createPgBossProducer } from "@my-app/queue/producer";
import {
	createLocalFileStorageProvider,
	createS3StorageProvider,
	LISTING_PUBLIC_STORAGE_PROVIDER,
	registerStorageProvider,
} from "@my-app/storage";

let integrationsRegistered = false;
const TRAILING_SLASHES_RE = /\/+$/;

const parseGoogleServiceAccountKey = (): Record<string, unknown> => {
	try {
		return JSON.parse(
			env.GOOGLE_CALENDAR_CREDENTIALS_JSON ||
				env.GOOGLE_SERVICE_ACCOUNT_KEY ||
				"{}"
		) as Record<string, unknown>;
	} catch {
		return {};
	}
};

const createListingPublicStorageProvider = () => {
	if (env.STORAGE_BACKEND === "s3") {
		const requiredEnv: [string, string][] = [
			["STORAGE_S3_BUCKET", env.STORAGE_S3_BUCKET],
			["STORAGE_S3_ACCESS_KEY_ID", env.STORAGE_S3_ACCESS_KEY_ID],
			["STORAGE_S3_SECRET_ACCESS_KEY", env.STORAGE_S3_SECRET_ACCESS_KEY],
		];
		const missing = requiredEnv.filter(([, value]) => value.length === 0);

		if (missing.length > 0) {
			throw new Error(
				`Storage backend is configured as s3, but required env vars are missing: ${missing
					.map(([key]) => key)
					.join(", ")}`
			);
		}

		return createS3StorageProvider({
			providerId: LISTING_PUBLIC_STORAGE_PROVIDER,
			bucket: env.STORAGE_S3_BUCKET,
			region: env.STORAGE_S3_REGION,
			endpoint: env.STORAGE_S3_ENDPOINT || undefined,
			accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
			secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
			publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL,
			forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE === "1",
			signedUrlExpiresInSeconds: env.STORAGE_SIGNED_URL_TTL_SECONDS,
		});
	}

	return createLocalFileStorageProvider({
		providerId: LISTING_PUBLIC_STORAGE_PROVIDER,
		baseDir: path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR),
		publicBaseUrl:
			env.STORAGE_PUBLIC_BASE_URL ||
			`${env.SERVER_URL.replace(TRAILING_SLASHES_RE, "")}/assets/${LISTING_PUBLIC_STORAGE_PROVIDER}`,
	});
};

export const registerServerIntegrations = (): void => {
	if (integrationsRegistered) {
		return;
	}

	registerCalendarAdapter(
		"google",
		new GoogleCalendarAdapter(parseGoogleServiceAccountKey(), {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
		})
	);
	registerBookingLifecycleSync(db);
	registerOrganizationOverlayProjector(db);
	registerNotificationEventPusher(createPgBossProducer(NOTIFICATION_QUEUE), db);
	registerPaymentProvider(createCloudPaymentsPaymentProvider());
	registerStorageProvider(createListingPublicStorageProvider());
	configurePaymentWebhookAdaptersFromEnv({
		CLOUDPAYMENTS_PUBLIC_ID: env.CLOUDPAYMENTS_PUBLIC_ID,
		CLOUDPAYMENTS_API_SECRET: env.CLOUDPAYMENTS_API_SECRET,
	});

	integrationsRegistered = true;
};
