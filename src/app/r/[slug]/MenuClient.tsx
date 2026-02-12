"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { getOpenStatus } from "@/lib/hours";

type RestaurantBranding = {
  logo_url?: string | null;
  brand_icon?: string | null;
  brand_text?: string | null;
  brand_tagline?: string | null;
  accent_color?: string | null;
  brand_mode?: "logo" | "icon" | "text" | "logo_text" | "icon_text" | "auto" | null;
};

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  delivery_fee?: number | null;
  is_active?: boolean | null;
  hours?: any | null;
} & RestaurantBranding;

type Category = { id: string; name: string; sort_order?: number | null };

type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description?: string | null;
  price: number;
  image_url?: string | null;
  is_active?: boolean | null;
  is_available?: boolean | null; // si existe, lo usamos; si no, no pasa nada
};

type Props = {
  restaurant: Restaurant;
  categories: Category[];
  items: MenuItem[];
};

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function normalize(s: string) {
  return (s || "").toLowerCase().trim();
}

function clamp2(s?: string | null) {
  const t = (s || "").trim();
  return t.length > 110 ? t.slice(0, 110) + "…" : t;
}

function deriveAccent(rest: Restaurant) {
  return rest.accent_color || "#ff3b30";
}

function safeMode(m?: string | null) {
  const v = (m || "auto") as RestaurantBranding["brand_mode"];
  const allowed = ["auto", "logo", "icon", "text", "logo_text", "icon_text"];
  return (allowed.includes(v as any) ? v : "auto") as NonNullable<RestaurantBranding["brand_mode"]>;
}

function getBrand(rest: Restaurant) {
  const mode = safeMode(rest.brand_mode);
  const logo = rest.logo_url || null;
  const icon = rest.brand_icon || "🍽️";
  const text = (rest.brand_text || rest.name || "Restaurante").trim();
  const tagline = (rest.brand_tagline || "Ordena directo • Sin comisiones").trim();

  if (mode === "logo" && logo) return { kind: "logo" as const, logo, icon, text, tagline };
  if (mode === "icon") return { kind: "icon" as const, logo, icon, text, tagline };
  if (mode === "text") return { kind: "text" as const, logo, icon, text, tagline };
  if (mode === "logo_text" && logo) return { kind: "logo_text" as const, logo, icon, text, tagline };
  if (mode === "icon_text") return { kind: "icon_text" as const, logo, icon, text, tagline };

  // auto
  if (logo) return { kind: "logo_text" as const, logo, icon, text, tagline };
  if (icon) return { kind: "icon_text" as const, logo, icon, text, tagline };
  return { kind: "text" as const, logo, icon, text, tagline };
}

function statusStyles(isOpen: boolean) {
  return isOpen
    ? {
        label: "Abierto",
        icon: "🟢",
        border: "rgba(34,197,94,0.30)",
        bg: "rgba(34,197,94,0.12)",
        text: "rgba(255,255,255,0.90)",
        sub: "rgba(255,255,255,0.65)",
      }
    : {
        label: "Cerrado",
        icon: "🔴",
        border: "rgba(239,68,68,0.30)",
        bg: "rgba(239,68,68,0.12)",
        text: "rgba(255,255,255,0.90)",
        sub: "rgba(255,255,255,0.65)",
      };
}

/** ✅ Card reusable para no duplicar markup (Todo + Categoría) */
function ItemCard({
  it,
  accent,
  canOrder,
  deliveryFee,
  onAdd,
}: {
  it: MenuItem;
  accent: string;
  canOrder: boolean;
  deliveryFee: number;
  onAdd: (it: MenuItem) => void;
}) {
  const available = it.is_available !== false;
  const disabled = !canOrder || !available;
  const hasImage = Boolean(it.image_url);

  return (
    <div
      className={[
        "group rounded-3xl border bg-white/5 p-5 transition",
        "border-white/10 hover:bg-white/8 hover:border-white/15",
        disabled ? "opacity-60" : "",
      ].join(" ")}
      style={{ boxShadow: `0 24px 60px rgba(0,0,0,0.45)` }}
    >
      {/* ✅ FOTO: solo si existe. Si no, dejamos un espaciado fijo discreto (sin cuadro). */}
      {hasImage ? (
        <div className="mb-4">
          <div className="h-36 w-full rounded-2xl overflow-hidden border border-white/10 bg-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.image_url!} alt={it.name} className="h-full w-full object-cover" />
          </div>
        </div>
      ) : (
        <div className="pt-1 mb-3" aria-hidden="true" />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-base font-semibold truncate">{it.name}</h4>
            {!available ? (
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/60">
                No disponible
              </span>
            ) : null}
          </div>

          <p className="mt-2 text-sm text-white/60 leading-relaxed">
            {clamp2(it.description) || "Descripción pendiente…"}
          </p>
        </div>

        <div className="text-right shrink-0">
          <div className="text-lg font-semibold">{money(it.price)}</div>
          <div className="text-xs text-white/45 mt-1">MXN</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          disabled={disabled}
          onClick={() => onAdd(it)}
          className={[
            "px-4 py-2 rounded-full border text-sm font-medium transition",
            !disabled
              ? "border-white/10 bg-white/10 hover:bg-white/15"
              : "border-white/10 bg-white/5 text-white/40 cursor-not-allowed",
          ].join(" ")}
          style={!disabled ? { borderColor: `${accent}45`, backgroundColor: `${accent}16` } : undefined}
        >
          {canOrder ? "Agregar" : "Cerrado"}
        </button>

        <div className="text-xs text-white/45">
          Envío desde <span className="text-white/70">{money(deliveryFee)}</span>
        </div>
      </div>

      <div
        className="pointer-events-none mt-4 h-[1px] w-full opacity-0 group-hover:opacity-100 transition"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }}
      />
    </div>
  );
}

export default function MenuClient({ restaurant, categories, items }: Props) {
  const cart = useCart();

  const accent = deriveAccent(restaurant);
  const brand = getBrand(restaurant);

  const [activeCat, setActiveCat] = useState<string>("__all__");
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ✅ Para que cambie solo al pasar el tiempo (cada 30s)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // 🔥 IMPORTANTÍSIMO: setear restaurantSlug en el provider
  useEffect(() => {
    if (restaurant?.slug) cart.setRestaurantSlug(restaurant.slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.slug]);

  // ✅ Estado abierto/cerrado usando tu hours
  const open = useMemo(() => getOpenStatus(restaurant?.hours), [restaurant?.hours, tick]);
  const canOrder = Boolean(restaurant?.is_active) && Boolean(open?.isOpen);

  const st = statusStyles(Boolean(open?.isOpen));
  const deliveryFee = Number(restaurant.delivery_fee ?? 0) || 0;

  // Ordenar categorías
  const catsSorted = useMemo(() => {
    const arr = [...(categories || [])];
    arr.sort((a, b) => Number(a.sort_order ?? 9999) - Number(b.sort_order ?? 9999));
    return arr;
  }, [categories]);

  // Tabs: Todo + categorías
  const tabs = useMemo(() => {
    return [{ id: "__all__", name: "Todo" } as Category, ...catsSorted];
  }, [catsSorted]);

  // Filtrar items por búsqueda
  const filteredItems = useMemo(() => {
    const q = normalize(query);
    const base = items || [];
    if (!q) return base;
    return base.filter((it) => normalize(it.name + " " + (it.description || "")).includes(q));
  }, [items, query]);

  // Agrupar items por categoría
  const itemsByCat = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const it of filteredItems) {
      const catId = it.category_id ?? "__uncat__";
      const list = map.get(catId) || [];
      list.push(it);
      map.set(catId, list);
    }
    return map;
  }, [filteredItems]);

  // Items para una categoría seleccionada
  const activeItems = useMemo(() => {
    if (activeCat === "__all__") return [];
    return itemsByCat.get(activeCat) || [];
  }, [activeCat, itemsByCat]);

  const validRestaurantForCart = !cart.restaurantSlug || cart.restaurantSlug === restaurant.slug;

  function onAddToCart(it: MenuItem) {
    if (!canOrder) return;
    const available = it.is_available !== false;
    if (!available) return;

    cart.addItem(restaurant.slug, { id: it.id, name: it.name, price: Number(it.price || 0) });
    setDrawerOpen(true);
  }

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
        <div className="mx-auto max-w-5xl px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              {(brand.kind === "logo" || brand.kind === "logo_text") && brand.logo ? (
                <div className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={brand.logo} alt="logo" className="h-full w-full object-cover" />
                </div>
              ) : brand.kind === "icon" || brand.kind === "icon_text" ? (
                <div
                  className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-xl shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                  style={{
                    boxShadow: `0 12px 36px ${accent}20`,
                    borderColor: `${accent}45`,
                    backgroundColor: `${accent}12`,
                  }}
                >
                  {brand.icon}
                </div>
              ) : null}

              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <h1 className="text-lg sm:text-xl font-semibold tracking-tight truncate">
                    {brand.kind === "logo" ? restaurant.name : brand.text}
                  </h1>

                  {/* ✅ Pill de estado abierto/cerrado */}
                  <span
                    className="inline-flex items-center gap-2 text-[11px] px-2.5 py-1 rounded-full border transition-all duration-300"
                    style={{
                      borderColor: st.border,
                      backgroundColor: st.bg,
                      color: st.text,
                      transform: "translateZ(0)",
                    }}
                    title={open?.reason || ""}
                  >
                    <span className="text-[10px]">{st.icon}</span>
                    <span className="font-medium">{st.label}</span>
                  </span>

                  {/* Menú pill */}
                  <span
                    className="hidden sm:inline-flex text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/70"
                    style={{ borderColor: `${accent}35`, backgroundColor: `${accent}10` }}
                  >
                    Menú
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <p className="text-xs text-white/60 truncate">{brand.tagline}</p>

                  {/* ✅ Razón (cierra/abre) */}
                  <span className="text-xs truncate transition-all duration-300" style={{ color: st.sub }}>
                    {open?.reason || ""}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search desktop */}
            <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-full border border-white/10 bg-white/5">
              <span className="text-white/50 text-sm">🔎</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-48 bg-transparent outline-none text-sm placeholder:text-white/35"
              />
              {query ? (
                <button
                  onClick={() => setQuery("")}
                  className="text-xs px-2 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition"
                >
                  Limpiar
                </button>
              ) : null}
            </div>

            <button
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/12 bg-white/5 hover:bg-white/10 transition shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
              style={{ borderColor: `${accent}35` }}
            >
              <span className="text-sm font-medium">Carrito</span>
              <span
                className="text-xs px-2 py-0.5 rounded-full border border-white/10 bg-white/5"
                style={{ borderColor: `${accent}40`, backgroundColor: `${accent}14` }}
              >
                {cart.count}
              </span>
            </button>
          </div>
        </div>

        {/* Aviso “cerrado” más visible */}
        {!canOrder ? (
          <div className="px-5 pb-4">
            <div className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
              <div className="font-medium">
                {restaurant?.is_active ? "Restaurante cerrado" : "Restaurante no disponible"}
              </div>
              <div className="text-xs text-white/60 mt-1">{open?.reason || "No disponible"}</div>
            </div>
          </div>
        ) : null}

        {/* Search mobile */}
        <div className="md:hidden px-5 pb-4">
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-white/10 bg-white/5">
            <span className="text-white/50 text-sm">🔎</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar platillo..."
              className="w-full bg-transparent outline-none text-sm placeholder:text-white/35"
            />
            {query ? (
              <button
                onClick={() => setQuery("")}
                className="text-xs px-3 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition"
              >
                Limpiar
              </button>
            ) : null}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 pb-4">
          <div
            className={[
              "mx-auto max-w-5xl flex gap-2 overflow-x-auto no-scrollbar",
              "select-none",
              "snap-x snap-mandatory",
              "overscroll-x-contain overscroll-y-none",
              "touch-pan-x",
            ].join(" ")}
            style={{
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-x",
            }}
          >
            {tabs.map((c) => {
              const active = c.id === activeCat;

              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCat(c.id)}
                  className={[
                    "relative px-4 py-2 rounded-full border text-sm whitespace-nowrap transition",
                    "snap-start",
                    active ? "bg-white/10 border-white/15" : "bg-white/5 border-white/10 hover:bg-white/10",
                  ].join(" ")}
                  style={active ? { borderColor: `${accent}50`, backgroundColor: `${accent}14` } : undefined}
                >
                  {c.name}
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

      {/* Aviso si el carrito es de otro restaurante */}
      {!validRestaurantForCart ? (
        <div className="mx-auto max-w-5xl px-5 pt-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-white/75">
            Tu carrito pertenece a otro restaurante.
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => cart.clear()}
                className="px-4 py-2 rounded-full border border-white/10 bg-white/10 hover:bg-white/15 transition text-sm"
              >
                Vaciar carrito
              </button>
              <button
                onClick={() => setDrawerOpen(true)}
                className="px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm"
              >
                Ver carrito
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Body */}
      <main className="relative mx-auto max-w-5xl px-5 py-8">
        <div className="flex items-end justify-between gap-3 mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {activeCat === "__all__" ? "Todo el menú" : catsSorted.find((x) => x.id === activeCat)?.name || "Menú"}
            </h2>
            <p className="text-sm text-white/55">
              {activeCat === "__all__"
                ? `${filteredItems.length} ${filteredItems.length === 1 ? "producto" : "productos"}`
                : `${(itemsByCat.get(activeCat) || []).length} ${((itemsByCat.get(activeCat) || []).length === 1) ? "producto" : "productos"}`}
            </p>
          </div>
        </div>

        {/* VISTA TODO */}
        {activeCat === "__all__" ? (
          <div className="space-y-8">
            {catsSorted.map((cat) => {
              const list = itemsByCat.get(cat.id) || [];
              if (list.length === 0) return null;

              return (
                <section key={cat.id}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold">{cat.name}</h3>
                    <span className="text-xs text-white/50">
                      {list.length} {list.length === 1 ? "producto" : "productos"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {list.map((it) => (
                      <ItemCard
                        key={it.id}
                        it={it}
                        accent={accent}
                        canOrder={canOrder}
                        deliveryFee={deliveryFee}
                        onAdd={onAddToCart}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {filteredItems.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/65">
                No hay resultados para esa búsqueda.
              </div>
            ) : null}
          </div>
        ) : (
          /* VISTA POR CATEGORÍA */
          <>
            {(() => {
              const activeItems = itemsByCat.get(activeCat) || [];
              return activeItems.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/65">
                  No hay productos en esta categoría.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeItems.map((it) => (
                    <ItemCard
                      key={it.id}
                      it={it}
                      accent={accent}
                      canOrder={canOrder}
                      deliveryFee={deliveryFee}
                      onAdd={onAddToCart}
                    />
                  ))}
                </div>
              );
            })()}
          </>
        )}

        <div className="mt-10 text-center text-xs text-white/40">App Elaborada por SiteApp.mx</div>
      </main>

      {/* DRAWER CARRITO */}
      <div className={["fixed inset-0 z-40", drawerOpen ? "" : "pointer-events-none"].join(" ")}>
        {/* overlay */}
        <div
          className={["absolute inset-0 bg-black/60 transition-opacity", drawerOpen ? "opacity-100" : "opacity-0"].join(
            " "
          )}
          onClick={() => setDrawerOpen(false)}
        />
        {/* panel */}
        <aside
          className={[
            "absolute right-0 top-0 h-full w-full sm:w-[420px] border-l border-white/10 bg-black/80 backdrop-blur-xl",
            "transition-transform duration-300",
            drawerOpen ? "translate-x-0" : "translate-x-full",
          ].join(" ")}
        >
          <div className="h-full flex flex-col">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">Tu carrito</div>
                <div className="text-xs text-white/60">{cart.count} artículos</div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="px-3 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm"
              >
                Cerrar
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-3">
              {cart.items.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-white/70">Carrito vacío.</div>
              ) : (
                <>
                  {cart.items.map((it) => (
                    <div key={it.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{it.name}</div>
                          <div className="text-xs text-white/60 mt-1">{money(it.price)} c/u</div>
                        </div>
                        <div className="text-sm font-semibold">{money(it.price * it.qty)}</div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => cart.setQty(it.id, Math.max(1, it.qty - 1))}
                            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition"
                          >
                            −
                          </button>
                          <div className="min-w-[34px] text-center text-sm font-medium">{it.qty}</div>
                          <button
                            onClick={() => cart.setQty(it.id, it.qty + 1)}
                            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition"
                          >
                            +
                          </button>
                        </div>

                        <button
                          onClick={() => cart.removeItem(it.id)}
                          className="text-xs px-3 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <div className="flex justify-between text-sm text-white/75">
                      <span>Subtotal</span>
                      <span>{money(cart.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-white/75 mt-2">
                      <span>Envío</span>
                      <span>{money(deliveryFee)}</span>
                    </div>
                    <div className="flex justify-between text-base font-semibold mt-3">
                      <span>Total aprox.</span>
                      <span>{money(cart.subtotal + deliveryFee)}</span>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => cart.clear()}
                        className="flex-1 px-4 py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm"
                      >
                        Vaciar
                      </button>

                      <Link
                        href={`/r/${restaurant.slug}/checkout`}
                        className="flex-1 px-4 py-3 rounded-2xl border text-sm font-semibold text-center transition"
                        style={{ borderColor: `${accent}55`, backgroundColor: `${accent}18` }}
                        onClick={() => setDrawerOpen(false)}
                      >
                        Ir a pagar
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
