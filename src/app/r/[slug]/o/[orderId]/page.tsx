"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Item = { id: string; name: string; price: number; qty: number; notes: string | null };

type PublicOrderResponse = {
  restaurant: { slug: string; name: string };
  order: {
    id: string;
    folio: number;
    status: string;
    created_at: string;
    customer_name: string;
    delivery_type: "delivery" | "pickup";
    address: any | null;
    subtotal: number;
    delivery_fee: number;
    total: number;
  };
  items: Item[];
};

export default function PublicTrackingPage() {
  const params = useParams<{ slug: string; orderId: string }>();
  const search = useSearchParams();

  const slug = params.slug;
  const orderId = params.orderId;
  const token = search.get("t") || "";

  const [data, setData] = useState<PublicOrderResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);

    if (!token) {
      setLoading(false);
      setErr("Falta el token de seguimiento.");
      return;
    }

    const { data: res, error } = await supabase.rpc("get_public_order", {
      p_order_id: orderId,
      p_token: token,
    });

    setLoading(false);

    if (error) {
      setErr(error.message);
      setData(null);
      return;
    }

    setData(res as PublicOrderResponse);
  }

  useEffect(() => {
    load();

    // refresco simple cada 5s para ver cambios de estado
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, token]);

  const statusText = useMemo(() => {
    const s = data?.order.status;
    if (!s) return "";
    const map: Record<string, string> = {
      pending: "Pendiente",
      preparing: "Preparando",
      on_the_way: "En camino",
      delivered: "Entregado",
      cancelled: "Cancelado",
    };
    return map[s] ?? s;
  }, [data?.order.status]);

  function formatAddress() {
    if (!data) return "";
    if (data.order.delivery_type !== "delivery") return "Pedido para recoger";
    const a = data.order.address;
    if (!a) return "Dirección no disponible";

    const main =
      `${a.street ?? ""} ${a.number ?? ""}`.trim() +
      (a.neighborhood ? `, ${a.neighborhood}` : "") +
      (a.city ? `, ${a.city}` : "");

    const refs = a.references ? ` · Ref: ${a.references}` : "";
    return (main || "Dirección incompleta") + refs;
  }

  if (loading) {
    return <div className="p-6 max-w-xl mx-auto">Cargando pedido...</div>;
  }

  if (err) {
    return (
      <div className="min-h-screen p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Seguimiento</h1>
        <div className="rounded-2xl border p-4 text-sm">{err}</div>
        <div className="mt-4">
          <Link className="px-4 py-2 rounded-lg border hover:bg-black/5" href={`/r/${slug}`}>
            Volver al menú
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen p-6 max-w-xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Seguimiento de pedido</h1>
        <p className="text-sm opacity-80">{data.restaurant.name}</p>
      </header>

      <section className="rounded-2xl border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Folio #{data.order.folio}</div>
          <div className="text-sm opacity-80">{statusText}</div>
        </div>

        <div className="text-sm opacity-80">
          {data.order.delivery_type === "delivery" ? "Entrega a domicilio" : "Recoger"} · {formatAddress()}
        </div>

        <div className="text-xs opacity-70">
          {new Date(data.order.created_at).toLocaleString()}
        </div>
      </section>

      <section className="rounded-2xl border p-4 mt-4">
        <div className="font-semibold mb-2">Productos</div>

        {data.items.length === 0 ? (
          <div className="text-sm opacity-80">Sin productos.</div>
        ) : (
          <div className="space-y-2">
            {data.items.map((it) => (
              <div key={it.id} className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm">
                    <b>{it.qty}×</b> {it.name}
                  </div>
                  {it.notes ? <div className="text-xs opacity-70">Nota: {it.notes}</div> : null}
                  <div className="text-xs opacity-70">${Number(it.price).toFixed(2)} c/u</div>
                </div>
                <div className="text-sm font-semibold">
                  ${Number(Number(it.price) * Number(it.qty)).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t mt-3 pt-3 space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="opacity-80">Subtotal</span>
            <span className="font-semibold">${Number(data.order.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="opacity-80">Envío</span>
            <span className="font-semibold">
              ${Number(data.order.delivery_type === "delivery" ? data.order.delivery_fee : 0).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="opacity-80">Total</span>
            <span className="font-bold">${Number(data.order.total).toFixed(2)}</span>
          </div>
        </div>
      </section>

      <div className="mt-4 flex gap-2">
        <Link className="px-4 py-2 rounded-lg border hover:bg-black/5" href={`/r/${slug}`}>
          Volver al menú
        </Link>
      </div>

      <p className="text-xs opacity-60 mt-4">
        Esta página se actualiza automáticamente cada 5 segundos.
      </p>
    </div>
  );
}
