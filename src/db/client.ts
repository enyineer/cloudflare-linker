import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.ts";

/** Build a typed Drizzle client over the D1 binding. */
export function getDb(env: Env) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;
