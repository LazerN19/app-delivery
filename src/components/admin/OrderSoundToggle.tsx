"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const KEY = "admin_sound_enabled_v1";

type Props = {
  accent?: string;
  onEnabledChange?: (enabled: boolean) => void;
};

export default function OrderSoundToggle({ accent = "#ff3b30", onEnabledChange }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [armed, setArmed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cargar preferencia
  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    const val = raw === "1";
    setEnabled(val);
    onEnabledChange?.(val);
  }, [onEnabledChange]);

  // Persistir
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY, enabled ? "1" : "0");
    onEnabledChange?.(enabled);
  }, [enabled, onEnabledChange]);

  // Crear audio 1 vez
  useEffect(() => {
    if (typeof window === "undefined") return;
    const a = new Audio("/sounds/order.mp3");
    a.preload = "auto";
    a.volume = 1;
    audioRef.current = a;

    return () => {
      audioRef.current = null;
    };
  }, []);

  const label = useMemo(() => {
    if (!enabled) return "Sonido: apagado";
    if (!armed) return "Sonido: activar";
    return "Sonido: encendido";
  }, [enabled, armed]);

  async function armSound() {
    // Esto debe pasar por interacción del usuario (click)
    try {
      const a = audioRef.current;
      if (!a) return;

      // intentamos reproducir (beep corto)
      a.currentTime = 0;
      await a.play();

      // pausar rápidamente para que no sea molesto (opcional)
      setTimeout(() => {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {}
      }, 250);

      setArmed(true);
      setEnabled(true);
    } catch {
      // Si aún falla, normalmente es porque el navegador no considera el evento como gesto del usuario
      alert("Tu navegador bloqueó el sonido. Da click en la página y vuelve a intentar.");
      setArmed(false);
    }
  }

  function toggle() {
    if (enabled) {
      setEnabled(false);
      setArmed(false);
      return;
    }
    // Si quieren activarlo, hay que armarlo
    armSound();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="px-4 py-2 rounded-full border text-sm transition"
      style={{
        borderColor: enabled ? `${accent}55` : "rgba(255,255,255,0.15)",
        backgroundColor: enabled ? `${accent}18` : "rgba(255,255,255,0.05)",
      }}
      title={enabled ? "Desactivar sonido" : "Activar sonido (requiere click)"}
    >
      {label}
    </button>
  );
}

// helper para reproducir desde Orders (cuando llegue pedido)
export async function playOrderSound() {
  // Creamos audio "one-shot" para evitar estados raros
  // (si prefieres reusar, también se puede, pero esto suele ser más estable)
  try {
    const a = new Audio("/sounds/order.mp3");
    a.volume = 1;
    a.currentTime = 0;
    await a.play();
  } catch {
    // Silencioso: si falla, no molestamos al usuario
  }
}

export function isSoundEnabled() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}
