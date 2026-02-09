"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function register() {
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Cuenta creada. Revisa tu correo si se solicita confirmación.");
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold mb-4">Crear cuenta</h1>

        <input
          className="w-full mb-3 rounded-xl bg-black/40 border border-white/10 px-4 py-3"
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="w-full mb-4 rounded-xl bg-black/40 border border-white/10 px-4 py-3"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={register}
          disabled={loading}
          className="w-full rounded-xl bg-white/10 hover:bg-white/20 px-4 py-3"
        >
          {loading ? "Creando..." : "Crear cuenta"}
        </button>
      </div>
    </div>
  );
}
