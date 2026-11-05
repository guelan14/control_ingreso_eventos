import { z } from "@/lib/zod";
import {
  CONFIRMACION_VALORES,
  PREMIADO_VALORES,
  columnasDelEvento,
  esColumnaRequerida,
  type CampoExcel,
  type ConfigEvento,
  type Confirmacion,
} from "@/lib/invitados/constants";
import {
  claveInvitado,
  limpiarTexto,
  normalizarComparacion,
  normalizarDni,
} from "@/lib/invitados/normalizar";

export type ProblemaImportacion = {
  /** Número de fila en el Excel (1 = encabezado). null = problema del archivo completo. */
  fila: number | null;
  campo: string | null;
  mensaje: string;
};

export type InvitadoImportado = {
  nombreApellido: string;
  empresa: string;
  /** null si el evento no usa rubros */
  rubro: string | null;
  confirmacion: Confirmacion;
  premiado: boolean;
  /** Opcionales: null = celda vacía o columna ausente, no se modifica el dato existente. */
  cargo: string | null;
  dni: string | null;
  sector: string | null;
  claveNombre: string;
};

export type FilaCruda = { fila: number; celdas: unknown[] };

/** Configuración del evento + los rubros que tiene cargados. */
export type ContextoValidacion = ConfigEvento & { rubros: readonly string[] };

export type ResultadoValidacion = {
  columnasPresentes: CampoExcel[];
  filasValidas: { fila: number; invitado: InvitadoImportado }[];
  errores: ProblemaImportacion[];
  advertencias: ProblemaImportacion[];
  totalFilas: number;
};

/** Mapea cada encabezado a su campo. Devuelve el índice de columna de cada campo. */
export function validarEncabezados(encabezados: unknown[], config: ConfigEvento) {
  const errores: ProblemaImportacion[] = [];
  const advertencias: ProblemaImportacion[] = [];
  const columnas = columnasDelEvento(config);
  const indicePorCampo = new Map<CampoExcel, number>();
  // Columnas que están pero mal escritas: ya tienen su error, no repetir "falta la columna".
  const malEscritas = new Set<CampoExcel>();

  encabezados.forEach((crudo, indice) => {
    if (crudo === null || crudo === undefined || String(crudo).trim() === "") return;
    const encabezado = String(crudo);
    const columna = columnas.find(
      (c) => c.campo === encabezado || (c.alias as readonly string[]).includes(encabezado),
    );

    if (!columna) {
      const comparable = normalizarComparacion(encabezado).replace(/ /g, "_");
      const parecida = columnas.find((c) => normalizarComparacion(c.campo) === comparable);
      if (parecida) {
        malEscritas.add(parecida.campo);
        errores.push({
          fila: 1,
          campo: encabezado,
          mensaje: `El encabezado "${encabezado}" debe escribirse exactamente "${parecida.campo}" (sin espacios extra ni mayúsculas).`,
        });
      } else {
        const motivo =
          comparable === "rubro" || comparable === "premiado"
            ? `este evento no usa ${comparable === "rubro" ? "rubros" : "premiados"}`
            : "no se reconoce";
        advertencias.push({
          fila: 1,
          campo: encabezado,
          mensaje: `La columna "${encabezado}" ${motivo} y será ignorada.`,
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

  for (const columna of columnas) {
    if (
      esColumnaRequerida(columna) &&
      !indicePorCampo.has(columna.campo) &&
      !malEscritas.has(columna.campo)
    ) {
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

function esquemaFila({ usaRubros, usaPremiados, rubros }: ContextoValidacion) {
  // Rubro: se tolera mayúsculas/tildes y se guarda el nombre canónico.
  const rubroCanonico = new Map(rubros.map((r) => [normalizarComparacion(r), r]));
  const requerido = (campo: string) =>
    z.string({ error: `El campo "${campo}" es obligatorio.` });
  const opcional = (max: number) => z.string().max(max, `Máximo ${max} caracteres.`).nullable();

  const rubro = requerido("rubro").transform((valor, ctx) => {
    const canonico = rubroCanonico.get(normalizarComparacion(valor));
    if (!canonico) {
      ctx.addIssue({
        code: "custom",
        message:
          rubros.length > 0
            ? `Rubro "${valor}" no válido. Rubros del evento: ${rubros.join(", ")}.`
            : `Rubro "${valor}" no válido: el evento todavía no tiene rubros cargados.`,
      });
      return z.NEVER;
    }
    return canonico;
  });

  const premiado = requerido("premiado").transform((valor, ctx) => {
    if (!esValorDe(PREMIADO_VALORES, valor)) {
      ctx.addIssue({
        code: "custom",
        message: `Valor "${valor}" no válido. Use exactamente: SI / NO (en mayúsculas).`,
      });
      return z.NEVER;
    }
    return valor === "SI";
  });

  return z.object({
    nombre_apellido: requerido("nombre_apellido").max(200, "Máximo 200 caracteres."),
    empresa: requerido("empresa").max(200, "Máximo 200 caracteres."),
    rubro: usaRubros ? rubro : z.null().transform(() => null),
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
    premiado: usaPremiados ? premiado : z.null().transform(() => false),
    cargo: opcional(200),
    sector: opcional(50),
    dni: z
      .string()
      .nullable()
      .transform((valor, ctx) => {
        if (valor === null) return null;
        const dni = normalizarDni(valor);
        if (!/^[0-9A-Z]{4,20}$/.test(dni)) {
          ctx.addIssue({
            code: "custom",
            message: `DNI "${valor}" no válido: solo números o letras (se aceptan puntos y espacios).`,
          });
          return z.NEVER;
        }
        return dni;
      }),
  });
}

/**
 * Valida encabezados y filas de la hoja "Invitados" según la configuración del evento.
 * Función pura: no toca la base de datos, para poder testearla y usarla en modo "previsualizar".
 */
export function validarInvitados(
  encabezados: unknown[],
  filas: FilaCruda[],
  contexto: ContextoValidacion,
): ResultadoValidacion {
  const { indicePorCampo, errores, advertencias } = validarEncabezados(encabezados, contexto);
  const resultado: ResultadoValidacion = {
    columnasPresentes: [...indicePorCampo.keys()],
    filasValidas: [],
    errores,
    advertencias,
    totalFilas: 0,
  };

  // Si faltan columnas no tiene sentido validar fila por fila: todas fallarían igual.
  if (errores.length > 0) return resultado;

  const columnas = columnasDelEvento(contexto);
  const esquema = esquemaFila(contexto);
  const filaPorDni = new Map<string, number>();
  const filaPorClave = new Map<string, { fila: number; conDni: boolean }>();

  for (const { fila, celdas } of filas) {
    const valores = Object.fromEntries(
      columnas.map(({ campo }) => {
        const indice = indicePorCampo.get(campo);
        return [campo, indice === undefined ? null : limpiarTexto(celdas[indice])];
      }),
    );

    // Filas totalmente vacías (muy comunes al final de un Excel) se ignoran.
    if (Object.values(valores).every((v) => v === null)) continue;
    resultado.totalFilas++;

    const parseo = esquema.safeParse({ rubro: null, premiado: null, ...valores });
    if (!parseo.success) {
      for (const issue of parseo.error.issues) {
        errores.push({ fila, campo: String(issue.path[0] ?? ""), mensaje: issue.message });
      }
      continue;
    }

    const d = parseo.data;
    const claveNombre = claveInvitado(d.nombre_apellido, d.empresa);

    if (d.dni !== null) {
      const filaPrevia = filaPorDni.get(d.dni);
      if (filaPrevia !== undefined) {
        errores.push({
          fila,
          campo: "dni",
          mensaje: `DNI ${d.dni} repetido: ya aparece en la fila ${filaPrevia}.`,
        });
        continue;
      }
      filaPorDni.set(d.dni, fila);
    }

    // Homónimos (mismo nombre y empresa) solo se aceptan si ambos tienen DNI.
    const previa = filaPorClave.get(claveNombre);
    if (previa && (!previa.conDni || d.dni === null)) {
      errores.push({
        fila,
        campo: "nombre_apellido",
        mensaje: `"${d.nombre_apellido}" de "${d.empresa}" ya aparece en la fila ${previa.fila}. Si son personas distintas, cargue el DNI de ambas.`,
      });
      continue;
    }
    filaPorClave.set(claveNombre, { fila, conDni: d.dni !== null });

    resultado.filasValidas.push({
      fila,
      invitado: {
        nombreApellido: d.nombre_apellido,
        empresa: d.empresa,
        rubro: d.rubro,
        confirmacion: d.confirmacion,
        premiado: d.premiado,
        cargo: d.cargo,
        dni: d.dni,
        sector: d.sector,
        claveNombre,
      },
    });
  }

  if (resultado.totalFilas === 0) {
    errores.push({ fila: null, campo: null, mensaje: "La hoja no tiene invitados cargados." });
  }

  return resultado;
}
