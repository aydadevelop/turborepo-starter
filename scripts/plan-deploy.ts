// @ts-expect-error
import { $ } from "bun";

const turboGraphFilter = process.argv[2] ?? "...[HEAD~1]";
console.error(`Using turbo filter: ${turboGraphFilter}`);

let turboPackages = { items: [] as any[] };

try {
  const turboResult = await $`bunx turbo ls --filter=${turboGraphFilter} --output=json`.quiet().json();
  turboPackages = turboResult.packages;
} catch (error) {
  console.error("Warning: turbo ls failed or returned invalid json", error);
  const fallbackStandardApps = [
    { name: "web", path: "apps/web" },
    { name: "server", path: "apps/server" },
    { name: "assistant", path: "apps/assistant" },
    { name: "notifications", path: "apps/notifications" },
    { name: "@my-app/db", path: "packages/db" }
  ];
  turboPackages = { items: fallbackStandardApps };
}

const deployMatrix = { include: [] as any[] };
let shouldRunMigrations = false;

for (const pkg of turboPackages.items) {
  const requiresDatabaseMigration = pkg.name === "@my-app/db" || pkg.name === "server";
  if (requiresDatabaseMigration) {
    shouldRunMigrations = true;
  }
  
  const isDeployableApp = pkg.path?.startsWith("apps/") && pkg.name !== "site-astro";
  if (isDeployableApp) {
    deployMatrix.include.push({
      app: pkg.name,
      dockerfile: pkg.name === "web" ? "Dockerfile.web" : "Dockerfile"
    });
  }
}

console.error("Deploy matrix:", JSON.stringify(deployMatrix));

const hasAppsToDeploy = deployMatrix.include.length > 0;

console.log(`matrix=${JSON.stringify(deployMatrix)}`);
console.log(`has_apps=${hasAppsToDeploy}`);
console.log(`run_migrations=${shouldRunMigrations}`);
