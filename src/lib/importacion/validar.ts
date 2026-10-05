import { z } from "@/lib/zod";
import {
  COLUMNAS,
  CONFIRMACION_VALORES,
  PREMIADO_VALORES,
  type CampoExcel,
  type Confirmacion,
} from "@/lib/invitados/constants";
import { claveInvitado, limpiarTexto, normalizarComparacion } from "@/lib/invitados/normalizar";

export type ProblemaImportacion = {
  /** Número de fila en el Excel (1 = encabezado). null = problema del archivo completo. */
  fila: number | null;
  campo: string | null;
  mensaje: string;
};

export type InvitadoImportado = {
  nombreApellido: string;
  rubro: string;
  empresa: string;
  cargo: string | null;
  confirmacion: Confirmacion;
  premiado: boolean;
  sector: string | null;
  claveUnica: string;
};

export type FilaCruda = { fila: number; celdas: unknown[] };

export type ResultadoValidacion = {
  columnasPresentes: CampoExcel[];
  filasValidas: { fila: number; invitado: InvitadoImportado }[];
  errores: ProblemaImportacion[];
  advertencias: ProblemaImportacion[];
  totalFilas: number;
};

/** Mapea cada encabezado a su campo. Devuelve el índice de columna de cada campo. */
export function validarEncabezados(encabezados: unknown[]) {
  const errores: ProblemaImportacion[] = [];
  const advertencias: ProblemaImportacion[] = [];
  const indicePorCampo = new Map<CampoExcel, number>();
  // Columnas que están pero mal escritas: ya tienen su error, no repetir "falta la columna".
  const malEscritas = new Set<CampoExcel>();

  encabezados.forEach((crudo, indice) => {
    if (crudo === null || crudo === undefined || String(crudo).trim() === "") return;
    const encabezado = String(crudo);
    const columna = COLUMNAS.find(
      (c) => c.campo === encabezado || (c.alias as readonly string[]).includes(encabezado),
    );

    if (!columna) {
      const comparable = normalizarComparacion(encabezado).replace(/ /g, "_");
      const parecida = COLUMNAS.find((c) => normalizarComparacion(c.campo) === comparable);
      if (parecida) {
        malEscritas.add(parecida.campo);
        errores.push({
          fila: 1,
          campo: encabezado,
          mensaje: `El encabezado "${encabezado}" debe escribirse exactamente "${parecida.campo}" (sin espacios extra ni mayúsculas).`,
        });
      } else {
        advertencias.push({
          fila: 1,
          campo: encabezado,
          mensaje: `La columna "${encabezado}" no se reconoce y será ignorada.`,
        });
      }
      return;
    }

    if (indicePorCampo.has(columna.campo)) {
      errores.push({
        fila: 1,
        campo: columna.campo,
        mensaje: `La columna "${columna.campo}" está repetida.`,
      });
      return;
    }
    indicePorCampo.set(columna.campo, indice);
  });

  for (const columna of COLUMNAS) {
    if (columna.requerida && !indicePorCampo.has(columna.campo) && !malEscritas.has(columna.campo)) {
      errores.push({
        fila: 1,
        campo: columna.campo,
        mensaje: `Falta la columna obligatoria "${columna.campo}".`,
      });
    }
  }

  return { indicePorCampo, errores, advertencias };
}

function esValorDe<T extends string>(lista: readonly T[], valor: string): valor is T {
  return (lista as readonly string[]).includes(valor);
}

function esquemaFila(rubrosValidos: readonly string[]) {
  // Rubro: se tolera mayúsculas/tildes y se guarda el nombre canónico.
  const rubroCanonico = new Map(rubrosValidos.map((r) => [normalizarComparacion(r), r]));
  const requerido = (campo: string) =>
    z.string({ error: `El campo "${campo}" es obligatorio.` });

  return z.object({
    nombre_apellido: requerido("nombre_apellido").max(200, "Máximo 200 caracteres."),
    empresa: requerido("empresa").max(200, "Máximo 200 caracteres."),
    rubro: requerido("rubro").transform((valor, ctx) => {
      const canonico = rubroCanonico.get(normalizarComparacion(valor));
      if (!canonico) {
        ctx.addIssue({
          code: "custom",
          message: `Rubro "${valor}" no válido. Valores aceptados: ${rubrosValidos.join(", ")}.`,
        });
        return z.NEVER;
      }
      return canonico;
    }),
    confirmacion: requerido("confirmacion").transform((valor, ctx) => {
      if (!esValorDe(CONFIRMACION_VALORES, valor)) {
        ctx.addIssue({
          code: "custom",
          message: `Valor "${valor}" no válido. Use exactamente: ${CONFIRMACION_VALORES.join(" / ")}.`,
        });
        return z.NEVER;
      }
      return valor;
    }),
    premiado: requerido("premiado").transform((valor, ctx) => {
      if (!esValorDe(PREMIADO_VALORES, valor)) {
        ctx.addIssue({
          code: "custom",
          message: `Valor "${valor}" no válido. Use exactamente: SI / NO (en mayúsculas).`,
        });
        return z.NEVER;
      }
      return valor === "SI";
    }),
    cargo: z.string().max(200, "Máximo 200 caracteres.").nullable(),
    sector: z.string().max(50, "Máximo 50 caracteres.").nullable(),
  });
}

/**
 * Valida encabezados y filas de la hoja "Invitados".
 * Función pura: no toca la base de datos, para poder testearla y usarla en modo "previsualizar".
 */
export function validarInvitados(
  encabezados: unknown[],
  filas: FilaCruda[],
  rubrosValidos: readonly string[],
): ResultadoValidacion {
  const { indicePorCampo, errores, advertencias } = validarEncabezados(encabezados);
  const columnasPresentes = [...indicePorCampo.keys()];
  const resultado: ResultadoValidacion = {
    columnasPresentes,
    filasValidas: [],
    errores,
    advertencias,
    totalFilas: 0,
  };

  // Si faltan columnas no tiene sentido validar fila por fila: todas fallarían igual.
  if (errores.length > 0) return resultado;

  const esquema = esquemaFila(rubrosValidos);
  const primeraFilaPorClave = new Map<string, number>();

  for (const { fila, celdas } of filas) {
    const valores = Object.fromEntries(
      COLUMNAS.map(({ campo }) => {
        const indice = indicePorCampo.get(campo);
        return [campo, indice === undefined ? null : limpiarTexto(celdas[indice])];
      }),
    );

    // Filas totalmente vacías (muy comunes al final de un Excel) se ignoran.
    if (Object.values(valores).every((v) => v === null)) continue;
    resultado.totalFilas++;

    const parseo = esquema.safeParse(valores);
    if (!parseo.success) {
      for (const issue of parseo.error.issues) {
        errores.push({ fila, campo: String(issue.path[0] ?? ""), mensaje: issue.message });
      }
      continue;
    }

    const d = parseo.data;
    const claveUnica = claveInvitado(d.nombre_apellido, d.empresa);
    const filaPrevia = primeraFilaPorClave.get(claveUnica);
    if (filaPrevia !== undefined) {
      errores.push({
        fila,
        campo: "nombre_apellido",
        mensaje: `Invitado duplicado: "${d.nombre_apellido}" de "${d.empresa}" ya aparece en la fila ${filaPrevia}.`,
      });
      continue;
    }
    primeraFilaPorClave.set(claveUnica, fila);

    resultado.filasValidas.push({
      fila,
      invitado: {
        nombreApellido: d.nombre_apellido,
        empresa: d.empresa,
        rubro: d.rubro,
        cargo: d.cargo,
        confirmacion: d.confirmacion,
        premiado: d.premiado,
        sector: d.sector,
        claveUnica,
      },
    });
  }

  if (resultado.totalFilas === 0) {
    errores.push({ fila: null, campo: null, mensaje: "La hoja no tiene invitados cargados." });
  }

  return resultado;
}
