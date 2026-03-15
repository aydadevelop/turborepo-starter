import type { LayoutServerLoad } from "./$types";
import { getServerSession } from "$lib/auth.server";

export const load: LayoutServerLoad = async (event) => ({
	initialSession: await getServerSession(event),
});