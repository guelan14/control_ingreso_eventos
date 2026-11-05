CREATE TYPE "public"."confirmacion" AS ENUM('Confirmado', 'No Puede');--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"fecha" date NOT NULL,
	"usa_rubros" boolean DEFAULT true NOT NULL,
	"usa_premiados" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitados" (
	"id" serial PRIMARY KEY NOT NULL,
	"evento_id" integer NOT NULL,
	"nombre_apellido" text NOT NULL,
	"empresa" text NOT NULL,
	"cargo" text,
	"dni" text,
	"rubro_id" integer,
	"confirmacion" "confirmacion" NOT NULL,
	"premiado" boolean DEFAULT false NOT NULL,
	"sector" text,
	"checkin_en" timestamp with time zone,
	"clave_nombre" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubros" (
	"id" serial PRIMARY KEY NOT NULL,
	"evento_id" integer NOT NULL,
	"nombre" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitados" ADD CONSTRAINT "invitados_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitados" ADD CONSTRAINT "invitados_rubro_id_rubros_id_fk" FOREIGN KEY ("rubro_id") REFERENCES "public"."rubros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubros" ADD CONSTRAINT "rubros_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitados_evento_dni_idx" ON "invitados" USING btree ("evento_id","dni") WHERE "invitados"."dni" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "invitados_evento_clave_sin_dni_idx" ON "invitados" USING btree ("evento_id","clave_nombre") WHERE "invitados"."dni" is null;--> statement-breakpoint
CREATE INDEX "invitados_evento_clave_idx" ON "invitados" USING btree ("evento_id","clave_nombre");--> statement-breakpoint
CREATE INDEX "invitados_evento_checkin_idx" ON "invitados" USING btree ("evento_id","checkin_en");--> statement-breakpoint
CREATE INDEX "invitados_evento_premiado_idx" ON "invitados" USING btree ("evento_id","premiado");--> statement-breakpoint
CREATE UNIQUE INDEX "rubros_evento_nombre_idx" ON "rubros" USING btree ("evento_id","nombre");