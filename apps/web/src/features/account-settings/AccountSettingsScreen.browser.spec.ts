import { expect, test, vi } from "vitest";
import { renderWithQueryClient } from "../../test/browser/render";

const mockState = vi.hoisted(() => ({
    goto: vi.fn(),
    session: { 
        user: { 
            id: "u1", 
            name: "Test User", 
            email: "test@example.com", 
            image: null, 
            phoneNumber: "+1234567890", 
            phoneNumberVerified: true, 
            emailVerified: true 
        } 
    },
    linkedAccounts: [],
    userInvitations: [],
    invalidateQueries: vi.fn(),
    useSessionQuery: { subscribe: (fn: any) => { fn({ data: { session: { id: "s1" }, user: { id: "u1", name: "Test User", email: "test@example.com", image: null } }, isPending: false }); return () => {}; } },
}));

vi.mock("$app/navigation", () => ({ goto: mockState.goto }));
vi.mock("$app/paths", () => ({ resolve: (p: string) => p }));
vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost"), params: {} } }));
vi.mock("$lib/auth-client", () => ({
    authClient: {
        updateUser: vi.fn(),
        verifyEmail: vi.fn(),
        useSession: () => mockState.useSessionQuery,
        getTelegramConfig: async () => ({ data: { botUsername: "testbot" } })
    }
}));
vi.mock("$lib/auth-session", () => ({
    hasAuthenticatedSession: () => mockState.session,
}));
vi.mock("$lib/orpc", () => ({
    orpc: {
        telemetry: { telegram: { queryOptions: () => ({ queryKey: ["telem"], queryFn: async () => ({}) }) } }
    },
    queryClient: { invalidateQueries: mockState.invalidateQueries }
}));
vi.mock("$lib/query-keys", () => ({ queryKeys: {} }));
vi.mock("$lib/query-options", () => ({
    linkedAccountsQueryOptions: () => ({
        queryKey: ["linked"],
        queryFn: async () => mockState.linkedAccounts,
    }),
    userInvitationsQueryOptions: () => ({
        queryKey: ["invites"],
        queryFn: async () => mockState.userInvitations,
    }),
    organizationQueryOptions: () => ({
        queryKey: ["org"],
        queryFn: async () => []
    })
}));

import AccountSettingsScreen from "./AccountSettingsScreen.svelte";

test("renders AccountSettingsScreen and matches screenshot", async () => {
    const { container } = renderWithQueryClient(AccountSettingsScreen);
    await expect.element(document.body).toBeInTheDocument();
    
    // Wait for async rendering and queries to settle
    await new Promise(r => setTimeout(r, 200)); 
    
    await expect(container).toMatchScreenshot();
});
