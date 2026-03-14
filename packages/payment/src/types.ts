import type { db } from "@my-app/db";
import type {
	bookingPaymentAttempt,
	organizationPaymentConfig,
	paymentWebhookEvent,
} from "@my-app/db/schema/marketplace";

export type Db = typeof db;
export type OrgPaymentConfigRow = typeof organizationPaymentConfig.$inferSelect;
export type PaymentWebhookEventRow = typeof paymentWebhookEvent.$inferSelect;
export type BookingPaymentAttemptRow =
	typeof bookingPaymentAttempt.$inferSelect;

export interface ConnectPaymentProviderInput {
	encryptedCredentials: string;
	organizationId: string;
	provider: "cloudpayments" | "stripe";
	providerConfigId: string;
	publicKey?: string;
}

export interface ReconcileWebhookResult {
	bookingId: string | null;
	idempotent: boolean;
	organizationId: string;
	processed: boolean;
}
