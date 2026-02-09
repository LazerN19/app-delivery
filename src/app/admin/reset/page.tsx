"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function reset() {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin/login`,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold mb-4">Recuperar contraseña</h1>

        {sent ? (
          <p className="text-sm text-white/70">
            Revisa tu correo para continuar.
          </p>
        ) : (
          <>
            <input
              className="w-full mb-4 rounded-xl bg-black/40 border border-white/10 px-4 py-3"
              placeholder="Correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <button
              onClick={reset}
              className="w-full rounded-xl bg-white/10 hover:bg-white/20 px-4 py-3"
            >
              Enviar enlace
            </button>
          </>
        )}
      </div>
    </div>
  );
}
