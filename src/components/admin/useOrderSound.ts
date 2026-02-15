"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "admin_sound_enabled_v1";
const SOUND_SRC = "/sounds/order.mp3";

export function useOrderSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    // Cargar preferencia
    try {
      setEnabled(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setEnabled(false);
    }

    // Preparar audio (solo client)
    const a = new Audio(SOUND_SRC);
    a.preload = "auto";
    a.volume = 1.0;
    a.load();
    audioRef.current = a;

    const onCanPlay = () => setReady(true);
    const onErr = () => setReady(false);

    a.addEventListener("canplay", onCanPlay);
    a.addEventListener("canplaythrough", onCanPlay);
    a.addEventListener("error", onErr);

    return () => {
      a.removeEventListener("canplay", onCanPlay);
      a.removeEventListener("canplaythrough", onCanPlay);
      a.removeEventListener("error", onErr);

      a.pause();
      audioRef.current = null;

      setUnlocked(false);

      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch {}
  }, [enabled]);

  async function unlock() {
    try {
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return false;

      if (!ctxRef.current) ctxRef.current = new AC();
      const ctx = ctxRef.current;
      if (!ctx) return false;

      if (ctx.state === "suspended") await ctx.resume();

      // “beep” silencioso (ayuda a “activar” audio en algunos navegadores)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.03);

      const a = audioRef.current;
      if (!a) return false;

      // ✅ Test autoplay-friendly: reproducir en muted
      a.currentTime = 0;
      const prevMuted = a.muted;
      a.muted = true;

      const p = a.play();
      if (p) await p;

      a.pause();
      a.currentTime = 0;
      a.muted = prevMuted;

      setUnlocked(true);
      return true;
    } catch {
      setUnlocked(false);
      return false;
    }
  }

  // ✅ Auto-unlock: si estaba enabled y recargaste, el navegador bloquea audio.
  // Con esto se desbloquea con el primer click/tap/tecla en la página.
  useEffect(() => {
    if (!enabled) return;
    if (unlocked) return;

    const handler = async () => {
      await unlock();
    };

    window.addEventListener("pointerdown", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });

    return () => {
      window.removeEventListener("pointerdown", handler as any);
      window.removeEventListener("keydown", handler as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, unlocked]);

  async function play() {
    if (!enabled) return;
    if (!unlocked) return;

    const a = audioRef.current;
    if (!a) return;

    try {
      a.currentTime = 0;
      const p = a.play();
      if (p) await p;
    } catch {
      // Silencioso: el toast ya informa
    }
  }

  return {
    enabled,
    setEnabled,
    ready,
    unlock,
    play,
    isUnlocked: unlocked,
    src: SOUND_SRC,
  };
}
