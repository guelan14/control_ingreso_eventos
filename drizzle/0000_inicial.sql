CREATE TABLE `invitados` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre_apellido` text NOT NULL,
	`rubro` text NOT NULL,
	`empresa` text NOT NULL,
	`cargo` text,
	`confirmacion` text NOT NULL,
	`premiado` integer DEFAULT false NOT NULL,
	`sector` text,
	`checkin_en` integer,
	`clave_unica` text NOT NULL,
	`creado_en` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`actualizado_en` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`rubro`) REFERENCES `rubros`(`nombre`) ON UPDATE cascade ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitados_clave_unica_idx` ON `invitados` (`clave_unica`);--> statement-breakpoint
CREATE INDEX `invitados_checkin_idx` ON `invitados` (`checkin_en`);--> statement-breakpoint
CREATE INDEX `invitados_rubro_idx` ON `invitados` (`rubro`);--> statement-breakpoint
CREATE INDEX `invitados_premiado_idx` ON `invitados` (`premiado`);--> statement-breakpoint
CREATE TABLE `rubros` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rubros_nombre_unique` ON `rubros` (`nombre`);