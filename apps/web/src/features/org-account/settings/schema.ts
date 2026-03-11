import { z } from "zod";

export const organizationSettingsSchema = z.object({
	name: z.string().trim().min(1, "Organization name is required."),
	slug: z
		.string()
		.trim()
		.regex(
			/^$|^[a-z0-9-]+$/,
			"Slug can only contain lowercase letters, numbers, and hyphens."
		),
});

export type OrganizationSettingsInput = z.infer<
	typeof organizationSettingsSchema
>;

export function getOrganizationSettingsDefaults(org?: {
	name?: string | null;
	slug?: string | null;
}): OrganizationSettingsInput {
	return {
		name: org?.name ?? "",
		slug: org?.slug ?? "",
	};
}
