import { defineConfig } from "drizzle-kit";

// Solo para generar migraciones a partir de src/db/schema.ts (no necesita base de datos).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
