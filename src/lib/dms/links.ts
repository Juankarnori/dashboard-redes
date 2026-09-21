import type { Platform } from "@/types/db";

/**
 * A dónde mandar al dueño para abrir un chat en la app de Meta cuando la API no alcanza
 * (mensaje sin texto, ventana de 24 h vencida). Facebook guarda el link del hilo; Instagram
 * no da link por hilo, así que se abre la bandeja de DMs. Solo https: el link viene de un
 * dato externo y no se lo pinta si no tiene la forma esperada.
 */
export function dmOpenInAppUrl(platform: Platform, link: string | null | undefined): string | null {
  if (platform === "facebook") return link && link.startsWith("https://") ? link : null;
  if (platform === "instagram") return "https://www.instagram.com/direct/inbox/";
  return null;
}

export const DM_NETWORK_LABELS: Partial<Record<Platform, string>> = {
  facebook: "Facebook",
  instagram: "Instagram",
};
