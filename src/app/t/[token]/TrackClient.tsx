"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type PublicOrderResponse = {
  order: {
    id: string;
    folio: number;
    status: string;
    customer_name: string;
    customer_phone: string;
    delivery_type: "delivery" | "pickup";
    address: any | null;
    subtotal: number;
    delivery_fee: number;
    total: number;
    created_at: string;
    notes?: string | null;
  };
  restaurant: { name: string; slug: string };
  items: { name: string; qty: number; price: number; notes: string | null }[];
};

const STATUS_FLOW = ["pending", "preparing", "on_the_way", "delivered"] as const;

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  preparing: "Preparando",
  on_the_way: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function StatusPill({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const styles =
    status === "pending"
      ? "bg-yellow-500/15 text-yellow-300 border-yellow-500/35"
      : status === "preparing"
      ? "bg-blue-500/15 text-blue-300 border-blue-500/35"
      : status === "on_the_way"
      ? "bg-purple-500/15 text-purple-300 border-purple-500/35"
      : status === "delivered"
      ? "bg-green-500/15 text-green-300 border-green-500/35"
      : status === "cancelled"
      ? "bg-red-500/15 text-red-300 border-red-500/35"
      : "bg-white/5 text-white border-white/15";

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
}

function formatAddress(order: PublicOrderResponse["order"]) {
  if (order.delivery_type !== "delivery") return "Pedido para recoger";
  if (!order.address) return "Dirección no disponible";
  const a = order.address;
  const main =
    `${a.street ?? ""} ${a.number ?? ""}`.trim() +
    (a.neighborhood ? `, ${a.neighborhood}` : "") +
    (a.city ? `, ${a.city}` : "");
  const refs = a.references ? ` · Ref: ${a.references}` : "";
  return (main || "Dirección incompleta") + refs;
}

export default function TrackClient({ token }: { token: string }) {
  const [data, setData] = useState<PublicOrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  async function fetchOrder() {
    setErr(null);
    setLoading(true);

    const { data: res, error } = await supabase.rpc("get_public_order", { p_token: token });

    setLoading(false);

    if (error) {
      setErr(error.message);
      setData(null);
      return;
    }

    if (!res) {
      setData(null);
      return;
    }

    setData(res as PublicOrderResponse);
  }

  // 1) carga inicial + auto refresh cada 5s
  useEffect(() => {
    fetchOrder();
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (tick === 0) return;
    fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const progressIndex = useMemo(() => {
    const s = data?.order?.status;
    if (!s) return 0;
    const idx = STATUS_FLOW.indexOf(s as any);
    if (idx >= 0) return idx;
    if (s === "cancelled") return -1;
    return 0;
  }, [data?.order?.status]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-20 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold tracking-tight">Seguimiento</div>
            <div className="text-xs text-white/60">Pedido público</div>
          </div>
          {data?.restaurant?.slug ? (
            <Link
              href={`/r/${data.restaurant.slug}`}
              className="px-4 py-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition text-sm"
            >
              Ver menú
            </Link>
          ) : null}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-5 py-6 space-y-4">
        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-white/70">
            Cargando pedido...
          </div>
        ) : err ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="font-medium">Error</div>
            <div className="text-sm text-white/70 mt-1">{err}</div>
          </div>
        ) : !data?.order ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="font-medium">Pedido no encontrado</div>
            <div className="text-sm text-white/70 mt-1">Verifica el link.</div>
          </div>
        ) : (
          <>
            {/* Resumen */}
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-white/60">{data.restaurant.name}</div>
                  <div className="text-xl font-semibold tracking-tight">Folio #{data.order.folio}</div>
                </div>
                <StatusPill status={data.order.status} />
              </div>

              <div className="text-sm text-white/70 mt-3">
                {data.order.delivery_type === "delivery" ? "Entrega a domicilio" : "Recoger"} ·{" "}
                {formatAddress(data.order)}
              </div>

              <div className="text-xs text-white/50 mt-2">
                {new Date(data.order.created_at).toLocaleString()}
              </div>
            </section>

            {/* Progreso */}
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="font-semibold tracking-tight mb-3">Estado</div>

              {data.order.status === "cancelled" ? (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
                  Este pedido fue cancelado.
                </div>
              ) : (
                <div className="space-y-3">
                  {STATUS_FLOW.map((k, idx) => {
                    const done = idx <= progressIndex;
                    return (
                      <div key={k} className="flex items-center gap-3">
                        <div
                          className={[
                            "h-2.5 w-2.5 rounded-full border",
                            done ? "bg-white border-white/60" : "bg-transparent border-white/20",
                          ].join(" ")}
                        />
                        <div className={done ? "text-white" : "text-white/60"}>{STATUS_LABEL[k]}</div>
                      </div>
                    );
                  })}
                  <div className="text-xs text-white/50 pt-2">Se actualiza automáticamente.</div>
                </div>
              )}
            </section>

            {/* Productos */}
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="font-semibold tracking-tight mb-3">Productos</div>

              {data.items.length === 0 ? (
                <div className="text-sm text-white/70">Sin productos.</div>
              ) : (
                <div className="space-y-2">
                  {data.items.map((it, i) => (
                    <div key={`${it.name}-${i}`} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm">
                          <b>{it.qty}×</b> {it.name}
                        </div>
                        <div className="text-xs text-white/50 mt-1">{money(it.price)} c/u</div>
                      </div>
                      <div className="text-sm font-semibold whitespace-nowrap">
                        {money(Number(it.price) * Number(it.qty))}
                      </div>
                    </div>
                  ))}

                  <div className="border-t border-white/10 pt-3 mt-3 text-sm space-y-1">
                    <div className="flex items-center justify-between text-white/70">
                      <span>Subtotal</span>
                      <span className="text-white/90 font-medium">{money(data.order.subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-white/70">
                      <span>Envío</span>
                      <span className="text-white/90 font-medium">
                        {money(data.order.delivery_type === "delivery" ? data.order.delivery_fee : 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/80">Total</span>
                      <span className="text-white font-semibold">{money(data.order.total)}</span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Datos cliente */}
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="font-semibold tracking-tight mb-3">Datos</div>
              <div className="text-sm text-white/70">
                {data.order.customer_name} · {data.order.customer_phone}
              </div>
              {data.order.notes ? <div className="text-sm text-white/60 mt-2">Notas: {data.order.notes}</div> : null}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
