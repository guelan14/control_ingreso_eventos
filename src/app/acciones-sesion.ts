"use server";

import { redirect } from "next/navigation";
import { cerrarSesionActual } from "@/lib/auth/dal";

export async function salir() {
  await cerrarSesionActual();
  redirect("/login");
}
