"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "admin_sound_enabled_v1";
const SOUND_SRC = "/sounds/order.mp3";

export function useOrderSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const unlockedRef = useRef(false);

  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // preference
    try {
      setEnabled(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setEnabled(false);
    }

    // audio element
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

    const t = window.setTimeout(() => {
      const cur = audioRef.current;
      if (cur?.readyState && cur.readyState >= 2) setReady(true);
    }, 1200);

    return () => {
      window.clearTimeout(t);
      a.removeEventListener("canplay", onCanPlay);
      a.removeEventListener("canplaythrough", onCanPlay);
      a.removeEventListener("error", onErr);
      a.pause();
      audioRef.current = null;
      unlockedRef.current = false;

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

  // ✅ Unlock robusto (AudioContext + beep silencioso + prueba mp3)
  async function unlock() {
    try {
      const AC =
        (window as any).AudioContext ||
        (window as any).webkitAudioContext;

      if (!AC) return false;

      if (!ctxRef.current) ctxRef.current = new AC();
      const ctx = ctxRef.current;
      if (!ctx) return false; // TS guard (ya no marca null)

      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // beep silencioso MUY corto (desbloquea audio estable)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.03);

      // prueba real del mp3 sin molestar
      const a = audioRef.current;
      if (!a) return false;

      const prevVol = a.volume;
      a.volume = 0.05;
      a.currentTime = 0;

      const p = a.play();
      if (p) await p;

      a.pause();
      a.currentTime = 0;
      a.volume = prevVol;

      unlockedRef.current = true;
      return true;
    } catch {
      unlockedRef.current = false;
      return false;
    }
  }

  async function play() {
    if (!enabled) return;
    if (!unlockedRef.current) return;

    const a = audioRef.current;
    if (!a) return;

    try {
      a.currentTime = 0;
      const p = a.play();
      if (p) await p;
    } catch {
      // silencioso
    }
  }

  return {
    enabled,
    setEnabled,
    ready,
    unlock,
    play,
    isUnlocked: unlockedRef.current,
  };
}
