"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useOrderSound } from "@/components/admin/useOrderSound";

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  accent_color?: string | null;
  brand_icon?: string | null;
};

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

type Toast = { id: string; title: string; body?: string; tone?: "normal" | "success" | "danger" };
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Modal interno para confirmar acciones sin confirm() */
type ConfirmState =
  | null
  | {
      title: string;
      body?: string;
      confirmText?: string;
      danger?: boolean;
      onConfirm: () => Promise<void> | void;
    };

function deriveAccent(r?: Restaurant | null) {
  return r?.accent_color || "#ff3b30";
}

function StatusPill({ status, accent }: { status: string; accent: string }) {
  const label = (STATUS_LABEL as any)[status] ?? status;

  // Paletas suaves pero consistentes. El "pending" toma el accent.
  const styles =
    status === "pending"
      ? { border: `${accent}55`, bg: `${accent}16`, text: "rgba(255,255,255,0.90)" }
      : status === "preparing"
      ? { border: "rgba(59,130,246,0.45)", bg: "rgba(59,130,246,0.14)", text: "rgba(255,255,255,0.90)" }
      : status === "on_the_way"
      ? { border: "rgba(168,85,247,0.45)", bg: "rgba(168,85,247,0.14)", text: "rgba(255,255,255,0.90)" }
      : status === "delivered"
      ? { border: "rgba(34,197,94,0.45)", bg: "rgba(34,197,94,0.14)", text: "rgba(255,255,255,0.90)" }
      : status === "cancelled"
      ? { border: "rgba(239,68,68,0.45)", bg: "rgba(239,68,68,0.14)", text: "rgba(255,255,255,0.90)" }
      : { border: "rgba(255,255,255,0.16)", bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.85)" };

  return (
    <span
      className={[
        "inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-medium",
        "transition-all duration-200 ease-out animate-status-pop",
      ].join(" ")}
      style={{ borderColor: styles.border, backgroundColor: styles.bg, color: styles.text }}
    >
      {label}
    </span>
  );
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
  function pushToast(title: string, body?: string, tone: Toast["tone"] = "normal") {
    const id = uid();
    setToasts((prev) => [{ id, title, body, tone }, ...prev].slice(0, 4));
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }

  // ✅ Confirm modal interno
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  async function runConfirmAction(fn: () => Promise<void> | void) {
    setConfirmBusy(true);
    try {
      await fn();
      setConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
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
      .select("id,name,slug,accent_color,brand_icon")
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
      pushToast("Error cargando pedidos", oErr.message, "danger");
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

  // ✅ Realtime SOLO INSERT
  const seenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!restaurant?.id) return;

    const channel = supabase
      .channel("orders-inserts")
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

          if (seenRef.current.has(oid)) return;
          seenRef.current.add(oid);

          await loadAll(restaurant);

          pushToast("🛎️ Nuevo pedido", `Folio #${newOrder?.folio ?? "?"} · ${newOrder?.customer_name ?? "Cliente"}`);
          sound.play();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id, sound.enabled]);

  async function setStatus(orderId: string, status: (typeof STATUS_KEYS)[number]) {
    if (!restaurant?.id) return;

    setSavingMap((m) => ({ ...m, [orderId]: true }));
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId).eq("restaurant_id", restaurant.id);
    setSavingMap((m) => ({ ...m, [orderId]: false }));

    if (error) {
      pushToast("Error al cambiar estado", error.message, "danger");
      return;
    }
    pushToast("Estado actualizado", `Ahora está: ${STATUS_LABEL[status]}`, "success");
    await loadAll(restaurant);
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
      pushToast("No se pudo copiar", "Copia manualmente desde el tracking.", "danger");
    }
  }

  function openWhatsApp(o: Order) {
    if (!o.public_tracking_token) return;

    const url = getTrackingUrl(o.public_tracking_token);
    const itemsText =
      (o.order_items ?? []).map((it) => `• ${it.qty}× ${it.name_snapshot}`).join("\n") || "• (sin productos)";

    const tipo = o.delivery_type === "delivery" ? "Entrega a domicilio" : "Recoger en sucursal";
    const estado = o.status in STATUS_LABEL ? STATUS_LABEL[o.status as keyof typeof STATUS_LABEL] : o.status;

    const msg =
      `Hola! ${o.customer_name || ""}\n` +
      `Tu pedido #${o.folio} está: *${estado}*\n\n` +
      `*Resumen*\n${tipo}\n\n` +
      `*Productos*\n${itemsText}\n\n` +
      `*Total:* ${money(o.total)}\n\n` +
      `Seguimiento:\n${url}`;

    const link = waLink(o.customer_phone, msg);
    window.open(link, "_blank", "noopener,noreferrer");
  }

  function openTracking(o: Order) {
    if (!o.public_tracking_token) return;
    window.open(`/t/${o.public_tracking_token}`, "_blank", "noopener,noreferrer");
  }

  async function archiveOrder(o: Order) {
    if (!restaurant?.id) return;

    setSavingMap((m) => ({ ...m, [o.id]: true }));
    const { error } = await supabase
      .from("orders")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", o.id)
      .eq("restaurant_id", restaurant.id);
    setSavingMap((m) => ({ ...m, [o.id]: false }));

    if (error) {
      pushToast("No se pudo archivar", error.message, "danger");
      return;
    }
    pushToast("Pedido archivado", `Folio #${o.folio}`, "success");
    await loadAll(restaurant);
  }

  async function restoreOrder(o: Order) {
    if (!restaurant?.id) return;

    setSavingMap((m) => ({ ...m, [o.id]: true }));
    const { error } = await supabase.from("orders").update({ archived_at: null }).eq("id", o.id).eq("restaurant_id", restaurant.id);
    setSavingMap((m) => ({ ...m, [o.id]: false }));

    if (error) {
      pushToast("No se pudo restaurar", error.message, "danger");
      return;
    }
    pushToast("Pedido restaurado", `Folio #${o.folio}`, "success");
    await loadAll(restaurant);
  }

  async function hardDeleteOrder(o: Order) {
    setSavingMap((m) => ({ ...m, [o.id]: true }));
    const { error } = await supabase.rpc("delete_order_hard", { p_order_id: o.id });
    setSavingMap((m) => ({ ...m, [o.id]: false }));

    if (error) {
      pushToast("No se pudo borrar", error.message, "danger");
      return;
    }
    pushToast("Pedido borrado", `Folio #${o.folio} eliminado definitivamente`, "success");
    if (restaurant) await loadAll(restaurant);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  const accent = deriveAccent(restaurant);

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden" style={{ overflowX: "clip" as any }}>
      {/* Fondo (igual filosofía que MenuClient) */}
      <div
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          background:
            `radial-gradient(1200px 600px at 20% 10%, ${accent}22 0%, transparent 60%),` +
            `radial-gradient(900px 500px at 80% 20%, #ff950022 0%, transparent 55%),` +
            `radial-gradient(700px 450px at 40% 90%, #ffcc0020 0%, transparent 55%)`,
        }}
      />

      {/* ✅ Toasts */}
      <div className="fixed top-4 right-4 z-[9999] space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "w-[340px] rounded-2xl border bg-black/80 backdrop-blur-xl p-4",
              "shadow-[0_24px_70px_rgba(0,0,0,0.55)]",
              t.tone === "success"
                ? "border-emerald-500/25"
                : t.tone === "danger"
                ? "border-red-500/25"
                : "border-white/10",
            ].join(" ")}
          >
            <div className="font-semibold">{t.title}</div>
            {t.body ? <div className="text-sm text-white/70 mt-1">{t.body}</div> : null}
          </div>
        ))}
      </div>

      {/* ✅ Modal confirm interno */}
      {confirm ? (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => (confirmBusy ? null : setConfirm(null))} />
          <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-black/80 backdrop-blur-xl p-6 shadow-[0_30px_90px_rgba(0,0,0,0.7)]">
            <div className="text-lg font-semibold">{confirm.title}</div>
            {confirm.body ? <div className="text-sm text-white/70 mt-2">{confirm.body}</div> : null}

            <div className="mt-5 flex gap-2 justify-end">
              <button
                disabled={confirmBusy}
                onClick={() => setConfirm(null)}
                className="px-4 py-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition text-sm disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                disabled={confirmBusy}
                onClick={() => runConfirmAction(confirm.onConfirm)}
                className={[
                  "px-4 py-2 rounded-full border text-sm font-medium transition disabled:opacity-60",
                  confirm.danger
                    ? "border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15"
                    : "border-white/15 bg-white/10 hover:bg-white/15",
                ].join(" ")}
              >
                {confirmBusy ? "Procesando…" : confirm.confirmText || "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Header sticky (glass + pills) */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/70 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-5 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-xl shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                style={{
                  boxShadow: `0 12px 36px ${accent}20`,
                  borderColor: `${accent}45`,
                  backgroundColor: `${accent}12`,
                }}
                title="Panel Admin"
              >
                {restaurant?.brand_icon || "🧾"}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <h1 className="text-lg sm:text-xl font-semibold tracking-tight truncate">Pedidos</h1>

                  <span
                    className="inline-flex items-center gap-2 text-[11px] px-2.5 py-1 rounded-full border"
                    style={{ borderColor: `${accent}40`, backgroundColor: `${accent}14`, color: "rgba(255,255,255,0.88)" }}
                  >
                    <span className="text-[10px]">⚡</span>
                    <span className="font-medium">{showArchived ? "Archivados" : "Activos"}</span>
                  </span>

                  {restaurant?.slug ? (
                    <span className="hidden sm:inline-flex text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/70">
                      /r/{restaurant.slug}
                    </span>
                  ) : null}
                </div>

                <p className="text-xs text-white/60 truncate">{restaurant ? restaurant.name : "Cargando..."}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2 items-center flex-wrap justify-end">
            <label className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/12 bg-white/5 text-sm select-none">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Archivados
            </label>

            <button
              className="px-4 py-2 rounded-full border border-white/12 bg-white/5 hover:bg-white/10 transition text-sm"
              onClick={async () => {
                if (!sound.enabled) {
                  const ok = await sound.unlock();
                  if (!ok) {
                    pushToast("Sonido bloqueado", "Da click otra vez o interactúa con la página.", "danger");
                    return;
                  }
                  sound.setEnabled(true);
                  pushToast("🔔 Sonido activado", sound.ready ? "Listo para nuevos pedidos." : "Cargando sonido…", "success");
                } else {
                  sound.setEnabled(false);
                  pushToast("🔕 Sonido desactivado");
                }
              }}
              style={{ borderColor: `${accent}35` }}
            >
              {sound.enabled ? "🔔 Sonido ON" : "🔕 Activar sonido"}
            </button>

            <button
              className="px-4 py-2 rounded-full border border-white/12 bg-white/5 hover:bg-white/10 transition text-sm"
              onClick={() => router.push("/admin/menu")}
              disabled={!restaurant}
              title="Editar productos y categorías"
              style={{ borderColor: `${accent}35` }}
            >
              Menú
            </button>

            <button
              className="px-4 py-2 rounded-full border border-white/12 bg-white/5 hover:bg-white/10 transition text-sm"
              onClick={() => router.push("/admin/settings")}
              disabled={!restaurant}
              style={{ borderColor: `${accent}35` }}
            >
              Ajustes
            </button>

            <button
              className="px-4 py-2 rounded-full border border-white/12 bg-white/5 hover:bg-white/10 transition text-sm"
              onClick={logout}
            >
              Salir
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mx-auto max-w-5xl px-5 pb-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center gap-3">
            <div className="text-white/50 text-sm">🔎</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por folio, nombre, teléfono o producto..."
              className="w-full bg-transparent outline-none text-sm placeholder:text-white/35"
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

        {/* Status filters (con snap + touch horizontal como MenuClient) */}
        <div className="px-5 pb-4">
          <div
            className={[
              "mx-auto max-w-5xl flex gap-2 overflow-x-auto no-scrollbar",
              "select-none snap-x snap-mandatory overscroll-x-contain overscroll-y-none touch-pan-x",
            ].join(" ")}
            style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}
          >
            {["all", ...STATUS_KEYS].map((k) => {
              const active = filter === k;
              return (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={[
                    "relative px-4 py-2 rounded-full border text-sm whitespace-nowrap transition",
                    "snap-start",
                    active ? "bg-white/10 border-white/15" : "bg-white/5 border-white/10 hover:bg-white/10",
                  ].join(" ")}
                  style={active ? { borderColor: `${accent}50`, backgroundColor: `${accent}14` } : undefined}
                >
                  {statusLabel(k)}
                  {active ? (
                    <span
                      className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 h-[3px] w-10 rounded-full"
                      style={{ backgroundColor: accent }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="relative mx-auto max-w-5xl px-5 py-6 space-y-4">
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
            <div
              key={o.id}
              className="rounded-3xl border bg-white/5 p-5 transition border-white/10 hover:bg-white/8 hover:border-white/15"
              style={{ boxShadow: `0 24px 60px rgba(0,0,0,0.45)` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold">Folio #{o.folio}</div>
                    <StatusPill status={o.status} accent={accent} />
                    {savingMap[o.id] ? <span className="text-xs text-white/60">Guardando...</span> : null}
                    {showArchived && o.archived_at ? (
                      <span className="text-xs text-white/50">Archivado: {new Date(o.archived_at).toLocaleString()}</span>
                    ) : null}

                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/70"
                      style={{ borderColor: `${accent}25`, backgroundColor: `${accent}10` }}
                    >
                      {o.delivery_type === "delivery" ? "Entrega" : "Pickup"}
                    </span>
                  </div>

                  <div className="text-sm text-white/70 mt-1">
                    {o.customer_name} · {o.customer_phone}
                  </div>

                  <div className="text-sm text-white/70 mt-1">{formatAddress(o)}</div>

                  {o.notes ? (
                    <div className="text-sm text-white/70 mt-2">
                      <span className="text-white/50">Notas:</span> {o.notes}
                    </div>
                  ) : null}
                </div>

                <div className="text-xs text-white/50 whitespace-nowrap">{new Date(o.created_at).toLocaleString()}</div>
              </div>

              {/* Tracking */}
              {hasToken ? (
                <div className="mt-4 flex gap-2 flex-wrap">
                  <button
                    onClick={() => copyTracking(o)}
                    className="px-4 py-2 rounded-full border text-sm transition border-white/12 bg-white/10 hover:bg-white/15"
                    style={{ borderColor: `${accent}35` }}
                  >
                    {copiedId === o.id ? "✅ Copiado" : "Copiar tracking"}
                  </button>

                  <button
                    onClick={() => openWhatsApp(o)}
                    className="px-4 py-2 rounded-full border text-sm transition"
                    style={{ borderColor: "rgba(34,197,94,0.30)", backgroundColor: "rgba(34,197,94,0.14)", color: "rgba(255,255,255,0.90)" }}
                  >
                    WhatsApp cliente
                  </button>

                  <button
                    onClick={() => openTracking(o)}
                    className="px-4 py-2 rounded-full border text-sm transition border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                  >
                    Abrir tracking
                  </button>
                </div>
              ) : (
                <div className="mt-4 text-xs text-white/50">Sin token de tracking.</div>
              )}

              {/* Productos */}
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

              {/* Acciones */}
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
                            active ? "bg-white/10 border-white/15" : "bg-white/5 border-white/10 hover:bg-white/10",
                            savingMap[o.id] ? "opacity-60 cursor-not-allowed" : "",
                          ].join(" ")}
                          style={active ? { borderColor: `${accent}50`, backgroundColor: `${accent}14` } : undefined}
                        >
                          {STATUS_LABEL[s]}
                        </button>
                      );
                    })}

                    {o.status === "delivered" || o.status === "cancelled" ? (
                      <button
                        disabled={!!savingMap[o.id]}
                        onClick={() =>
                          setConfirm({
                            title: `Archivar pedido #${o.folio}`,
                            body: "Se moverá a Archivados. Puedes restaurarlo después.",
                            confirmText: "Archivar",
                            onConfirm: async () => archiveOrder(o),
                          })
                        }
                        className="px-4 py-2 rounded-full border text-sm transition disabled:opacity-60"
                        style={{ borderColor: "rgba(239,68,68,0.30)", backgroundColor: "rgba(239,68,68,0.14)", color: "rgba(255,255,255,0.90)" }}
                      >
                        Archivar
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <button
                      disabled={!!savingMap[o.id]}
                      onClick={() =>
                        setConfirm({
                          title: `Restaurar pedido #${o.folio}`,
                          body: "Volverá a aparecer en la lista principal.",
                          confirmText: "Restaurar",
                          onConfirm: async () => restoreOrder(o),
                        })
                      }
                      className="px-4 py-2 rounded-full border text-sm transition border-white/12 bg-white/10 hover:bg-white/15 disabled:opacity-60"
                      style={{ borderColor: `${accent}35` }}
                    >
                      Restaurar
                    </button>

                    <button
                      disabled={!!savingMap[o.id]}
                      onClick={() =>
                        setConfirm({
                          title: `Borrar DEFINITIVAMENTE #${o.folio}`,
                          body: "Esto elimina el pedido y sus productos. No se puede deshacer.",
                          confirmText: "Borrar definitivo",
                          danger: true,
                          onConfirm: async () => hardDeleteOrder(o),
                        })
                      }
                      className="px-4 py-2 rounded-full border text-sm transition disabled:opacity-60"
                      style={{ borderColor: "rgba(239,68,68,0.30)", backgroundColor: "rgba(239,68,68,0.14)", color: "rgba(255,255,255,0.90)" }}
                    >
                      Borrar definitivo
                    </button>
                  </>
                )}
              </div>

              <div
                className="pointer-events-none mt-4 h-[1px] w-full opacity-0 group-hover:opacity-100 transition"
                style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }}
              />
            </div>
          );
        })}
      </main>

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
