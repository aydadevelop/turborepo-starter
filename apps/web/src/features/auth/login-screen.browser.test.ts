import { readable } from "svelte/store";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderComponent } from "../../test/browser/render";

const mockState = vi.hoisted(() => ({
	goto: vi.fn(() => Promise.resolve()),
	resolve: (path: string) => path,
	page: {
		url: new URL("http://localhost/login"),
		pathname: "/login",
		search: "",
	},
	signInEmail: vi.fn(),
	signInPasskey: vi.fn(async () => ({ error: null })),
	signUpEmail: vi.fn(),
	sendOtp: vi.fn(async () => ({ error: null })),
	verifyOtp: vi.fn(async () => ({ error: null })),
	initTelegramWidget: vi.fn(async () => undefined),
	signInWithTelegram: vi.fn(async () => ({ error: null })),
}));

vi.mock("$app/navigation", () => ({
	goto: mockState.goto,
}));

vi.mock("$app/paths", () => ({
	resolve: mockState.resolve,
}));

vi.mock("$app/state", () => ({
	page: mockState.page,
}));

vi.mock("$lib/auth-client", () => ({
	authClient: {
		useSession: () =>
			readable({
				data: null,
				error: null,
				isPending: false,
			}),
		signIn: {
			email: mockState.signInEmail,
			passkey: mockState.signInPasskey,
		},
		signUp: {
			email: mockState.signUpEmail,
		},
		phoneNumber: {
			sendOtp: mockState.sendOtp,
			verify: mockState.verifyOtp,
		},
		initTelegramWidget: mockState.initTelegramWidget,
		signInWithTelegram: mockState.signInWithTelegram,
	},
}));

vi.mock("$lib/orpc", () => ({
	orpc: {
		canManageOrganization: {
			key: () => ["can-manage-organization"],
		},
	},
	queryClient: {
		invalidateQueries: vi.fn(() => Promise.resolve()),
		setQueryData: vi.fn(),
	},
}));

vi.mock("$lib/query-keys", () => ({
	queryKeys: {
		org: { root: ["org"] },
		organizations: { all: ["organizations", "all"] },
		invitations: { all: ["invitations", "all"] },
	},
}));

import LoginScreen from "./LoginScreen.svelte";

test("renders login and signup loaded states with screenshots", async () => {
	renderComponent(LoginScreen, {});

	await expect.element(page.getByTestId("login-heading")).toBeVisible();
	await expect.element(page.getByTestId("login-email-input")).toBeVisible();
	await expect(document.body).toMatchScreenshot("login-screen-sign-in");

	await userEvent.click(page.getByTestId("switch-to-sign-up-button"));
	await expect.element(page.getByText("Create Account")).toBeVisible();
	await expect(document.body).toMatchScreenshot("login-screen-sign-up");
});
