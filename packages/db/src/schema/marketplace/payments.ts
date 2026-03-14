import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization } from "../auth";
import { timestamps } from "../columns";
import {
	paymentProviderEnum,
	validationStatusEnum,
	webhookEventStatusEnum,
	webhookTypeEnum,
} from "./shared";

export const paymentProviderConfig = pgTable(
	"payment_provider_config",
	{
		id: text("id").primaryKey(),
		provider: paymentProviderEnum("provider").notNull(),
		displayName: text("display_name").notNull(),
		description: text("description"),
		isActive: boolean("is_active").notNull().default(true),
		supportedCurrencies: jsonb("supported_currencies")
			.$type<string[]>()
			.notNull(),
		defaultAcquiringFeeBps: integer("default_acquiring_fee_bps")
			.notNull()
			.default(0),
		defaultPlatformFeeBps: integer("default_platform_fee_bps")
			.notNull()
			.default(0),
		minPlatformFeeBps: integer("min_platform_fee_bps").notNull().default(0),
		configSchema: jsonb("config_schema").$type<Record<string, unknown>>(),
		sandboxAvailable: boolean("sandbox_available").notNull().default(false),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		uniqueIndex("payment_provider_config_uq_provider").on(table.provider),
	],
);

export const organizationPaymentConfig = pgTable(
	"organization_payment_config",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		providerConfigId: text("provider_config_id")
			.notNull()
			.references(() => paymentProviderConfig.id, { onDelete: "restrict" }),
		provider: paymentProviderEnum("provider").notNull(),
		isActive: boolean("is_active").notNull().default(false),
		publicKey: text("public_key"),
		encryptedCredentials: text("encrypted_credentials").notNull(),
		credentialKeyVersion: integer("credential_key_version")
			.notNull()
			.default(1),
		webhookEndpointId: text("webhook_endpoint_id").notNull(),
		validatedAt: timestamp("validated_at", {
			withTimezone: true,
			mode: "date",
		}),
		validationStatus: validationStatusEnum("validation_status")
			.notNull()
			.default("pending"),
		platformServiceFeeBps: integer("platform_service_fee_bps"),
		payoutConfig: jsonb("payout_config").$type<Record<string, unknown>>(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("organization_payment_config_ix_organization_id").on(
			table.organizationId,
		),
		index("organization_payment_config_ix_provider_config_id").on(
			table.providerConfigId,
		),
		uniqueIndex("organization_payment_config_uq_org_provider").on(
			table.organizationId,
			table.provider,
		),
		uniqueIndex("organization_payment_config_uq_webhook_endpoint_id").on(
			table.webhookEndpointId,
		),
	],
);

export const paymentWebhookEvent = pgTable(
	"payment_webhook_event",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		endpointId: text("endpoint_id").notNull(),
		provider: paymentProviderEnum("provider").notNull(),
		webhookType: webhookTypeEnum("webhook_type").notNull(),
		status: webhookEventStatusEnum("status").notNull().default("received"),
		requestSignature: text("request_signature"),
		payload: jsonb("payload").$type<Record<string, unknown>>(),
		responseCode: integer("response_code"),
		errorMessage: text("error_message"),
		processingDurationMs: integer("processing_duration_ms"),
		...timestamps,
	},
	(table) => [
		index("payment_webhook_event_ix_organization_id_created_at").on(
			table.organizationId,
			table.createdAt,
		),
		index("payment_webhook_event_ix_endpoint_id").on(table.endpointId),
		uniqueIndex("payment_webhook_event_uq_request_signature")
			.on(table.requestSignature)
			.where(sql`${table.requestSignature} is not null`),
	],
);
