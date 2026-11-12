"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

const INTERVALO_MS = 120;
const ANCHO_ANALISIS = 640;

/**
 * Lector de QR con la cámara trasera. Usa jsQR (JavaScript puro) en vez de la API BarcodeDetector,
 * que no existe en Safari de iPhone ni en Firefox. La cámara solo se puede usar por HTTPS (o localhost).
 */
export function EscanerQr({ onLeido, onCerrar }: { onLeido: (texto: string) => void; onCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // La función más reciente, sin reiniciar la cámara cada vez que cambia.
  const alLeer = useRef(onLeido);
  useEffect(() => {
    alLeer.current = onLeido;
  }, [onLeido]);

  useEffect(() => {
    let flujo: MediaStream | null = null;
    let cuadro = 0;
    let ultimo = 0;
    let terminado = false;
    const lienzo = document.createElement("canvas");
    const contexto = lienzo.getContext("2d", { willReadFrequently: true });

    const analizar = (ahora: number) => {
      if (terminado) return;
      cuadro = requestAnimationFrame(analizar);
      const v = video.current;
      if (!v || !contexto || v.readyState < v.HAVE_ENOUGH_DATA || ahora - ultimo < INTERVALO_MS) return;
      ultimo = ahora;
      const escala = Math.min(1, ANCHO_ANALISIS / v.videoWidth);
      lienzo.width = Math.round(v.videoWidth * escala);
      lienzo.height = Math.round(v.videoHeight * escala);
      contexto.drawImage(v, 0, 0, lienzo.width, lienzo.height);
      const imagen = contexto.getImageData(0, 0, lienzo.width, lienzo.height);
      const qr = jsQR(imagen.data, imagen.width, imagen.height, { inversionAttempts: "dontInvert" });
      if (qr?.data) {
        terminado = true;
        navigator.vibrate?.(80);
        alLeer.current(qr.data);
      }
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("La cámara solo funciona si el sistema se abre por HTTPS. Busque al invitado por nombre.");
        return;
      }
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (terminado) return flujo.getTracks().forEach((t) => t.stop());
        if (video.current) {
          video.current.srcObject = flujo;
          await video.current.play();
        }
        cuadro = requestAnimationFrame(analizar);
      } catch (e) {
        const nombre = (e as DOMException).name;
        setError(
          nombre === "NotAllowedError"
            ? "No hay permiso para usar la cámara. Habilítelo en el navegador o busque por nombre."
            : nombre === "NotFoundError"
              ? "Este dispositivo no tiene cámara. Busque al invitado por nombre."
              : "No se pudo abrir la cámara. Busque al invitado por nombre.",
        );
      }
    })();

    return () => {
      terminado = true;
      cancelAnimationFrame(cuadro);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
          {error}
        </p>
      ) : (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} muted playsInline className="aspect-square w-full object-cover" />
          <div className="pointer-events-none absolute inset-[15%] rounded-xl border-4 border-white/80" />
          <p className="absolute inset-x-0 bottom-2 text-center text-sm text-white">Apunte al código QR del invitado</p>
        </div>
      )}
      <button onClick={onCerrar} className="w-full rounded-xl border-2 border-slate-300 py-3 text-lg font-semibold">
        Buscar por nombre
      </button>
    </div>
  );
}
