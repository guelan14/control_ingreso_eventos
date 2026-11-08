import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ROLES } from "@/lib/auth/roles";
import { CONFIRMACION_VALORES } from "@/lib/invitados/constants";

const timestamps = {
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const confirmacionEnum = pgEnum("confirmacion", CONFIRMACION_VALORES);

/**
 * Una fila por edición de un evento (ej: "Aniversario 2027"); el historial queda por año.
 * Rubros y premiados son opcionales: una charla puede no usar ninguno.
 */
export const eventos = pgTable("eventos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  fecha: date("fecha", { mode: "string" }).notNull(),
  usaRubros: boolean("usa_rubros").notNull().default(true),
  usaPremiados: boolean("usa_premiados").notNull().default(true),
  ...timestamps,
});

/** Rubros propios de cada evento: cambian de nombre de un año a otro. */
export const rubros = pgTable(
  "rubros",
  {
    id: serial("id").primaryKey(),
    eventoId: integer("evento_id")
      .notNull()
      .references(() => eventos.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
  },
  (t) => [uniqueIndex("rubros_evento_nombre_idx").on(t.eventoId, t.nombre)],
);

export const invitados = pgTable(
  "invitados",
  {
    id: serial("id").primaryKey(),
    eventoId: integer("evento_id")
      .notNull()
      .references(() => eventos.id, { onDelete: "cascade" }),
    nombreApellido: text("nombre_apellido").notNull(),
    empresa: text("empresa").notNull(),
    cargo: text("cargo"),
    /** Opcional. Si está, identifica al invitado aunque haya homónimos. */
    dni: text("dni"),
    rubroId: integer("rubro_id").references(() => rubros.id),
    confirmacion: confirmacionEnum("confirmacion").notNull(),
    premiado: boolean("premiado").notNull().default(false),
    sector: text("sector"),
    /** Solo se setea desde el check-in; nunca desde gestión ni importación. */
    checkinEn: timestamp("checkin_en", { withTimezone: true }),
    /** nombre + empresa normalizados (sin tildes ni mayúsculas): para buscar y para identificar sin DNI. */
    claveNombre: text("clave_nombre").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invitados_evento_dni_idx").on(t.eventoId, t.dni).where(sql`${t.dni} is not null`),
    // Sin DNI, nombre + empresa no se puede repetir. Con DNI se permiten homónimos.
    uniqueIndex("invitados_evento_clave_sin_dni_idx")
      .on(t.eventoId, t.claveNombre)
      .where(sql`${t.dni} is null`),
    index("invitados_evento_clave_idx").on(t.eventoId, t.claveNombre),
    index("invitados_evento_checkin_idx").on(t.eventoId, t.checkinEn),
    index("invitados_evento_premiado_idx").on(t.eventoId, t.premiado),
  ],
);

export const rolEnum = pgEnum("rol", ROLES);

export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  /** Nombre de usuario para ingresar, en minúsculas. No hace falta email: el personal de puerta puede no tener. */
  usuario: text("usuario").notNull().unique(),
  nombre: text("nombre").notNull(),
  claveHash: text("clave_hash").notNull(),
  rol: rolEnum("rol").notNull(),
  activo: boolean("activo").notNull().default(true),
  /** Las contraseñas que asigna un administrador son temporales. */
  debeCambiarClave: boolean("debe_cambiar_clave").notNull().default(true),
  intentosFallidos: integer("intentos_fallidos").notNull().default(0),
  bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true }),
  ultimoIngreso: timestamp("ultimo_ingreso", { withTimezone: true }),
  ...timestamps,
});

/** Sesiones en la base: se pueden cerrar desde el servidor (al desactivar un usuario, por ejemplo). */
export const sesiones = pgTable(
  "sesiones",
  {
    /** SHA-256 del token de la cookie: si se filtra la base, los tokens no sirven. */
    id: text("id").primaryKey(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sesiones_usuario_idx").on(t.usuarioId), index("sesiones_expira_idx").on(t.expiraEn)],
);

export const tipoCheckinEnum = pgEnum("tipo_checkin", ["ingreso", "correccion"]);

/**
 * Registro de ingresos: solo se agregan filas, nunca se editan ni borran (auditoría: quién, cuándo,
 * desde qué dispositivo). invitados.checkin_en es la copia de la hora vigente, para consultar rápido.
 */
export const checkins = pgTable(
  "checkins",
  {
    id: serial("id").primaryKey(),
    eventoId: integer("evento_id")
      .notNull()
      .references(() => eventos.id, { onDelete: "cascade" }),
    invitadoId: integer("invitado_id")
      .notNull()
      .references(() => invitados.id, { onDelete: "cascade" }),
    registradoEn: timestamp("registrado_en", { withTimezone: true }).notNull().defaultNow(),
    tipo: tipoCheckinEnum("tipo").notNull(),
    /** Hora que tenía antes, si es una corrección confirmada de un doble ingreso. */
    horaAnterior: timestamp("hora_anterior", { withTimezone: true }),
    usuarioId: integer("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    dispositivo: text("dispositivo"),
    /**
     * La genera el celular por cada toque de "Registrar ingreso". Si se corta la red y el pedido se
     * reintenta, llega con la misma clave y no se registra dos veces.
     */
    claveIdempotencia: text("clave_idempotencia").notNull().unique(),
  },
  (t) => [
    index("checkins_evento_registrado_idx").on(t.eventoId, t.registradoEn),
    index("checkins_invitado_idx").on(t.invitadoId),
  ],
);

export type Evento = typeof eventos.$inferSelect;
export type Invitado = typeof invitados.$inferSelect;
export type Usuario = typeof usuarios.$inferSelect;
