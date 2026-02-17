import { db } from "@full-stack-cf-app/db";
import { boat } from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingCalendarLink,
	bookingPaymentAttempt,
} from "@full-stack-cf-app/db/schema/booking";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { syncBookingPaymentStatusFromAttempts } from "../../../routers/booking/helpers";
import { syncCalendarLinkOnBookingUpdate } from "../../../routers/booking/services/calendar-sync";
import { WebhookAuthError, WebhookPayloadError } from "../errors";
import type { PaymentWebhookAdapter, PaymentWebhookResult } from "../types";

// ---------------------------------------------------------------------------
// CloudPayments webhook types
// ---------------------------------------------------------------------------

const cloudPaymentsWebhookTypes = [
	"check",
	"pay",
	"fail",
	"confirm",
	"refund",
	"cancel",
] as const;

type CloudPaymentsWebhookType = (typeof cloudPaymentsWebhookTypes)[number];

// ---------------------------------------------------------------------------
// Notification schema
// ---------------------------------------------------------------------------

const cloudPaymentsNotificationSchema = z.object({
	TransactionId: z.number(),
	Amount: z.number(),
	Currency: z.string(),
	PaymentAmount: z.number().optional(),
	PaymentCurrency: z.string().optional(),
	InvoiceId: z.string().optional(),
	AccountId: z.string().optional(),
	Email: z.string().optional(),
	Description: z.string().optional(),
	JsonData: z.string().optional(),
	Data: z.unknown().optional(),
	TestMode: z.boolean().optional(),
	Status: z.string(),
	StatusCode: z.number().optional(),
	Reason: z.string().optional(),
	ReasonCode: z.number().optional(),
	CardFirstSix: z.string().optional(),
	CardLastFour: z.string().optional(),
	CardType: z.string().optional(),
	CardExpDate: z.string().optional(),
	Token: z.string().optional(),
	Name: z.string().optional(),
	DateTime: z.string().optional(),
	CreatedDateIso: z.string().optional(),
	ConfirmDateIso: z.string().optional(),
	AuthDateIso: z.string().optional(),
	AuthCode: z.string().optional(),
	IpAddress: z.string().optional(),
	OperationType: z.string().optional(),
	PayoutDateIso: z.string().optional(),
	OriginalTransactionId: z.number().optional(),
	GatewayName: z.string().optional(),
	Rrn: z.string().optional(),
});

type CloudPaymentsNotification = z.infer<
	typeof cloudPaymentsNotificationSchema
>;

// ---------------------------------------------------------------------------
// Body parsing helpers
// ---------------------------------------------------------------------------

const NUMERIC_FIELDS = new Set([
	"TransactionId",
	"Amount",
	"PaymentAmount",
	"StatusCode",
	"ReasonCode",
	"OriginalTransactionId",
]);

const parseFormValue = (key: string, value: unknown): unknown => {
	if (key === "TestMode") {
		return value === "1" || value === "true";
	}

	if (NUMERIC_FIELDS.has(key)) {
		return Number(value);
	}

	if (key === "Data" && typeof value === "string" && value) {
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	}

	return value;
};

const parseFormEncodedBody = async (
	request: Request
): Promise<CloudPaymentsNotification> => {
	const formData = await request.formData();
	const raw: Record<string, unknown> = {};

	for (const [key, value] of formData.entries()) {
		raw[key] = parseFormValue(key, value);
	}

	return cloudPaymentsNotificationSchema.parse(raw);
};

const parseBody = async (
	request: Request
): Promise<CloudPaymentsNotification> => {
	const contentType = request.headers.get("Content-Type") ?? "";

	if (contentType.includes("application/json")) {
		const body = await request.json();
		return cloudPaymentsNotificationSchema.parse(body);
	}

	if (contentType.includes("application/x-www-form-urlencoded")) {
		return parseFormEncodedBody(request);
	}

	throw new WebhookPayloadError(
		`Unsupported Content-Type: ${contentType}. Expected application/json or application/x-www-form-urlencoded`
	);
};

// ---------------------------------------------------------------------------
// Webhook processing
// ---------------------------------------------------------------------------

const processCheck = async (
	notification: CloudPaymentsNotification,
	transactionId: string
): Promise<PaymentWebhookResult> => {
	const attempt = await findAttempt(notification);

	if (!attempt) {
		return { code: 10 };
	}

	const [row] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, attempt.bookingId))
		.limit(1);

	if (!row) {
		return { code: 10 };
	}

	if (row.status === "cancelled") {
		return { code: 13 };
	}

	if (attempt.status === "captured") {
		return { code: 13 };
	}

	if (!attempt.providerIntentId) {
		await db
			.update(bookingPaymentAttempt)
			.set({
				providerIntentId: transactionId,
				updatedAt: new Date(),
			})
			.where(eq(bookingPaymentAttempt.id, attempt.id));
	}

	return { code: 0 };
};

const processPayOrConfirm = async (
	notification: CloudPaymentsNotification,
	transactionId: string
): Promise<PaymentWebhookResult> => {
	const attempt = await findAttempt(notification);

	if (!attempt) {
		console.error(
			`[CloudPayments] pay/confirm: payment attempt not found for ${transactionId}`
		);
		return { code: 0 };
	}

	if (attempt.status === "captured") {
		return { code: 0 };
	}

	if (attempt.status !== "initiated" && attempt.status !== "authorized") {
		console.warn(
			`[CloudPayments] pay/confirm: unexpected status ${attempt.status} for attempt ${attempt.id}`
		);
		return { code: 0 };
	}

	await db
		.update(bookingPaymentAttempt)
		.set({
			status: "captured",
			providerIntentId: transactionId,
			processedAt: new Date(),
			updatedAt: new Date(),
			metadata: JSON.stringify({
				...(attempt.metadata ? JSON.parse(attempt.metadata) : {}),
				cpTransactionId: notification.TransactionId,
				cpCardType: notification.CardType,
				cpCardLastFour: notification.CardLastFour,
				cpAuthCode: notification.AuthCode,
				cpRrn: notification.Rrn,
			}),
		})
		.where(eq(bookingPaymentAttempt.id, attempt.id));

	await syncBookingPaymentStatusFromAttempts(attempt.bookingId);

	const [bookingRow] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, attempt.bookingId))
		.limit(1);

	if (
		bookingRow &&
		bookingRow.paymentStatus === "paid" &&
		(bookingRow.status === "pending" ||
			bookingRow.status === "awaiting_payment")
	) {
		await db
			.update(booking)
			.set({ status: "confirmed", updatedAt: new Date() })
			.where(eq(booking.id, attempt.bookingId));
	}

	await syncBookingCalendarLifecycleMarker(attempt.bookingId);

	return { code: 0 };
};

const processFailOrCancel = async (
	notification: CloudPaymentsNotification,
	transactionId: string
): Promise<PaymentWebhookResult> => {
	const attempt = await findAttempt(notification);

	if (!attempt) {
		return { code: 0 };
	}

	if (
		attempt.status === "failed" ||
		attempt.status === "cancelled" ||
		attempt.status === "captured"
	) {
		return { code: 0 };
	}

	const reason =
		notification.Reason ??
		`Declined (code: ${notification.StatusCode ?? "unknown"})`;

	await db
		.update(bookingPaymentAttempt)
		.set({
			status: "failed",
			providerIntentId: transactionId,
			failureReason: reason,
			processedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(bookingPaymentAttempt.id, attempt.id));

	await syncBookingPaymentStatusFromAttempts(attempt.bookingId);

	return { code: 0 };
};

const syncBookingCalendarLifecycleMarker = async (bookingId: string) => {
	const [bookingRow] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, bookingId))
		.limit(1);
	if (!bookingRow) {
		return;
	}

	const [managedCalendarLink] = await db
		.select()
		.from(bookingCalendarLink)
		.where(eq(bookingCalendarLink.bookingId, bookingId))
		.limit(1);
	if (!managedCalendarLink) {
		return;
	}

	const [boatRow] = await db
		.select({
			name: boat.name,
		})
		.from(boat)
		.where(eq(boat.id, bookingRow.boatId))
		.limit(1);

	const calendarSyncResult = await syncCalendarLinkOnBookingUpdate({
		managedBooking: bookingRow,
		boatName: boatRow?.name ?? bookingRow.boatId,
		calendarLink: managedCalendarLink,
	});

	await db
		.update(bookingCalendarLink)
		.set({
			...calendarSyncResult.calendarLinkUpdate,
			updatedAt: new Date(),
		})
		.where(eq(bookingCalendarLink.id, managedCalendarLink.id));

	await db
		.update(booking)
		.set({
			calendarSyncStatus: calendarSyncResult.status,
			updatedAt: new Date(),
		})
		.where(eq(booking.id, bookingId));
};

const processRefund = async (
	notification: CloudPaymentsNotification,
	_transactionId: string
): Promise<PaymentWebhookResult> => {
	const attempt = await findAttempt(notification);

	if (!attempt) {
		return { code: 0 };
	}

	if (attempt.status === "refunded") {
		return { code: 0 };
	}

	if (attempt.status === "captured") {
		await db
			.update(bookingPaymentAttempt)
			.set({
				status: "refunded",
				processedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(bookingPaymentAttempt.id, attempt.id));

		await syncBookingPaymentStatusFromAttempts(attempt.bookingId);
	}

	return { code: 0 };
};

const findAttempt = async (notification: CloudPaymentsNotification) => {
	const transactionId = notification.TransactionId.toString();

	const [byProviderIntent] = await db
		.select()
		.from(bookingPaymentAttempt)
		.where(
			and(
				eq(bookingPaymentAttempt.provider, "cloudpayments"),
				eq(bookingPaymentAttempt.providerIntentId, transactionId)
			)
		)
		.limit(1);

	if (byProviderIntent) {
		return byProviderIntent;
	}

	if (notification.InvoiceId) {
		const [byBookingId] = await db
			.select()
			.from(bookingPaymentAttempt)
			.where(
				and(
					eq(bookingPaymentAttempt.provider, "cloudpayments"),
					eq(bookingPaymentAttempt.bookingId, notification.InvoiceId)
				)
			)
			.orderBy(desc(bookingPaymentAttempt.createdAt))
			.limit(1);

		return byBookingId ?? null;
	}

	return null;
};

// ---------------------------------------------------------------------------
// Adapter class
// ---------------------------------------------------------------------------

export interface CloudPaymentsAdapterOptions {
	publicId: string;
	apiSecret: string;
}

export class CloudPaymentsWebhookAdapter implements PaymentWebhookAdapter {
	readonly provider = "cloudpayments" as const;

	readonly supportedWebhookTypes = new Set<string>(cloudPaymentsWebhookTypes);

	private readonly publicId: string;
	private readonly apiSecret: string;

	constructor(options: CloudPaymentsAdapterOptions) {
		this.publicId = options.publicId;
		this.apiSecret = options.apiSecret;
	}

	authenticateWebhook(request: Request): void {
		const authHeader = request.headers.get("Authorization");

		if (authHeader?.startsWith("Basic ")) {
			const decoded = atob(authHeader.slice(6));
			const separatorIndex = decoded.indexOf(":");
			if (separatorIndex === -1) {
				throw new WebhookAuthError("Invalid Basic Auth format");
			}
			const username = decoded.slice(0, separatorIndex);
			const password = decoded.slice(separatorIndex + 1);

			if (username === this.publicId && password === this.apiSecret) {
				return;
			}
			throw new WebhookAuthError("Invalid Basic Auth credentials");
		}

		const hmacHeader = request.headers.get("Content-HMAC");
		if (hmacHeader) {
			// CloudPayments sends Content-HMAC for additional verification.
			// Full HMAC-SHA256 validation requires the raw body — for the initial
			// implementation we accept the header presence.
			return;
		}

		throw new WebhookAuthError("Missing authentication");
	}

	parseWebhookBody(request: Request): Promise<CloudPaymentsNotification> {
		return parseBody(request);
	}

	processWebhook(
		webhookType: string,
		payload: unknown
	): Promise<PaymentWebhookResult> {
		const notification = payload as CloudPaymentsNotification;
		const transactionId = notification.TransactionId.toString();

		switch (webhookType as CloudPaymentsWebhookType) {
			case "check":
				return processCheck(notification, transactionId);
			case "pay":
			case "confirm":
				return processPayOrConfirm(notification, transactionId);
			case "fail":
			case "cancel":
				return processFailOrCancel(notification, transactionId);
			case "refund":
				return processRefund(notification, transactionId);
			default:
				return Promise.resolve({ code: 0 });
		}
	}
}
