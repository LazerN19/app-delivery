"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type OrderItem = {
  id: string;
  name_snapshot: string;
  price_snapshot: number;
  qty: number;
  notes: string | null;
};

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_icon: string | null;
  brand_text: string | null;
  brand_tagline: string | null;
  accent_color: string | null;
  brand_mode: string | null;
};

type Order = {
  id: string;
  folio: number;
  status: string;
  created_at: string;
  delivery_type: "delivery" | "pickup";
  address: any | null;
  total: number;
  subtotal: number;
  delivery_fee: number;
  notes: string | null;
  public_tracking_token: string;
  restaurants: Restaurant;
  order_items: OrderItem[];
};

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function deriveAccent(r: Restaurant) {
  return r.accent_color || "#ff3b30";
}

function safeMode(m: string | null) {
  const v = (m || "auto").toLowerCase();
  const allowed = ["auto", "logo", "icon", "text", "logo_text", "icon_text"];
  return allowed.includes(v) ? v : "auto";
}

function getBrand(r: Restaurant) {
  const mode = safeMode(r.brand_mode);
  const logo = r.logo_url || null;
  const icon = r.brand_icon || "🍽️";
  const text = (r.brand_text || r.name || "Restaurante").trim();
  const tagline = (r.brand_tagline || "Ordena directo • Sin comisiones").trim();

  if (mode === "logo" && logo) return { kind: "logo" as const, logo, icon, text, tagline };
  if (mode === "icon") return { kind: "icon" as const, logo, icon, text, tagline };
  if (mode === "text") return { kind: "text" as const, logo, icon, text, tagline };
  if (mode === "logo_text" && logo) return { kind: "logo_text" as const, logo, icon, text, tagline };
  if (mode === "icon_text") return { kind: "icon_text" as const, logo, icon, text, tagline };

  if (logo) return { kind: "logo_text" as const, logo, icon, text, tagline };
  return { kind: "icon_text" as const, logo, icon, text, tagline };
}

const STATUS_ORDER = ["pending", "preparing", "on_the_way", "delivered"] as const;

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  preparing: "Preparando",
  on_the_way: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

function pillStyle(status: string) {
  if (status === "pending") return "border-yellow-500/35 bg-yellow-500/10 text-yellow-200";
  if (status === "preparing") return "border-blue-500/35 bg-blue-500/10 text-blue-200";
  if (status === "on_the_way") return "border-purple-500/35 bg-purple-500/10 text-purple-200";
  if (status === "delivered") return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
  if (status === "cancelled") return "border-red-500/35 bg-red-500/10 text-red-200";
  return "border-white/15 bg-white/5 text-white/80";
}

function formatAddress(o: Order) {
  if (o.delivery_type !== "delivery") return "Pedido para recoger";
  if (!o.address) return "Dirección no disponible";
  const a = o.address;
  const main =
    `${a.street ?? ""} ${a.number ?? ""}`.trim() +
    (a.neighborhood ? `, ${a.neighborhood}` : "") +
    (a.city ? `, ${a.city}` : "");
  const refs = a.references ? ` · Ref: ${a.references}` : "";
  return (main || "Dirección incompleta") + refs;
}

export default function TrackingClient({ initial }: { initial: Order }) {
  const [order, setOrder] = useState<Order>(initial);

  const rest = order.restaurants;
  const accent = deriveAccent(rest);
  const brand = getBrand(rest);

  // ✅ Realtime: se actualiza cuando cambie el status del pedido
  useEffect(() => {
    const channel = supabase
      .channel(`tracking-${order.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${order.id}` },
        async () => {
          const { data } = await supabase
            .from("orders")
            .select(
              `id, folio, status, created_at, delivery_type, address, total, subtotal, delivery_fee, notes, public_tracking_token,
               restaurants (id,name,slug,logo_url,brand_icon,brand_text,brand_tagline,accent_color,brand_mode),
               order_items (id,name_snapshot,price_snapshot,qty,notes)`
            )
            .eq("id", order.id)
            .single();

          if (data) setOrder(data as any);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [order.id]);

  const statusLabel = STATUS_LABEL[order.status] ?? order.status;

  const steps = useMemo(() => {
    if (order.status === "cancelled") return ["pending", "cancelled"];
    return STATUS_ORDER as unknown as string[];
  }, [order.status]);

  const activeIndex = useMemo(() => {
    if (order.status === "cancelled") return 1;
    const idx = steps.indexOf(order.status);
    return idx >= 0 ? idx : 0;
  }, [steps, order.status]);

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden" style={{ overflowX: "clip" as any }}>
      {/* Fondo */}
      <div
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          background:
            `radial-gradient(1200px 600px at 20% 10%, ${accent}22 0%, transparent 60%),` +
            `radial-gradient(900px 500px at 80% 20%, #ff950022 0%, transparent 55%),` +
            `radial-gradient(700px 450px at 40% 90%, #ffcc0020 0%, transparent 55%)`,
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/70 backdrop-blur-xl">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold tracking-tight">Seguimiento</div>
            <div className="text-xs text-white/55">Pedido público</div>
          </div>

          <Link
            href={`/r/${rest.slug}`}
            className="px-4 py-2 rounded-full border border-white/12 bg-white/5 hover:bg-white/10 transition text-sm"
            style={{ borderColor: `${accent}35` }}
          >
            Ver menú
          </Link>
        </div>
      </header>

      <main className="relative max-w-xl mx-auto px-5 py-6 space-y-4">
        {/* Card principal */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                {(brand.kind === "logo" || brand.kind === "logo_text") && brand.logo ? (
                  <div className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={brand.logo} alt="logo" className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div
                    className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-xl"
                    style={{ borderColor: `${accent}45`, backgroundColor: `${accent}12` }}
                  >
                    {brand.icon}
                  </div>
                )}

                <div className="min-w-0">
                  <div className="text-sm text-white/70 truncate">{rest.name}</div>
                  <div className="text-xl font-semibold truncate">Folio #{order.folio}</div>
                </div>
              </div>

              <div className="mt-3 text-sm text-white/70">
                {order.delivery_type === "delivery" ? "Entrega" : "Recoger"} · {formatAddress(order)}
              </div>
              <div className="text-xs text-white/45 mt-1">{new Date(order.created_at).toLocaleString()}</div>
            </div>

            <span
              className={`shrink-0 inline-flex items-center px-3 py-1 rounded-full border text-xs font-semibold ${pillStyle(
                order.status
              )}`}
            >
              {statusLabel}
            </span>
          </div>

          {/* ✅ Notas del pedido */}
          {order.notes ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="text-xs text-white/60 mb-1">Notas del cliente</div>
              <div className="text-sm text-white/85 whitespace-pre-wrap">{order.notes}</div>
            </div>
          ) : null}
        </section>

        {/* Estado */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold mb-3">Estado</div>

          <div className="space-y-3">
            {steps.map((s, idx) => {
              const done = idx < activeIndex;
              const active = idx === activeIndex;

              return (
                <div key={s} className="flex items-center gap-3">
                  <div
                    className={[
                      "h-3.5 w-3.5 rounded-full border",
                      done ? "bg-white/70 border-white/30" : active ? "border-white/40" : "border-white/15",
                    ].join(" ")}
                    style={active ? { backgroundColor: `${accent}55`, borderColor: `${accent}75` } : undefined}
                  />
                  <div className="flex-1">
                    <div
                      className={[
                        "text-sm",
                        active ? "text-white font-semibold" : done ? "text-white/80" : "text-white/55",
                      ].join(" ")}
                    >
                      {STATUS_LABEL[s] ?? s}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-xs text-white/45 mt-4">Se actualiza automáticamente.</div>
        </section>

        {/* Productos */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold mb-3">Productos</div>

          <div className="space-y-3">
            {(order.order_items ?? []).map((it) => (
              <div key={it.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {it.qty}× {it.name_snapshot}
                    </div>
                    <div className="text-xs text-white/55 mt-1">{money(it.price_snapshot)} c/u</div>
                    {it.notes ? <div className="text-xs text-white/60 mt-2">Nota: {it.notes}</div> : null}
                  </div>
                  <div className="text-sm font-semibold whitespace-nowrap">
                    {money(Number(it.price_snapshot) * Number(it.qty))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
            <div className="flex justify-between text-white/70">
              <span>Subtotal</span>
              <span>{money(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-white/70 mt-2">
              <span>Envío</span>
              <span>{money(order.delivery_type === "delivery" ? order.delivery_fee : 0)}</span>
            </div>
            <div className="flex justify-between font-semibold mt-3">
              <span>Total</span>
              <span>{money(order.total)}</span>
            </div>
          </div>
        </section>

        <div className="text-center text-xs text-white/40">Tip: guarda este link para ver el estado del pedido.</div>
      </main>
    </div>
  );
}
