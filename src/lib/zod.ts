import { z } from "zod";

// Mensajes de validación por defecto en español. Importar `z` siempre desde acá.
z.config(z.locales.es());

export { z };
