/**
 * Aplica las migraciones pendientes de ./drizzle a la base de DATABASE_URL.
 * Se corre antes de iniciar el servidor en cada deploy: npm run db:migrate
 * (Con pglite:// no hace falta: las migraciones se aplican solas al abrir la base.)
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (ver .env.example).");
  process.exit(1);
}
if (url.startsWith("pglite://")) {
  console.log("PGlite: las migraciones se aplican al iniciar la app.");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("✓ Migraciones aplicadas");
} catch (error) {
  console.error("✗ Error al migrar:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
