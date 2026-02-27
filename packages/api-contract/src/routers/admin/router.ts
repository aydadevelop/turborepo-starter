import { oc } from "@orpc/contract";
import { adminOrganizationsContract } from "./organizations";

export const adminContract = {
	organizations: oc
		.tag("Admin / Organizations")
		.router(adminOrganizationsContract),
};
