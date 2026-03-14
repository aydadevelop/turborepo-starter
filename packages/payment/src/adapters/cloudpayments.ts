import type {
	PaymentExecutionConfig,
	PaymentProvider,
	RefundPaymentInput,
	RefundPaymentResult,
} from "../provider";

const CLOUDPAYMENTS_API_BASE_URL = "https://api.cloudpayments.ru";
const CLOUDPAYMENTS_NUMERIC_TRANSACTION_ID_RE = /^\d+$/;

interface CloudPaymentsAdapterOptions {
	apiBaseUrl?: string;
	fetch?: typeof fetch;
}

interface CloudPaymentsRefundResponse {
	Message: string | null;
	Model?: {
		TransactionId?: number | string | null;
	};
	Success: boolean;
}

interface CloudPaymentsCredentials {
	apiSecret: string;
	publicId: string;
}

class CloudPaymentsAdapterError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CloudPaymentsAdapterError";
	}
}

export class CloudPaymentsPaymentProvider implements PaymentProvider {
	readonly providerId = "cloudpayments" as const;

	private readonly apiBaseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: CloudPaymentsAdapterOptions = {}) {
		this.apiBaseUrl = options.apiBaseUrl ?? CLOUDPAYMENTS_API_BASE_URL;
		this.fetchImpl = options.fetch ?? fetch;
	}

	async refundPayment(
		input: RefundPaymentInput,
		config: PaymentExecutionConfig,
	): Promise<RefundPaymentResult> {
		this.assertRefundInput(input);
		const credentials = this.resolveCredentials(config);
		const response = await this.fetchImpl(
			`${this.apiBaseUrl}/payments/refund`,
			{
				method: "POST",
				headers: {
					Authorization: `Basic ${base64Encode(`${credentials.publicId}:${credentials.apiSecret}`)}`,
					"Content-Type": "application/json",
					"X-Request-ID": input.idempotencyKey,
				},
				body: JSON.stringify({
					TransactionId: toCloudPaymentsTransactionId(input.providerPaymentId),
					Amount: toCloudPaymentsAmount(input.amountCents),
				}),
			},
		);

		if (!response.ok) {
			const responseBody = await response.text();
			throw new CloudPaymentsAdapterError(
				`CLOUDPAYMENTS_HTTP_ERROR: ${response.status} ${response.statusText}${responseBody ? `: ${responseBody}` : ""}`,
			);
		}

		const payload = (await response.json()) as CloudPaymentsRefundResponse;
		if (!payload.Success) {
			throw new CloudPaymentsAdapterError(
				`CLOUDPAYMENTS_REFUND_FAILED: ${payload.Message ?? "Unknown provider error"}`,
			);
		}

		const externalRefundId = payload.Model?.TransactionId;
		if (
			externalRefundId === undefined ||
			externalRefundId === null ||
			String(externalRefundId).trim() === ""
		) {
			throw new CloudPaymentsAdapterError(
				"CLOUDPAYMENTS_INVALID_RESPONSE: missing Model.TransactionId",
			);
		}

		return {
			externalRefundId: String(externalRefundId),
		};
	}

	private resolveCredentials(
		config: PaymentExecutionConfig,
	): CloudPaymentsCredentials {
		if (config.providerId !== this.providerId) {
			throw new CloudPaymentsAdapterError(
				`CLOUDPAYMENTS_INVALID_CONFIG: expected providerId "${this.providerId}", received "${config.providerId}"`,
			);
		}

		const publicId =
			nonEmptyString(config.publicKey) ??
			nonEmptyString(config.credentials.publicKey) ??
			nonEmptyString(config.credentials.publicId);
		const apiSecret =
			nonEmptyString(config.credentials.apiSecret) ??
			nonEmptyString(config.credentials.api_secret) ??
			nonEmptyString(config.credentials.secret);

		if (!publicId) {
			throw new CloudPaymentsAdapterError(
				"CLOUDPAYMENTS_INVALID_CONFIG: missing public key",
			);
		}

		if (!apiSecret) {
			throw new CloudPaymentsAdapterError(
				"CLOUDPAYMENTS_INVALID_CONFIG: missing api secret",
			);
		}

		return { publicId, apiSecret };
	}

	private assertRefundInput(input: RefundPaymentInput): void {
		if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
			throw new CloudPaymentsAdapterError(
				`CLOUDPAYMENTS_INVALID_INPUT: amountCents must be a positive integer, received ${input.amountCents}`,
			);
		}

		if (!input.currency.trim()) {
			throw new CloudPaymentsAdapterError(
				"CLOUDPAYMENTS_INVALID_INPUT: currency is required",
			);
		}

		if (!input.idempotencyKey.trim()) {
			throw new CloudPaymentsAdapterError(
				"CLOUDPAYMENTS_INVALID_INPUT: idempotencyKey is required",
			);
		}

		if (!input.providerPaymentId.trim()) {
			throw new CloudPaymentsAdapterError(
				"CLOUDPAYMENTS_INVALID_INPUT: providerPaymentId is required",
			);
		}
	}
}

export const createCloudPaymentsPaymentProvider = (
	options?: CloudPaymentsAdapterOptions,
): PaymentProvider => new CloudPaymentsPaymentProvider(options);

const nonEmptyString = (value: unknown): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const toCloudPaymentsAmount = (amountCents: number): number =>
	Number((amountCents / 100).toFixed(2));

const toCloudPaymentsTransactionId = (providerPaymentId: string): number => {
	if (!CLOUDPAYMENTS_NUMERIC_TRANSACTION_ID_RE.test(providerPaymentId)) {
		throw new CloudPaymentsAdapterError(
			`CLOUDPAYMENTS_INVALID_INPUT: providerPaymentId must be a numeric transaction id, received ${providerPaymentId}`,
		);
	}

	return Number(providerPaymentId);
};

const base64Encode = (value: string): string => {
	if (typeof Buffer !== "undefined") {
		return Buffer.from(value).toString("base64");
	}

	return btoa(value);
};
