import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` is offline and needs no credentials. The d1-http driver
// is only required for `push`/`studio` against a REMOTE D1 database; we apply
// migrations with `wrangler d1 migrations apply` (and auto-migrate at runtime),
// so it is intentionally omitted here. `out` matches wrangler's migrations_dir.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
