import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { respuestaErrorInterno } from "@/lib/http";

/** GET /api/salud — healthcheck del deploy. Verifica que la base responda. */
export async function GET() {
  try {
    await (await getDb()).execute(sql`select 1`);
    return Response.json({ estado: "ok" });
  } catch (error) {
    return respuestaErrorInterno("GET /api/salud", error);
  }
}
