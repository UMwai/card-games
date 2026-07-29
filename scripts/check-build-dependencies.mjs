import { existsSync } from "node:fs";

const requiredBuildPackages = ["typescript", "vite"];
const missingPackages = requiredBuildPackages.filter(
  (packageName) =>
    !existsSync(new URL(`../node_modules/${packageName}/package.json`, import.meta.url))
);

if (missingPackages.length > 0) {
  console.error(`
Build dependencies are missing: ${missingPackages.join(", ")}.

Install the locked development dependencies, then build again:

  npm ci --include=dev
  npm run build
`);
  process.exit(1);
}
