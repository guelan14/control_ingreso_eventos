import "server-only";
import { crearDbDesdeUrl, type Db } from "./create-db";

// En desarrollo el hot-reload reevalúa los módulos; guardamos la conexión en globalThis
// para no abrir un pool nuevo en cada cambio.
const globalForDb = globalThis as unknown as { db?: Promise<Db> };

export function getDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta la variable de entorno DATABASE_URL (ver .env.example).");
  globalForDb.db ??= Promise.resolve(crearDbDesdeUrl(url));
  return globalForDb.db;
}
