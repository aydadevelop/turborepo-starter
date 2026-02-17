const bookingStatusClass = (status: string): string => {
	switch (status) {
		case "cancelled":
			return "bg-rose-100 text-rose-700";
		case "completed":
			return "bg-emerald-100 text-emerald-700";
		case "confirmed":
		case "in_progress":
			return "bg-sky-100 text-sky-700";
		default:
			return "bg-muted text-muted-foreground";
	}
};

const paymentStatusClass = (status: string): string => {
	switch (status) {
		case "refunded":
			return "bg-amber-100 text-amber-700";
		case "paid":
			return "bg-emerald-100 text-emerald-700";
		case "partially_paid":
			return "bg-sky-100 text-sky-700";
		case "failed":
			return "bg-rose-100 text-rose-700";
		default:
			return "bg-muted text-muted-foreground";
	}
};

const escalationStatusClass = (status: string): string => {
	switch (status) {
		case "requested":
			return "bg-amber-100 text-amber-700";
		case "approved":
			return "bg-emerald-100 text-emerald-700";
		case "rejected":
			return "bg-rose-100 text-rose-700";
		default:
			return "bg-muted text-muted-foreground";
	}
};

const shiftStatusClass = (status: string): string => {
	switch (status) {
		case "applied":
			return "bg-emerald-100 text-emerald-700";
		case "rejected":
		case "cancelled":
			return "bg-rose-100 text-rose-700";
		case "pending":
			return "bg-amber-100 text-amber-700";
		default:
			return "bg-muted text-muted-foreground";
	}
};

const affiliatePayoutStatusClass = (status: string): string => {
	switch (status) {
		case "paid":
			return "bg-emerald-100 text-emerald-700";
		case "eligible":
			return "bg-sky-100 text-sky-700";
		case "voided":
			return "bg-rose-100 text-rose-700";
		default:
			return "bg-amber-100 text-amber-700";
	}
};

const disputeStatusClass = (status: string): string => {
	switch (status) {
		case "resolved":
			return "bg-emerald-100 text-emerald-700";
		case "rejected":
			return "bg-rose-100 text-rose-700";
		case "under_review":
			return "bg-sky-100 text-sky-700";
		default:
			return "bg-amber-100 text-amber-700";
	}
};

const refundStatusClass = (status: string): string => {
	switch (status) {
		case "processed":
			return "bg-emerald-100 text-emerald-700";
		case "failed":
		case "rejected":
			return "bg-rose-100 text-rose-700";
		case "approved":
			return "bg-sky-100 text-sky-700";
		default:
			return "bg-amber-100 text-amber-700";
	}
};

const paymentAttemptStatusClass = (status: string): string => {
	switch (status) {
		case "captured":
			return "bg-emerald-100 text-emerald-700";
		case "failed":
		case "cancelled":
			return "bg-rose-100 text-rose-700";
		case "authorized":
		case "requires_action":
			return "bg-sky-100 text-sky-700";
		default:
			return "bg-muted text-muted-foreground";
	}
};

export {
	bookingStatusClass,
	paymentStatusClass,
	escalationStatusClass,
	shiftStatusClass,
	affiliatePayoutStatusClass,
	disputeStatusClass,
	refundStatusClass,
	paymentAttemptStatusClass,
};
