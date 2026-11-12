CREATE TYPE "public"."origen_invitado" AS ENUM('lista', 'puerta');--> statement-breakpoint
ALTER TABLE "invitados" ADD COLUMN "origen" "origen_invitado" DEFAULT 'lista' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitados" ADD COLUMN "acompana_a" text;--> statement-breakpoint
ALTER TABLE "invitados" ADD COLUMN "codigo" text DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)) NOT NULL;--> statement-breakpoint
ALTER TABLE "invitados" ADD CONSTRAINT "invitados_codigo_unique" UNIQUE("codigo");