"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function Onboarding() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push("/admin/login");
      else setUserId(data.user.id);
    });
  }, [router]);

  useEffect(() => {
    if (!slug && name) setSlug(slugify(name));
  }, [name, slug]);

  async function createRestaurant(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;

    setLoading(true);
    setMsg(null);

    const { error } = await supabase.from("restaurants").insert({
      owner_id: userId,
      name,
      slug,
      delivery_fee: Number(deliveryFee || 0),
      theme: {},
      hours: {},
      is_active: true,
    });

    setLoading(false);

    if (error) return setMsg(error.message);

    router.push("/admin/orders");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={createRestaurant} className="w-full max-w-md rounded-2xl border p-6 space-y-4">
        <h1 className="text-xl font-semibold">Crear tu negocio</h1>
        <p className="text-sm opacity-80">Esto genera tu link público: /r/tu-slug</p>

        <input
          className="w-full border rounded-lg p-3"
          placeholder="Nombre del negocio"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <input
          className="w-full border rounded-lg p-3"
          placeholder="Slug (ej: tacos-el-buen-sabor)"
          value={slug}
          onChange={(e) => setSlug(slugify(e.target.value))}
          required
        />

        <input
          className="w-full border rounded-lg p-3"
          placeholder="Costo de envío (ej: 25)"
          value={deliveryFee}
          onChange={(e) => setDeliveryFee(e.target.value)}
          inputMode="decimal"
        />

        {msg ? <div className="text-sm">{msg}</div> : null}

        <button className="w-full rounded-lg p-3 border hover:bg-black/5 disabled:opacity-60" disabled={loading}>
          {loading ? "..." : "Crear"}
        </button>
      </form>
    </div>
  );
}
