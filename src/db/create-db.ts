import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { RUBROS_BASE } from "@/lib/invitados/constants";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/**
 * Abre la base, aplica migraciones pendientes y carga los rubros base.
 * Acepta ":memory:" para tests.
 */
export function createDb(filePath: string) {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }

  const sqlite = new Database(filePath);
  // WAL permite que el panel lea mientras la puerta escribe check-ins.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  db.insert(schema.rubros)
    .values(RUBROS_BASE.map((nombre) => ({ nombre })))
    .onConflictDoNothing()
    .run();

  return db;
}
