import type { db } from "@my-app/db";
import type {
	bookingPaymentAttempt,
	organizationPaymentConfig,
	paymentWebhookEvent,
} from "@my-app/db/schema/marketplace";

export type Db = typeof db;
export type OrgPaymentConfigRow = typeof organizationPaymentConfig.$inferSelect;
export type PaymentWebhookEventRow = typeof paymentWebhookEvent.$inferSelect;
export type BookingPaymentAttemptRow = typeof bookingPaymentAttempt.$inferSelect;

export interface ConnectPaymentProviderInput {
	organizationId: string;
	providerConfigId: string;
	provider: "cloudpayments" | "stripe";
	publicKey?: string;
	encryptedCredentials: string;
}

export interface ReconcileWebhookResult {
	processed: boolean;
	idempotent: boolean;
	bookingId: string | null;
	organizationId: string;
}
