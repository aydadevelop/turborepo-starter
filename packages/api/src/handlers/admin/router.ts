import { publicProcedure } from "../../index";
import { adminOrganizationsRouter } from "./organizations";

export const adminRouter = publicProcedure.admin.router({
	organizations: adminOrganizationsRouter,
});
