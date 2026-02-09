"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) return setMsg(error.message);

    router.push("/admin/onboarding");
  }

  async function handleSignup() {
    setLoading(true);
    setMsg(null);

    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) return setMsg(error.message);

    setMsg("Cuenta creada. Ahora inicia sesión.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={handleLogin} className="w-full max-w-sm rounded-2xl border p-6 space-y-4">
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-sm opacity-80">Inicia sesión para gestionar tu negocio.</p>

        <input
          className="w-full border rounded-lg p-3"
          placeholder="correo@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />

        <input
          className="w-full border rounded-lg p-3"
          placeholder="contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
        />

        {msg ? <div className="text-sm">{msg}</div> : null}

        <button
          className="w-full rounded-lg p-3 border hover:bg-black/5 disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? "..." : "Iniciar sesión"}
        </button>

        <button
          type="button"
          className="w-full rounded-lg p-3 border hover:bg-black/5 disabled:opacity-60"
          disabled={loading}
          onClick={handleSignup}
        >
          {loading ? "..." : "Crear cuenta"}
        </button>
      </form>
    </div>
  );
}
