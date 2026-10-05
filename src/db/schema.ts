import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { CONFIRMACION_VALORES } from "@/lib/invitados/constants";

const timestamps = {
  creadoEn: integer("creado_en", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  actualizadoEn: integer("actualizado_en", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
};

export const rubros = sqliteTable("rubros", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull().unique(),
});

export const invitados = sqliteTable(
  "invitados",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nombreApellido: text("nombre_apellido").notNull(),
    rubro: text("rubro")
      .notNull()
      .references(() => rubros.nombre, { onUpdate: "cascade" }),
    empresa: text("empresa").notNull(),
    cargo: text("cargo"),
    confirmacion: text("confirmacion", { enum: CONFIRMACION_VALORES }).notNull(),
    premiado: integer("premiado", { mode: "boolean" }).notNull().default(false),
    sector: text("sector"),
    /** Solo se setea desde el check-in; nunca desde gestión ni importación. */
    checkinEn: integer("checkin_en", { mode: "timestamp_ms" }),
    /** nombre + empresa normalizados: evita duplicados al reimportar. */
    claveUnica: text("clave_unica").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invitados_clave_unica_idx").on(t.claveUnica),
    index("invitados_checkin_idx").on(t.checkinEn),
    index("invitados_rubro_idx").on(t.rubro),
    index("invitados_premiado_idx").on(t.premiado),
  ],
);

export type Invitado = typeof invitados.$inferSelect;
export type NuevoInvitado = typeof invitados.$inferInsert;
