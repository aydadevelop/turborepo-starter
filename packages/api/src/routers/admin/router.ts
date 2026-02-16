import { o } from "../../index";
import { adminBoatsRouter } from "./boats";
import { adminBookingsRouter } from "./bookings";
import { adminFeeConfigRouter } from "./fee-config";
import { adminOrganizationsRouter } from "./organizations";
import { adminSupportRouter } from "./support";

export const adminRouter = {
	boats: o.tag("Admin / Boats").router(adminBoatsRouter),
	bookings: o.tag("Admin / Bookings").router(adminBookingsRouter),
	organizations: o
		.tag("Admin / Organizations")
		.router(adminOrganizationsRouter),
	support: o.tag("Admin / Support").router(adminSupportRouter),
	feeConfig: o.tag("Admin / Fee Config").router(adminFeeConfigRouter),
};
