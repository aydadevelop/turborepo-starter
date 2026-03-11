import {
	type SupportEmailIntakePayload,
	supportEmailIntakePayloadSchema,
} from "@my-app/api-contract/contracts/support-email-intake";
import {
	parseAllowedRecipients,
	parseSupportEmailWorkerEnv,
	type SupportEmailWorkerEnv,
} from "./env";
import {
	buildSupportInboundEmailPayload,
	type SupportEmailWorkerMessage,
} from "./normalize";

export default {
	fetch(): Response {
		return Response.json({
			ok: true,
			service: "support-email-worker",
		});
	},

	async email(
		message: SupportEmailWorkerMessage,
		rawEnv: unknown
	): Promise<void> {
		await handleSupportEmailMessage(message, rawEnv);
	},
};

export async function handleSupportEmailMessage(
	message: SupportEmailWorkerMessage,
	rawEnv: unknown,
	fetchImpl: typeof fetch = fetch
): Promise<SupportEmailIntakePayload | null> {
	const env = parseSupportEmailWorkerEnv(rawEnv);
	const payload = supportEmailIntakePayloadSchema.parse(
		await buildSupportInboundEmailPayload(message)
	);

	if (!matchesAllowedRecipients(payload, message, env)) {
		message.setReject?.(
			"Recipient is not configured for support email intake."
		);
		return null;
	}

	const response = await forwardSupportInboundEmail(payload, env, fetchImpl);
	if (!response.ok) {
		throw new Error(
			`SUPPORT_EMAIL_FORWARD_FAILED: ${response.status} ${response.statusText}`
		);
	}

	return payload;
}

export const forwardSupportInboundEmail = (
	payload: SupportEmailIntakePayload,
	env: SupportEmailWorkerEnv,
	fetchImpl: typeof fetch = fetch
): Promise<Response> => {
	return fetchImpl(env.SUPPORT_EMAIL_WEBHOOK_URL, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-support-email-secret": env.SUPPORT_EMAIL_WEBHOOK_SECRET,
		},
		body: JSON.stringify(payload),
	});
};

const matchesAllowedRecipients = (
	payload: SupportEmailIntakePayload,
	message: SupportEmailWorkerMessage,
	env: SupportEmailWorkerEnv
): boolean => {
	const allowedRecipients = parseAllowedRecipients(
		env.SUPPORT_EMAIL_ALLOWED_RECIPIENTS
	);
	if (allowedRecipients.length === 0) {
		return true;
	}

	const envelopeRecipients = parseAllowedRecipients(message.to);
	const recipients = new Set(
		envelopeRecipients.length > 0
			? envelopeRecipients
			: payload.to.map((recipient) => recipient.address.toLowerCase())
	);

	for (const recipient of recipients) {
		if (allowedRecipients.includes(recipient)) {
			return true;
		}
	}

	return false;
};
