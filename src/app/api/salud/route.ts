import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { respuestaErrorInterno } from "@/lib/http";

/** GET /api/salud — usado por Railway como healthcheck. Verifica que la base responda. */
export async function GET() {
  try {
    getDb().run(sql`select 1`);
    return Response.json({ estado: "ok" });
  } catch (error) {
    return respuestaErrorInterno("GET /api/salud", error);
  }
}
