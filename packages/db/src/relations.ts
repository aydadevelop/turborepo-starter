import { defineRelations } from "drizzle-orm";
import { affiliateRelations } from "./relations/affiliate";
import { authRelations } from "./relations/auth";
import { availabilityRelations } from "./relations/availability";
import { marketplaceRelations } from "./relations/marketplace";
import { notificationRelations } from "./relations/notification";
import { staffingRelations } from "./relations/staffing";
import { supportRelations } from "./relations/support";
import { systemRelations } from "./relations/system";
// biome-ignore lint/performance/noNamespaceImport: defineRelations requires namespace import
import * as schema from "./schema";

const baseRelations = defineRelations(schema);

export const relations = {
	...baseRelations,
	...authRelations,
	...notificationRelations,
	...systemRelations,
	...marketplaceRelations,
	...availabilityRelations,
	...affiliateRelations,
	...supportRelations,
	...staffingRelations,
};
