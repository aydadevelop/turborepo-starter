export const ORG_ROLE_VALUES = [
	"org_owner",
	"org_admin",
	"manager",
	"agent",
	"member",
] as const;

export type OrgRole = (typeof ORG_ROLE_VALUES)[number];

export interface OrgRoleDescriptor {
	description: string;
	label: string;
	recommendedLabel?: string;
	value: OrgRole;
}

export const ORG_ROLE_OPTIONS: OrgRoleDescriptor[] = [
	{
		value: "org_owner",
		label: "Owner",
		description: "Full access to everything.",
	},
	{
		value: "org_admin",
		label: "Admin",
		description:
			"Full organization management. Can manage members, settings, and all resources.",
	},
	{
		value: "manager",
		label: "Manager",
		description:
			"Manage tasks, payments, and support. Limited member management.",
	},
	{
		value: "agent",
		label: "Agent",
		description:
			"Handle support tickets and intake requests. Read-only access to payments.",
		recommendedLabel: "Recommended for captains",
	},
	{
		value: "member",
		label: "Member",
		description: "Read-only access to organization data.",
	},
];

export function getOrgRoleBadgeVariant(role: string) {
	switch (role) {
		case "org_owner":
		case "owner":
		case "org_admin":
		case "admin":
			return "default" as const;
		case "manager":
		case "agent":
			return "secondary" as const;
		default:
			return "outline" as const;
	}
}
