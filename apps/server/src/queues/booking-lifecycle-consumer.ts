import { bookingExpirationCheckMessageSchema } from "@full-stack-cf-app/api/contracts/booking-lifecycle-queue";
import { expireBookingIfUnpaid } from "@full-stack-cf-app/api/routers/booking/services/expiration";

const MAX_RETRY_ATTEMPTS = 5;

const handleBookingExpirationCheck = async (
	queueMessage: Message,
	bookingId: string
) => {
	try {
		const result = await expireBookingIfUnpaid(bookingId);
		if (result.expired) {
			console.log(
				`[booking-expiration] booking ${bookingId} expired via queue`
			);
		}
		queueMessage.ack();
	} catch (error) {
		console.error(
			`[booking-expiration] failed to process ${bookingId}:`,
			error
		);
		if (queueMessage.attempts < MAX_RETRY_ATTEMPTS) {
			queueMessage.retry({
				delaySeconds: Math.min(queueMessage.attempts * 30, 300),
			});
			return;
		}
		queueMessage.ack();
	}
};

export const processBookingLifecycleBatch = async (
	batch: MessageBatch<unknown>
) => {
	for (const queueMessage of batch.messages) {
		const expirationMessage = bookingExpirationCheckMessageSchema.safeParse(
			queueMessage.body
		);
		if (expirationMessage.success) {
			await handleBookingExpirationCheck(
				queueMessage,
				expirationMessage.data.bookingId
			);
			continue;
		}

		console.error("Unknown booking lifecycle queue message", queueMessage.body);
		queueMessage.ack();
	}
};
