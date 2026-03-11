// Browser Mode mounts feature components directly, so it bypasses the root
// layout that normally imports the app-wide Tailwind/shadcn stylesheet.
import "../../app.css";
import { afterEach } from "vitest";
import { cleanupBrowserMounts } from "./render";

afterEach(async () => {
	await cleanupBrowserMounts();
});
