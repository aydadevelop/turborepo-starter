import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { WebhookAuthError, WebhookPayloadError } from "../errors";
import type { PaymentWebhookAdapter, PaymentWebhookResult } from "../types";

const cloudPaymentsWebhookTypes = [
	"check",
	"pay",
	"fail",
	"confirm",
	"refund",
	"cancel",
] as const;

const cloudPaymentsNotificationSchema = z.object({
	TransactionId: z.number(),
	Amount: z.number().optional(),
	Currency: z.string().optional(),
	InvoiceId: z.string().optional(),
	Status: z.string().optional(),
	Reason: z.string().optional(),
	ReasonCode: z.number().optional(),
});

type CloudPaymentsNotification = z.infer<
	typeof cloudPaymentsNotificationSchema
>;

const NUMERIC_FIELDS = new Set(["TransactionId", "Amount", "ReasonCode"]);

const parseFormValue = (key: string, value: unknown): unknown => {
	if (NUMERIC_FIELDS.has(key)) {
		return Number(value);
	}

	return value;
};

const parseFormEncodedBody = async (
	request: Request,
): Promise<CloudPaymentsNotification> => {
	const formData = await request.formData();
	const raw: Record<string, unknown> = {};

	for (const [key, value] of formData.entries()) {
		raw[key] = parseFormValue(key, value);
	}

	return cloudPaymentsNotificationSchema.parse(raw);
};

const parseBody = async (
	request: Request,
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
		`Unsupported Content-Type: ${contentType}. Expected application/json or application/x-www-form-urlencoded`,
	);
};

const createRequestHmac = (message: string, secret: string): string =>
	createHmac("sha256", secret).update(message, "utf8").digest("base64");

const constantTimeMatch = (expected: string, received: string): boolean => {
	const expectedBuffer = Buffer.from(expected);
	const receivedBuffer = Buffer.from(received.trim());

	if (expectedBuffer.length !== receivedBuffer.length) {
		return false;
	}

	return timingSafeEqual(expectedBuffer, receivedBuffer);
};

const decodeFormEncodedBody = (rawBody: string): string => {
	const params = new URLSearchParams(rawBody);
	return Array.from(params.entries())
		.map(([key, value]) => `${key}=${value}`)
		.join("&");
};

export interface CloudPaymentsAdapterOptions {
	apiSecret: string;
	publicId: string;
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

	async authenticateWebhook(request: Request): Promise<void> {
		const authHeader = request.headers.get("Authorization");
		let basicAuthWasProvided = false;

		if (authHeader?.startsWith("Basic ")) {
			basicAuthWasProvided = true;
			try {
				const decoded = atob(authHeader.slice(6));
				const separatorIndex = decoded.indexOf(":");
				if (separatorIndex !== -1) {
					const username = decoded.slice(0, separatorIndex);
					const password = decoded.slice(separatorIndex + 1);

					if (username === this.publicId && password === this.apiSecret) {
						return;
					}
				}
			} catch {
				// Fall through to HMAC verification before rejecting the request.
			}
		}

		const encodedHmacHeader = request.headers.get("Content-HMAC");
		const decodedHmacHeader = request.headers.get("X-Content-HMAC");

		if (!encodedHmacHeader && !decodedHmacHeader) {
			if (basicAuthWasProvided) {
				throw new WebhookAuthError("Invalid Basic Auth credentials");
			}

			throw new WebhookAuthError("Missing authentication");
		}

		const rawBody = await request.clone().text();
		const encodedHmac = createRequestHmac(rawBody, this.apiSecret);
		const contentType = request.headers.get("Content-Type") ?? "";
		const decodedPayload = contentType.includes(
			"application/x-www-form-urlencoded",
		)
			? decodeFormEncodedBody(rawBody)
			: rawBody;
		const decodedHmac = createRequestHmac(decodedPayload, this.apiSecret);

		if (
			(encodedHmacHeader && constantTimeMatch(encodedHmac, encodedHmacHeader)) ||
			(decodedHmacHeader && constantTimeMatch(decodedHmac, decodedHmacHeader))
		) {
			return;
		}

		throw new WebhookAuthError("Invalid HMAC signature");
	}

	parseWebhookBody(request: Request): Promise<CloudPaymentsNotification> {
		return parseBody(request);
	}

	processWebhook(
		webhookType: string,
		payload: unknown,
	): Promise<PaymentWebhookResult> {
		const notification = cloudPaymentsNotificationSchema.parse(payload);
		console.log("[CloudPayments webhook]", {
			webhookType,
			transactionId: notification.TransactionId,
			invoiceId: notification.InvoiceId ?? null,
			status: notification.Status ?? null,
		});

		return Promise.resolve({ code: 0 });
	}
}
