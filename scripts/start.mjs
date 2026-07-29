import { access } from "node:fs/promises";

const serverEntrypoint = new URL("../dist-server/server/index.js", import.meta.url);

try {
  await access(serverEntrypoint);
} catch {
  console.error(`
The production server has not been built.

Install the build dependencies and create the production bundle first:

  npm ci --include=dev
  npm run build
  npm start
`);
  process.exit(1);
}

await import(serverEntrypoint.href);
