"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useOrderSound } from "@/components/admin/useOrderSound";

type Restaurant = { id: string; name: string; slug: string };

type OrderItem = {
  id: string;
  order_id: string;
  name_snapshot: string;
  price_snapshot: number;
  qty: number;
  notes: string | null;
};

type Order = {
  id: string;
  folio: number;
  status: string;
  customer_name: string;
  customer_phone: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  created_at: string;
  delivery_type: "delivery" | "pickup";
  address: any | null;
  archived_at: string | null;

  public_tracking_token: string | null;
  notes?: string | null;

  order_items: OrderItem[];
};

const STATUS_KEYS = ["pending", "preparing", "on_the_way", "delivered", "cancelled"] as const;

const STATUS_LABEL: Record<(typeof STATUS_KEYS)[number], string> = {
  pending: "Pendiente",
  preparing: "Preparando",
  on_the_way: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

function statusLabel(k: string) {
  if (k === "all") return "Todos";
  return (STATUS_LABEL as any)[k] ?? k;
}

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function normalize(s: string) {
  return (s || "").toLowerCase().trim();
}

function StatusPill({ status }: { status: string }) {
  const label = (STATUS_LABEL as any)[status] ?? status;

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
    <span
      className={[
        "inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium",
        "transition-all duration-200 ease-out animate-status-pop",
        styles,
      ].join(" ")}
    >
      {label}
    </span>
  );
}

type Toast = { id: string; title: string; body?: string };

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function AdminOrders() {
  const router = useRouter();
  const sound = useOrderSound();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ✅ Toasts internos
  const [toasts, setToasts] = useState<Toast[]>([]);
  function pushToast(title: string, body?: string) {
    const id = uid();
    setToasts((prev) => [{ id, title, body }, ...prev].slice(0, 3));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }

  function getTrackingUrl(token: string) {
    return `${window.location.origin}/t/${token}`;
  }

  function waLink(phoneRaw: string, text: string) {
    const phone = (phoneRaw || "").replace(/[^\d]/g, "");
    const encoded = encodeURIComponent(text);
    return `https://wa.me/${phone}?text=${encoded}`;
  }

  async function resolveRestaurant(): Promise<Restaurant | null> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      router.push("/admin/login");
      return null;
    }

    const { data: r, error: rErr } = await supabase
      .from("restaurants")
      .select("id,name,slug")
      .eq("owner_id", auth.user.id)
      .single();

    if (rErr || !r) {
      router.push("/admin/onboarding");
      return null;
    }

    return r as Restaurant;
  }

  async function loadAll(forceRestaurant?: Restaurant) {
    setLoading(true);

    const rest = forceRestaurant ?? (await resolveRestaurant());
    if (!rest) {
      setLoading(false);
      return;
    }
    setRestaurant(rest);

    let q = supabase
      .from("orders")
      .select(
        "id,folio,status,customer_name,customer_phone,total,subtotal,delivery_fee,created_at,delivery_type,address,archived_at,public_tracking_token,notes"
      )
      .eq("restaurant_id", rest.id);

    if (showArchived) q = q.not("archived_at", "is", null);
    else q = q.is("archived_at", null);

    const { data: o, error: oErr } = await q.order("created_at", { ascending: false });

    if (oErr) {
      console.error(oErr);
      setOrders([]);
      setLoading(false);
      return;
    }

    const ordersBase = (o ?? []) as Omit<Order, "order_items">[];
    const ids = ordersBase.map((x) => x.id);

    let items: OrderItem[] = [];
    if (ids.length > 0) {
      const { data: it, error: itErr } = await supabase
        .from("order_items")
        .select("id,order_id,name_snapshot,price_snapshot,qty,notes")
        .in("order_id", ids);

      if (itErr) console.error(itErr);
      items = (it ?? []) as OrderItem[];
    }

    const itemsByOrder = new Map<string, OrderItem[]>();
    for (const it of items) {
      const arr = itemsByOrder.get(it.order_id) ?? [];
      arr.push(it);
      itemsByOrder.set(it.order_id, arr);
    }

    setOrders(
      ordersBase.map((ord) => ({
        ...(ord as any),
        order_items: itemsByOrder.get(ord.id) ?? [],
      }))
    );

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restaurant) return;
    loadAll(restaurant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  // ✅ refs para NO re-suscribirte al canal por cambios de sound.enabled
  const soundEnabledRef = useRef(false);
  const soundReadyRef = useRef(false);

  useEffect(() => {
    soundEnabledRef.current = !!sound.enabled;
  }, [sound.enabled]);

  useEffect(() => {
    soundReadyRef.current = !!sound.ready;
  }, [sound.ready]);

  // ✅ Realtime SOLO INSERT (evita duplicados por UPDATE)
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!restaurant?.id) return;

    // reset de anti-doble por restaurant
    seenRef.current = new Set();

    const channel = supabase
      .channel(`orders-inserts-${restaurant.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        async (payload: any) => {
          const newOrder = payload?.new as { id?: string; folio?: number; customer_name?: string } | undefined;
          const oid = newOrder?.id;
          if (!oid) return;

          // anti-doble (por reconexión o eventos repetidos)
          if (seenRef.current.has(oid)) return;
          seenRef.current.add(oid);

          // refresca lista
          await loadAll(restaurant);

          // toast
          pushToast(
            "🛎️ Nuevo pedido",
            `Folio #${newOrder?.folio ?? "?"} · ${newOrder?.customer_name ?? "Cliente"}`
          );

          // 🔊 Sonido: SOLO si el usuario ya lo activó
          // y (idealmente) ya fue "unlock" con un click
          if (soundEnabledRef.current) {
            // Si aún no está listo, no molestamos con alerts
            if (!soundReadyRef.current) {
              pushToast("🔔 Sonido activo", "Cargando audio…");
              return;
            }
            // play() puede fallar si no hubo gesto de usuario; tu hook debe manejarlo sin alert
            try {
              await sound.play();
            } catch {
              // No alert (molesta). Solo toast.
              pushToast("🔇 Sonido bloqueado", "Da click en “🔔 Sonido ON” para habilitar audio.");
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id]);

  async function setStatus(orderId: string, status: (typeof STATUS_KEYS)[number]) {
    if (!restaurant?.id) return;

    setSavingMap((m) => ({ ...m, [orderId]: true }));

    const { error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", orderId)
      .eq("restaurant_id", restaurant.id);

    setSavingMap((m) => ({ ...m, [orderId]: false }));

    if (error) alert(error.message);
    await loadAll(restaurant);
  }

  async function archiveOrder(orderId: string) {
    if (!restaurant?.id) return;

    const ok = confirm("¿Archivar este pedido? Ya no aparecerá en la lista principal.");
    if (!ok) return;

    setSavingMap((m) => ({ ...m, [orderId]: true }));

    const { error } = await supabase
      .from("orders")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("restaurant_id", restaurant.id);

    setSavingMap((m) => ({ ...m, [orderId]: false }));

    if (error) alert(error.message);
    await loadAll(restaurant);
  }

  async function restoreOrder(orderId: string) {
    if (!restaurant?.id) return;

    const ok = confirm("¿Restaurar este pedido? Volverá a aparecer en la lista principal.");
    if (!ok) return;

    setSavingMap((m) => ({ ...m, [orderId]: true }));

    const { error } = await supabase
      .from("orders")
      .update({ archived_at: null })
      .eq("id", orderId)
      .eq("restaurant_id", restaurant.id);

    setSavingMap((m) => ({ ...m, [orderId]: false }));

    if (error) alert(error.message);
    await loadAll(restaurant);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/admin/login");
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

  function itemsSubtotal(o: Order) {
    return (o.order_items ?? []).reduce((acc, it) => acc + Number(it.price_snapshot) * Number(it.qty), 0);
  }

  const filtered = useMemo(() => {
    let base = filter === "all" ? orders : orders.filter((o) => o.status === filter);

    const q = normalize(search);
    if (!q) return base;

    return base.filter((o) => {
      const hayFolio = String(o.folio ?? "").includes(q);
      const hayNombre = normalize(o.customer_name).includes(q);
      const hayTel = normalize(o.customer_phone).includes(q);
      const hayProducto = (o.order_items ?? []).some((it) => normalize(it.name_snapshot).includes(q));
      return hayFolio || hayNombre || hayTel || hayProducto;
    });
  }, [orders, filter, search]);

  async function copyTracking(o: Order) {
    if (!o.public_tracking_token) return;
    const url = getTrackingUrl(o.public_tracking_token);

    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(o.id);
      setTimeout(() => setCopiedId((prev) => (prev === o.id ? null : prev)), 1200);
    } catch {
      prompt("Copia este link:", url);
    }
  }

  function openWhatsApp(o: Order) {
    if (!o.public_tracking_token) return;

    const url = getTrackingUrl(o.public_tracking_token);

    const itemsText =
      (o.order_items ?? [])
        .map((it) => `• ${it.qty}× ${it.name_snapshot}`)
        .join("\n") || "• (sin productos)";

    const tipo = o.delivery_type === "delivery" ? "Entrega a domicilio" : "Recoger en sucursal";
    const estado =
      o.status in STATUS_LABEL ? STATUS_LABEL[o.status as keyof typeof STATUS_LABEL] : o.status;

    const msg =
      `Hola! ${o.customer_name || ""} \n` +
      `Tu pedido #${o.folio} está: *${estado}*\n\n` +
      `*Resumen*\n` +
      `${tipo}\n\n` +
      `*Productos*\n` +
      `${itemsText}\n\n` +
      `*Total:* ${money(o.total)}\n\n` +
      `Seguimiento:\n${url}`;

    const link = waLink(o.customer_phone, msg);
    window.open(link, "_blank", "noopener,noreferrer");
  }

  function openTracking(o: Order) {
    if (!o.public_tracking_token) return;
    window.open(`/t/${o.public_tracking_token}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ✅ Toasts */}
      <div className="fixed top-4 right-4 z-[9999] space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="w-[320px] rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl p-4 shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
          >
            <div className="font-semibold">{t.title}</div>
            {t.body ? <div className="text-sm text-white/70 mt-1">{t.body}</div> : null}
          </div>
        ))}
      </div>

      <div className="sticky top-0 z-20 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-4xl mx-auto px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Pedidos</h1>
            <p className="text-xs text-white/60">{restaurant ? restaurant.name : "Cargando..."}</p>

            {restaurant?.slug ? (
              <p className="text-xs text-white/50 mt-1">
                Link público: <span className="font-mono">/r/{restaurant.slug}</span>
              </p>
            ) : null}
          </div>

          <div className="flex gap-2 items-center flex-wrap justify-end">
            <label className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 bg-white/5 text-sm select-none">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Archivados
            </label>

            {/* ✅ Botón sonido (sin alert molesto) */}
            <button
  className="px-4 py-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition text-sm"
  onClick={async () => {
    if (!sound.enabled) {
      const ok = await sound.unlock();
      if (!ok) {
        pushToast("🔇 Sonido bloqueado", "Da un click en cualquier parte de la página y vuelve a intentar.");
        return;
      }
      sound.setEnabled(true);
      pushToast("🔔 Sonido activado", "Listo para nuevos pedidos.");
    } else {
      sound.setEnabled(false);
      pushToast("🔕 Sonido desactivado");
    }
  }}
  title="Activa el sonido (requiere un click para desbloquear)"
>
  {sound.enabled ? "🔔 Sonido ON" : "🔕 Activar sonido"}
</button>


            <button
              className="px-4 py-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition text-sm"
              onClick={() => router.push("/admin/settings")}
              disabled={!restaurant}
            >
              Ajustes
            </button>

            <button
              className="px-4 py-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition text-sm"
              onClick={logout}
            >
              Salir
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="max-w-4xl mx-auto px-5 pb-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center gap-3">
            <div className="text-white/50 text-sm">🔎</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por folio, nombre, teléfono o producto..."
              className="w-full bg-transparent outline-none text-sm"
            />
            {search ? (
              <button
                className="text-xs px-3 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition"
                onClick={() => setSearch("")}
              >
                Limpiar
              </button>
            ) : null}
          </div>
        </div>

        {/* Status filters */}
        <div className="max-w-4xl mx-auto px-5 pb-4 flex gap-2 overflow-x-auto no-scrollbar">
          {["all", ...STATUS_KEYS].map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={[
                "px-4 py-2 rounded-full border text-sm whitespace-nowrap transition",
                filter === k ? "border-white/20 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10",
              ].join(" ")}
            >
              {statusLabel(k)}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 py-6 space-y-4">
        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-white/70">Cargando pedidos...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-white/70">
            {showArchived ? "No hay pedidos archivados." : "Aún no hay pedidos (o no coincide la búsqueda)."}
          </div>
        ) : null}

        {filtered.map((o) => {
          const hasToken = !!o.public_tracking_token;

          return (
            <div key={o.id} className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold">Folio #{o.folio}</div>
                    <StatusPill status={o.status} />
                    {savingMap[o.id] ? <span className="text-xs text-white/60">Guardando...</span> : null}
                    {showArchived && o.archived_at ? (
                      <span className="text-xs text-white/50">Archivado: {new Date(o.archived_at).toLocaleString()}</span>
                    ) : null}
                  </div>

                  <div className="text-sm text-white/70 mt-1">
                    {o.customer_name} · {o.customer_phone}
                  </div>

                  <div className="text-sm text-white/70 mt-1">
                    {o.delivery_type === "delivery" ? "Entrega a domicilio" : "Recoger"} · {formatAddress(o)}
                  </div>

                  {o.notes ? (
                    <div className="text-sm text-white/70 mt-2">
                      <span className="text-white/50">Notas:</span> {o.notes}
                    </div>
                  ) : null}
                </div>

                <div className="text-xs text-white/50 whitespace-nowrap">{new Date(o.created_at).toLocaleString()}</div>
              </div>

              {hasToken ? (
                <div className="mt-4 flex gap-2 flex-wrap">
                  <button
                    onClick={() => copyTracking(o)}
                    className="px-4 py-2 rounded-full border text-sm transition border-white/15 bg-white/10 hover:bg-white/15"
                    title="Copiar link de seguimiento"
                  >
                    {copiedId === o.id ? "✅ Copiado" : "Copiar tracking"}
                  </button>

                  <button
                    onClick={() => openWhatsApp(o)}
                    className="px-4 py-2 rounded-full border text-sm transition border-emerald-500/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                    title="Enviar link por WhatsApp"
                  >
                    WhatsApp cliente
                  </button>

                  <button
                    onClick={() => openTracking(o)}
                    className="px-4 py-2 rounded-full border text-sm transition border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                    title="Abrir seguimiento en una nueva pestaña"
                  >
                    Abrir tracking
                  </button>
                </div>
              ) : (
                <div className="mt-4 text-xs text-white/50">Sin token de tracking.</div>
              )}

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="text-sm font-medium mb-2">Productos</div>

                {(o.order_items ?? []).length === 0 ? (
                  <div className="text-sm text-white/60">Sin productos.</div>
                ) : (
                  <div className="space-y-2">
                    {o.order_items.map((it) => (
                      <div key={it.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm">
                            <b>{it.qty}×</b> {it.name_snapshot}
                          </div>
                          <div className="text-xs text-white/50 mt-1">{money(it.price_snapshot)} c/u</div>

                          {it.notes ? (
                            <div className="text-xs text-white/60 mt-1">
                              <span className="text-white/40">Nota:</span> {it.notes}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-sm font-semibold whitespace-nowrap">
                          {money(Number(it.price_snapshot) * Number(it.qty))}
                        </div>
                      </div>
                    ))}

                    <div className="border-t border-white/10 pt-3 mt-3 text-sm space-y-1">
                      <div className="flex items-center justify-between text-white/70">
                        <span>Subtotal productos</span>
                        <span className="text-white/90 font-medium">{money(itemsSubtotal(o))}</span>
                      </div>
                      <div className="flex items-center justify-between text-white/70">
                        <span>Envío</span>
                        <span className="text-white/90 font-medium">
                          {money(o.delivery_type === "delivery" ? o.delivery_fee : 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/80">Total</span>
                        <span className="text-white font-semibold">{money(o.total)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-2 flex-wrap">
                {!showArchived ? (
                  <>
                    {STATUS_KEYS.map((s) => {
                      const active = o.status === s;
                      return (
                        <button
                          key={s}
                          disabled={!!savingMap[o.id]}
                          onClick={() => setStatus(o.id, s)}
                          className={[
                            "px-4 py-2 rounded-full border text-sm transition",
                            active ? "border-white/20 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10",
                            savingMap[o.id] ? "opacity-60 cursor-not-allowed" : "",
                          ].join(" ")}
                        >
                          {STATUS_LABEL[s]}
                        </button>
                      );
                    })}

                    {(o.status === "delivered" || o.status === "cancelled") && (
                      <button
                        disabled={!!savingMap[o.id]}
                        onClick={() => archiveOrder(o.id)}
                        className={[
                          "px-4 py-2 rounded-full border text-sm transition",
                          "border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15",
                          savingMap[o.id] ? "opacity-60 cursor-not-allowed" : "",
                        ].join(" ")}
                      >
                        Archivar
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    disabled={!!savingMap[o.id]}
                    onClick={() => restoreOrder(o.id)}
                    className={[
                      "px-4 py-2 rounded-full border text-sm transition",
                      "border-white/15 bg-white/10 hover:bg-white/15",
                      savingMap[o.id] ? "opacity-60 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    Restaurar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes statusPop {
          0% { transform: scale(0.96); opacity: 0.85; }
          60% { transform: scale(1.04); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-status-pop { animation: statusPop 180ms ease-out; will-change: transform, opacity; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
