import { o } from "../../index";
import { mergeRouterFragments } from "../shared/router-merge";
import { affiliateBookingRouter } from "./affiliate";
import { cancellationBookingRouter } from "./cancellation/router";
import { coreBookingRouter } from "./core";
import { discountCodeBookingRouter } from "./discount/router";
import { disputeBookingRouter } from "./dispute";
import { paymentBookingRouter } from "./payments";
import { refundBookingRouter } from "./refund";
import { shiftBookingRouter } from "./shift";
import { publicBookingRouter } from "./storefront";

export const bookingRouter = o
	.tag("Booking")
	.router(
		mergeRouterFragments(
			coreBookingRouter,
			o.tag("Storefront").router(publicBookingRouter),
			o.tag("Affiliate").router(affiliateBookingRouter),
			o.tag("Cancellation").router(cancellationBookingRouter),
			o.tag("Dispute").router(disputeBookingRouter),
			o.tag("Refund").router(refundBookingRouter),
			o.tag("Shift").router(shiftBookingRouter),
			o.tag("Payment").router(paymentBookingRouter),
			o.tag("Discount").router(discountCodeBookingRouter)
		)
	);
