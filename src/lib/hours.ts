type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function currentDayKey(d = new Date()): DayKey {
  return DAY_KEYS[d.getDay()] as DayKey;
}

/**
 * Devuelve el objeto del día en formato:
 * { closed?: boolean, open?: "HH:MM", close?: "HH:MM" }
 * Soporta:
 * - hours.days.mon...
 * - hours.mon... (formato directo)
 * - (si tu formato viejo era distinto, aquí lo puedes mapear)
 */
function getDayHours(hours: any, day: DayKey) {
  if (!hours) return null;

  // Nuevo: { days: { mon: {...} } }
  if (hours?.days?.[day]) return hours.days[day];

  // Directo: { mon: {...} }
  if (hours?.[day]) return hours[day];

  // Si tu formato viejo era algo como hours.week[day] o similar, aquí lo agregas.
  return null;
}

export function getOpenStatus(hours: any) {
  const now = new Date();
  const day = currentDayKey(now);
  const minsNow = now.getHours() * 60 + now.getMinutes();

  const d = getDayHours(hours, day);

  // Si no hay horario configurado, mejor NO bloquear (puedes cambiarlo a false si quieres)
  if (!d) {
    return { isOpen: true, reason: "Horario no configurado" };
  }

  // ✅ CLOSED robusto: acepta boolean, string, number
  const closedVal = (d as any).closed ?? (d as any).is_closed ?? (d as any).enabled;
  // Si usas "enabled" (true=abierto), lo invertimos:
  if (typeof closedVal === "boolean") {
    if (closedVal === true && (d as any).enabled === undefined) return { isOpen: false, reason: "Cerrado hoy" };
    if ((d as any).enabled === false) return { isOpen: false, reason: "Cerrado hoy" };
  } else {
    const s = String(closedVal).toLowerCase().trim();
    if (s === "true" || s === "1" || s === "closed" || s === "false" && (d as any).enabled === false) {
      // ojo: el último caso es para enabled=false
      if ((d as any).enabled === false || s === "true" || s === "1" || s === "closed") {
        return { isOpen: false, reason: "Cerrado hoy" };
      }
    }
  }

  const openStr = String((d as any).open || "").trim();
  const closeStr = String((d as any).close || "").trim();
  const openM = toMinutes(openStr);
  const closeM = toMinutes(closeStr);

  // ✅ Si está mal configurado el horario, mejor CERRAR (para evitar pedidos fuera de hora)
  if (openM === null || closeM === null || !openStr || !closeStr) {
    return { isOpen: false, reason: "Horario inválido" };
  }

  // Normal: 09:00-21:00
  if (closeM > openM) {
    const isOpen = minsNow >= openM && minsNow < closeM;
    return {
      isOpen,
      reason: isOpen ? `Abierto (cierra ${closeStr})` : `Cerrado (abre ${openStr})`,
    };
  }

  // Nocturno: 18:00-02:00
  const isOpen = minsNow >= openM || minsNow < closeM;
  return {
    isOpen,
    reason: isOpen ? `Abierto (cierra ${closeStr})` : `Cerrado (abre ${openStr})`,
  };
}
