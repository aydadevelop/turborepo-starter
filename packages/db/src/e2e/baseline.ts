export const E2E_DEFAULT_ANCHOR_DATE = "2026-03-15";
export const E2E_DEFAULT_DATABASE_URL =
	"postgresql://postgres:postgres@127.0.0.1:5432/myapp_e2e";
export const E2E_UNSAFE_ALLOW_SHARED_DB_ENV = "PLAYWRIGHT_ALLOW_SHARED_DB";

export const E2E_BASELINE = {
	ids: {
		adminOrganizationId: "e2e_org_admin",
		starterOrganizationId: "e2e_org_starter",
		adminUserId: "e2e_user_admin",
		operatorUserId: "e2e_user_operator",
		memberUserId: "e2e_user_member",
		adminAccountId: "e2e_account_admin_credential",
		operatorAccountId: "e2e_account_operator_credential",
		adminMemberId: "e2e_member_admin",
		operatorMemberId: "e2e_member_operator",
		memberMembershipId: "e2e_member_member",
	},
	admin: {
		email: "admin@admin.com",
		password: "admin",
	},
	operator: {
		email: "operator@example.com",
		password: "operator",
	},
	organizations: {
		admin: {
			id: "e2e_org_admin",
			name: "Admin Organization",
			slug: "e2e-admin",
		},
		starter: {
			id: "e2e_org_starter",
			name: "Starter Organization",
			slug: "e2e-starter",
		},
	},
	users: {
		admin: {
			id: "e2e_user_admin",
			name: "Admin",
			email: "admin@admin.com",
			password: "admin",
			role: "admin",
		},
		operator: {
			id: "e2e_user_operator",
			name: "Operations User",
			email: "operator@example.com",
			password: "operator",
			role: "user",
		},
		member: {
			id: "e2e_user_member",
			name: "Member User",
			email: "member@example.com",
			role: "user",
		},
	},
	accounts: {
		admin: {
			id: "e2e_account_admin_credential",
			providerId: "credential",
		},
		operator: {
			id: "e2e_account_operator_credential",
			providerId: "credential",
		},
	},
	memberships: {
		adminOwner: {
			id: "e2e_member_admin",
			role: "org_owner",
		},
		operatorManager: {
			id: "e2e_member_operator",
			role: "manager",
		},
		memberMember: {
			id: "e2e_member_member",
			role: "member",
		},
	},
} as const;

export type E2EBaseline = typeof E2E_BASELINE;
