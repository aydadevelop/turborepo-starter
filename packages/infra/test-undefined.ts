import alchemy from "alchemy";
import { Worker } from "alchemy/cloudflare";

const app = await alchemy("test", { stage: "dev" });
const _w = await Worker("test", {
	cwd: ".",
	entrypoint: "index.ts",
	bindings: {
		TEST: undefined,
	},
});
await app.finalize();
