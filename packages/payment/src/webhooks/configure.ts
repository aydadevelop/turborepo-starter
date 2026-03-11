import { CloudPaymentsWebhookAdapter } from "./cloudpayments";
import { registerPaymentWebhookAdapter } from "./registry";

interface PaymentWebhookEnvironment {
	CLOUDPAYMENTS_API_SECRET?: string;
	CLOUDPAYMENTS_PUBLIC_ID?: string;
}

let configured = false;

export const configurePaymentWebhookAdaptersFromEnv = (
	environment: PaymentWebhookEnvironment,
) => {
	if (configured) {
		return;
	}

	const publicId = environment.CLOUDPAYMENTS_PUBLIC_ID?.trim();
	const apiSecret = environment.CLOUDPAYMENTS_API_SECRET?.trim();

	if (publicId && apiSecret) {
		registerPaymentWebhookAdapter(
			new CloudPaymentsWebhookAdapter({ publicId, apiSecret }),
		);
	}

	configured = true;
};
