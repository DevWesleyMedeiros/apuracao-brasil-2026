import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Inject the binding values through your hosting environment (control plane, wrangler bindings, or environment variables) before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
