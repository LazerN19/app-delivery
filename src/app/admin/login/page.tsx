"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ Si ya hay sesión, redirige correctamente (orders vs onboarding)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await redirectAfterLogin(data.user.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function redirectAfterLogin(userId: string) {
    // Verifica si ya existe restaurante para ese owner
    const { data: r, error } = await supabase
      .from("restaurants")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();

    // Si hay error raro, por seguridad manda a onboarding
    if (error) {
      console.error("redirectAfterLogin error:", error);
      router.replace("/admin/onboarding");
      return;
    }

    if (r?.id) {
      router.replace("/admin/orders");
    } else {
      router.replace("/admin/onboarding");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error || !data.user) {
      alert(error?.message || "No se pudo iniciar sesión.");
      return;
    }

    await redirectAfterLogin(data.user.id);
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-md mx-auto px-6 py-14">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-white/60 mt-2">
          Inicia sesión para ver tus pedidos.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4"
        >
          <input
            className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
            placeholder="Correo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          <input
            className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
            placeholder="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl border border-white/15 bg-white/10 hover:bg-white/15 transition px-4 py-3 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/admin/forgot")}
            className="w-full text-sm text-white/70 hover:text-white transition"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </form>
      </div>
    </div>
  );
}
