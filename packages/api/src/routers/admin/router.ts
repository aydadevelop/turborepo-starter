import { o } from "../../index";
import { adminOrganizationsRouter } from "./organizations";

export const adminRouter = {
	organizations: o
		.tag("Admin / Organizations")
		.router(adminOrganizationsRouter),
};
