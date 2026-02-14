import { mergeRouterFragments } from "../shared/router-merge";
import { checkoutBookingRouter } from "./checkout";
import { coreBookingRouter } from "./core";
import { discountCodeBookingRouter } from "./discount-codes";
import { lifecycleBookingRouter } from "./lifecycle";
import { paymentBookingRouter } from "./payments";
import { shiftBookingRouter } from "./shift";

export const bookingRouter = mergeRouterFragments(
	coreBookingRouter,
	checkoutBookingRouter,
	lifecycleBookingRouter,
	shiftBookingRouter,
	paymentBookingRouter,
	discountCodeBookingRouter
);
