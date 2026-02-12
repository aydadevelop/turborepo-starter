import { mergeRouterFragments } from "../shared/router-merge";
import { coreBookingRouter } from "./core";
import { discountCodeBookingRouter } from "./discount-codes";
import { lifecycleBookingRouter } from "./lifecycle";
import { paymentBookingRouter } from "./payments";

export const bookingRouter = mergeRouterFragments(
	coreBookingRouter,
	lifecycleBookingRouter,
	paymentBookingRouter,
	discountCodeBookingRouter
);
