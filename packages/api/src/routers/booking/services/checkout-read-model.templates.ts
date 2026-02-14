export const checkoutLineItemLabels = {
	baseSubtotal: "Base subtotal",
	discount: "Discount",
	serviceFee: "Service fee",
	affiliateFee: "Affiliate fee",
	payNow: "Pay now",
	payLater: "Pay later",
	total: "Total",
} as const;

export const checkoutPolicyTemplates = {
	payment: {
		key: "payment_timing",
		title: "Payment timing",
		description:
			"Pay now covers platform fees. Charter base amount is due later unless your operator confirms a different schedule.",
	},
	cancellation: {
		key: "cancellation_review",
		title: "Cancellation and refunds",
		description:
			"Cancellation and refund outcomes depend on booking status, notice timing, and support review.",
	},
} as const;
