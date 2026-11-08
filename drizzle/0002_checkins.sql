CREATE TYPE "public"."tipo_checkin" AS ENUM('ingreso', 'correccion');--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"evento_id" integer NOT NULL,
	"invitado_id" integer NOT NULL,
	"registrado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"tipo" "tipo_checkin" NOT NULL,
	"hora_anterior" timestamp with time zone,
	"usuario_id" integer,
	"dispositivo" text,
	"clave_idempotencia" text NOT NULL,
	CONSTRAINT "checkins_clave_idempotencia_unique" UNIQUE("clave_idempotencia")
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_invitado_id_invitados_id_fk" FOREIGN KEY ("invitado_id") REFERENCES "public"."invitados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkins_evento_registrado_idx" ON "checkins" USING btree ("evento_id","registrado_en");--> statement-breakpoint
CREATE INDEX "checkins_invitado_idx" ON "checkins" USING btree ("invitado_id");