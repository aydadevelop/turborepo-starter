import { $ } from "bun";

// 1. Get the filter from args or default to PR/Push logic
const filter = process.argv[2] ?? "...[HEAD~1]";
console.error(`Using turbo filter: ${filter}`);

// 2. Ask turbo for the graph natively
let packages = { items: [] as any[] };
try {
  // Use quiet to suppress turbo update warnings, read output natively
  const result = await $`bunx turbo ls --filter=${filter} --output=json`.quiet().json();
  packages = result.packages;
} catch (e) {
  console.error("Warning: turbo ls failed or returned invalid json", e);
  // Revert to deploying standard apps if turbo fails
  packages = {
    items: [
      { name: "web", path: "apps/web" },
      { name: "server", path: "apps/server" },
      { name: "assistant", path: "apps/assistant" },
      { name: "notifications", path: "apps/notifications" },
      { name: "@my-app/db", path: "packages/db" }
    ]
  };
}

const matrix = { include: [] as any[] };
let run_migrations = false;

// 3. Dynamically build the matrix without hardcoding app lists
for (const pkg of packages.items) {
  if (pkg.name === "@my-app/db" || pkg.name === "server") {
    run_migrations = true;
  }
  
  // Only deploy things inside "apps/" that aren't the astro site
  if (pkg.path?.startsWith("apps/") && pkg.name !== "site-astro") {
    matrix.include.push({
      app: pkg.name,
      dockerfile: pkg.name === "web" ? "Dockerfile.web" : "Dockerfile"
    });
  }
}

// Ensure at least empty matrix valid JSON
console.error("Deploy matrix:", JSON.stringify(matrix));

// Output for GitHub Actions
console.log(`matrix=${JSON.stringify(matrix)}`);
console.log(`has_apps=${matrix.include.length > 0}`);
console.log(`run_migrations=${run_migrations}`);
