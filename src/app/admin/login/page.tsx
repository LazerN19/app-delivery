"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data.user) {
      setLoading(false);
      setErrorMsg(error?.message ?? "No se pudo iniciar sesión.");
      return;
    }

    // ✅ Al iniciar sesión, verificamos si ya existe restaurante del owner
    const { data: rest, error: rErr } = await supabase
      .from("restaurants")
      .select("id")
      .eq("owner_id", data.user.id)
      .maybeSingle();

    setLoading(false);

    // Si hubo error consultando, igual mandamos a orders (para no atorarlo)
    if (rErr) {
      router.push("/admin/orders");
      return;
    }

    // ✅ Redirección correcta
    if (!rest) router.push("/admin/onboarding");
    else router.push("/admin/orders");
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="text-center mb-7">
            <h1 className="text-2xl font-semibold tracking-tight">Delivery App</h1>
            <p className="text-sm text-white/60 mt-1">
              Inicia sesión para ver tus pedidos.
            </p>
          </div>

          <form onSubmit={onLogin} className="space-y-3">
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

            {errorMsg ? (
              <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {errorMsg}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full rounded-2xl border border-white/15 bg-white/10 hover:bg-white/15 transition px-4 py-3 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-xs text-white/60">
            <Link href="/admin/register" className="hover:text-white transition">
              Crear usuario
            </Link>

            <Link href="/admin/reset" className="hover:text-white transition">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
