import z from "zod";

export const bookingExpirationCheckMessageSchema = z.object({
	kind: z.literal("booking.expiration.check.v1"),
	bookingId: z.string().trim().min(1),
});

export type BookingExpirationCheckMessage = z.infer<
	typeof bookingExpirationCheckMessageSchema
>;

export const createBookingExpirationCheckMessage = (
	bookingId: string
): BookingExpirationCheckMessage =>
	bookingExpirationCheckMessageSchema.parse({
		kind: "booking.expiration.check.v1",
		bookingId,
	});
