import { o } from "../../index";
import { adminOrganizationsRouter } from "./organizations";
import { adminYoutubeRouter } from "./youtube";

export const adminRouter = {
	organizations: o
		.tag("Admin / Organizations")
		.router(adminOrganizationsRouter),
	youtube: o.tag("Admin / YouTube").router(adminYoutubeRouter),
};
