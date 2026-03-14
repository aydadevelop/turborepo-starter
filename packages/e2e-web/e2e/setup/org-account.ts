import type { TestDataFactory } from "../utils/test-data-factory";

export interface OrgAccountScenario {
	organization: {
		id: string;
		name: string;
		slug: string;
	};
	user: {
		email: string;
		id: string;
		name: string;
		password: string;
	};
}

export const createOrgAccountScenario = async (
	testData: TestDataFactory,
	overrides: {
		name?: string;
		orgName?: string;
		orgSlug?: string;
		password?: string;
	} = {},
): Promise<OrgAccountScenario> => {
	const password = overrides.password ?? "test-password-123";
	const user = await testData.createUser({
		name: overrides.name,
		password,
	});
	await testData.signIn(user.email, password);

	const organization = await testData.createOrganization({
		name: overrides.orgName,
		slug: overrides.orgSlug,
	});

	return {
		organization,
		user: {
			...user,
			password,
		},
	};
};
