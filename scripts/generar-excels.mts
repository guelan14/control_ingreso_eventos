/**
 * Genera los Excel de referencia:
 *   public/plantilla_invitados.xlsx   -> plantilla oficial (encabezados + 3 filas de ejemplo)
 *   ejemplos/invitados_demo.xlsx      -> 320 invitados ficticios para probar / demo
 *   ejemplos/invitados_con_errores.xlsx -> para mostrar el reporte de errores
 *
 * Uso: npm run excel:generar
 */
import fs from "node:fs/promises";
import path from "node:path";
import { CONFIRMACION_VALORES, RUBROS_BASE } from "../src/lib/invitados/constants";
import { crearLibroInvitados, FILAS_EJEMPLO, type FilaPlantilla } from "../src/lib/importacion/plantilla";

const NOMBRES = ["Ana", "Carlos", "Lucía", "Martín", "Sofía", "Diego", "Valeria", "Pablo", "Camila", "Jorge", "Romina", "Hernán", "Florencia", "Gustavo", "Paula", "Ricardo"];
const APELLIDOS = ["Benítez", "Ramírez", "Duarte", "Krause", "Schmidt", "Ojeda", "Acosta", "Vera", "Sosa", "Gómez", "Fernández", "Olivera", "Wagner", "Rojas", "Zárate"];
const EMPRESAS = ["Cooperativa Agrícola", "Maderas del Norte", "Automotores Posadas", "Banco Regional", "Constructora Iguazú", "Tecnológica Misiones", "Comercial Eldorado", "Industrias Oberá"];
const SECTORES = ["A", "B", "C", "D"];

function demo(cantidad: number): FilaPlantilla[] {
  // Pseudoaleatorio con semilla fija: el archivo es siempre igual (reproducible en tests y demos).
  let semilla = 42;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const elegir = <T,>(lista: readonly T[]) => lista[Math.floor(azar() * lista.length)];

  return Array.from({ length: cantidad }, (_, i) => ({
    nombre_apellido: `${elegir(NOMBRES)} ${elegir(APELLIDOS)} ${i + 1}`,
    rubro: elegir(RUBROS_BASE),
    empresa: elegir(EMPRESAS),
    cargo: azar() > 0.3 ? "Director" : null,
    confirmacion: azar() > 0.1 ? CONFIRMACION_VALORES[0] : CONFIRMACION_VALORES[1],
    premiado: azar() > 0.93 ? "SI" : "NO",
    sector: elegir(SECTORES),
  }));
}

const CON_ERRORES: FilaPlantilla[] = [
  FILAS_EJEMPLO[0],
  { ...FILAS_EJEMPLO[1], premiado: "si" },
  { ...FILAS_EJEMPLO[2], confirmacion: "Tal vez", rubro: "Pesca" },
  { ...FILAS_EJEMPLO[1], nombre_apellido: null, empresa: "Sin nombre SA" },
  { ...FILAS_EJEMPLO[0] },
];

async function escribir(destino: string, contenido: ArrayBuffer) {
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, Buffer.from(contenido));
  console.log("✓", destino);
}

await escribir("public/plantilla_invitados.xlsx", await crearLibroInvitados(FILAS_EJEMPLO));
await escribir("ejemplos/invitados_demo.xlsx", await crearLibroInvitados(demo(320)));
await escribir("ejemplos/invitados_con_errores.xlsx", await crearLibroInvitados(CON_ERRORES));
