"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { supabase } from "@/lib/supabaseClient";
import { getOpenStatus } from "@/lib/hours";

type BrandMode = "auto" | "logo" | "icon" | "text" | "logo_text" | "icon_text";

type Restaurant = {
  name: string;
  slug: string;
  delivery_fee: number;
  is_active: boolean;
  hours: any;

  logo_url: string | null;
  brand_icon: string | null;
  brand_text: string | null;
  brand_tagline: string | null;
  accent_color: string | null;
  brand_mode: string | null;
};

type GeoResult = {
  lat: number;
  lng: number;
  display: string;
  raw?: any;
};

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function safeMode(m: string | null): BrandMode {
  const v = (m || "auto") as BrandMode;
  return ["auto", "logo", "icon", "text", "logo_text", "icon_text"].includes(v) ? v : "auto";
}

function deriveAccent(r: Restaurant | null) {
  return r?.accent_color || "#ff3b30";
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
  if (icon) return { kind: "icon_text" as const, logo, icon, text, tagline };
  return { kind: "text" as const, logo, icon, text, tagline };
}

function statusPill(isOpen: boolean) {
  return isOpen
    ? { label: "Abierto", icon: "🟢", border: "rgba(34,197,94,0.30)", bg: "rgba(34,197,94,0.12)" }
    : { label: "Cerrado", icon: "🔴", border: "rgba(239,68,68,0.30)", bg: "rgba(239,68,68,0.12)" };
}

/** ✅ Prefijo WhatsApp MX */
const MX_WA_PREFIX_UI = "+52 1 ";

function enforceMxPrefixUI(v: string) {
  const raw = (v || "").trim();
  const cleaned = raw.replace(/[^\d+ ]/g, "");
  let digits = cleaned.replace(/[^\d]/g, "");
  digits = digits.replace(/^52/, "");
  digits = digits.replace(/^1/, "");
  digits = digits.slice(0, 10);
  return MX_WA_PREFIX_UI + digits;
}

function toMxWhatsAppE164(uiPhone: string) {
  const digits = (uiPhone || "").replace(/[^\d]/g, "");
  let local = digits.replace(/^52/, "").replace(/^1/, "");
  local = local.slice(0, 10);
  return local ? `+521${local}` : "";
}

function Field({
  value,
  onChange,
  placeholder,
  required,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={required ? `${placeholder} *` : placeholder}
      inputMode={type === "tel" ? "tel" : undefined}
      autoComplete={type === "tel" ? "tel" : undefined}
      className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-white/20"
    />
  );
}

export default function CheckoutPage() {
  const params = useParams();
  const slug = (params?.slug as string) || "";
  const router = useRouter();
  const cart = useCart();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loadingRestaurant, setLoadingRestaurant] = useState(true);

  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">("delivery");

  // datos cliente
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(MX_WA_PREFIX_UI);

  // dirección
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState(""); // opcional
  const [references, setReferences] = useState("");

  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);

  // coords
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [coordsSource, setCoordsSource] = useState<"auto" | null>(null);

  // fee live
  const [feeLive, setFeeLive] = useState<number | null>(null);
  const [zoneName, setZoneName] = useState<string | null>(null);

  // geocode UI
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // ✅ sugerencias + selección
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<GeoResult | null>(null);
  const lastGeoQueryRef = useRef<string>("");

  const validRestaurant = !!slug && cart.restaurantSlug === slug;

  // cargar restaurante
  useEffect(() => {
    if (!slug) return;

    async function loadRestaurant() {
      setLoadingRestaurant(true);

      const { data, error } = await supabase
        .from("restaurants")
        .select("name,slug,delivery_fee,is_active,hours,logo_url,brand_icon,brand_text,brand_tagline,accent_color,brand_mode")
        .eq("slug", slug)
        .single();

      setLoadingRestaurant(false);

      if (error || !data) {
        setRestaurant(null);
        return;
      }

      setRestaurant(data as Restaurant);
    }

    loadRestaurant();
  }, [slug]);

  const accent = deriveAccent(restaurant);
  const open = useMemo(() => getOpenStatus(restaurant?.hours), [restaurant?.hours]);
  const canOrder = !!restaurant?.is_active && open.isOpen;

  const st = statusPill(Boolean(open?.isOpen));
  const brand = useMemo(() => (restaurant ? getBrand(restaurant) : null), [restaurant]);

  const subtotal = useMemo(() => cart.subtotal, [cart.subtotal]);

  const baseFee = Number(restaurant?.delivery_fee || 0);
  const deliveryFee = feeLive ?? baseFee;
  const total = deliveryType === "delivery" ? subtotal + deliveryFee : subtotal;

  const empty = cart.items.length === 0;

  // ✅ AUTO: buscar sugerencias por lo que escriben (tolerante)
  useEffect(() => {
    if (!slug) return;
    if (deliveryType !== "delivery") return;

    // reset si no hay colonia
    if (!neighborhood.trim()) {
      setGeoLoading(false);
      setGeoError(null);
      setSuggestions([]);
      setSelectedSuggestion(null);
      setCoords(null);
      setCoordsSource(null);
      return;
    }

    // Si el usuario edita, invalidamos selección previa
    setSelectedSuggestion(null);

    // arma query: con calle+colonia+ciudad si existe, pero permite abreviaciones porque nominatim “fuzzea” algo
    const c = (city.trim() || "Hidalgo del Parral").trim();
    const s = street.trim();
    const n = number.trim();
    const col = neighborhood.trim();

    // ✅ para ayudar: si solo ponen colonia, que también funcione
    const q = [s ? `${s}${n ? ` ${n}` : ""}` : "", col, c].filter(Boolean).join(", ");

    // no repetir mismo query
    if (lastGeoQueryRef.current === q) return;
    lastGeoQueryRef.current = q;

    let cancelled = false;
    setGeoError(null);

    const t = setTimeout(async () => {
      try {
        setGeoLoading(true);
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const j = await r.json();

        if (cancelled) return;

        if (!j?.ok || !Array.isArray(j.results)) {
          setGeoLoading(false);
          setSuggestions([]);
          setGeoError("No pude ubicar la colonia. Intenta escribir un poco más.");
          return;
        }

        const list: GeoResult[] = j.results
          .map((x: any) => ({
            lat: Number(x.lat),
            lng: Number(x.lng),
            display: String(x.display || ""),
            raw: x.raw,
          }))
          .filter((x: GeoResult) => Number.isFinite(x.lat) && Number.isFinite(x.lng) && x.display);

        setSuggestions(list);
        setGeoLoading(false);

        if (list.length === 0) {
          setGeoError("No encontré coincidencias. Prueba con otro nombre o agrega la calle.");
        }
      } catch {
        if (cancelled) return;
        setGeoLoading(false);
        setSuggestions([]);
        setGeoError("Error consultando ubicación. Intenta de nuevo.");
      }
    }, 650);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [slug, deliveryType, neighborhood, street, number, city]);

  // ✅ elegir sugerencia: se quitan las demás y se setean coords
  function pickSuggestion(s: GeoResult) {
    setSelectedSuggestion(s);
    setSuggestions([]); // ✅ aquí se “quitan las demás”
    setCoords({ lat: s.lat, lng: s.lng });
    setCoordsSource("auto");
    setGeoError(null);
  }

  // ✅ cotizar envío en vivo cuando hay coords y es delivery
  useEffect(() => {
    if (!slug) return;
    if (deliveryType !== "delivery") return;

    if (!coords) {
      setFeeLive(null);
      setZoneName(null);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.rpc("get_delivery_quote", {
        p_restaurant_slug: slug,
        p_lat: coords.lat,
        p_lng: coords.lng,
      });

      if (cancelled) return;

      if (error) {
        setFeeLive(null);
        setZoneName(null);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (row?.fee != null) {
        setFeeLive(Number(row.fee));
        setZoneName(row.zone_name || null);
      } else {
        setFeeLive(null);
        setZoneName(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, deliveryType, coords?.lat, coords?.lng]);

  async function placeOrder() {
    if (!slug) return;
    if (!validRestaurant) return;
    if (!restaurant) return;
    if (!canOrder) return;
    if (cart.items.length === 0) return;
    if (!name.trim()) return;

    const phoneE164 = toMxWhatsAppE164(phone);
    if (!phoneE164) return;

    if (deliveryType === "delivery") {
      if (!street.trim() || !neighborhood.trim()) return;
    }

    setPlacing(true);

    const payloadItems = cart.items.map((i) => ({
      menu_item_id: i.id,
      qty: i.qty,
      notes: notes.trim() || null,
    }));

    const address =
      deliveryType === "delivery"
        ? {
            street: street.trim(),
            number: number.trim(),
            neighborhood: neighborhood.trim(),
            city: city.trim(),
            references: references.trim(),
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
            coords_source: coordsSource,
          }
        : null;

    const { data, error } = await supabase.rpc("create_order", {
      p_restaurant_slug: slug,
      p_customer_name: name.trim(),
      p_customer_phone: phoneE164,
      p_delivery_type: deliveryType,
      p_address: address,
      p_payment_method: "cash",
      p_notes: notes.trim() || null,
      p_items: payloadItems,
    });

    setPlacing(false);
    if (error) {
      alert(error.message);
      return;
    }

    const res = Array.isArray(data) ? data[0] : data;

    cart.clear();

    if (res?.public_tracking_token) {
      router.push(`/t/${res.public_tracking_token}`);
      return;
    }

    router.push(`/r/${slug}`);
  }

  return (
    <div className="min-h-screen bg-black text-white">
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
        <div className="mx-auto max-w-4xl px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              {brand && (brand.kind === "logo" || brand.kind === "logo_text") && brand.logo ? (
                <div className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={brand.logo} alt="logo" className="h-full w-full object-cover" />
                </div>
              ) : brand && (brand.kind === "icon" || brand.kind === "icon_text") ? (
                <div
                  className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-xl shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                  style={{ borderColor: `${accent}45`, backgroundColor: `${accent}12` }}
                >
                  {brand.icon}
                </div>
              ) : null}

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-lg font-semibold tracking-tight">Checkout</div>

                  <span
                    className="inline-flex items-center gap-2 text-[11px] px-2.5 py-1 rounded-full border"
                    style={{ borderColor: st.border, backgroundColor: st.bg }}
                    title={open?.reason || ""}
                  >
                    <span className="text-[10px]">{st.icon}</span>
                    <span className="font-medium">{st.label}</span>
                  </span>
                </div>

                <div className="text-xs text-white/60 truncate">
                  {loadingRestaurant ? "Cargando..." : brand ? brand.text : restaurant?.name ?? "Restaurante"}
                  {open?.reason ? <span className="text-white/45"> · {open.reason}</span> : null}
                </div>
              </div>
            </div>
          </div>

          <Link
            href={slug ? `/r/${slug}` : "/"}
            className="px-4 py-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition text-sm"
          >
            Volver
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="relative mx-auto max-w-4xl px-5 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Left */}
          <div className="lg:col-span-3 space-y-5">
            {/* Pedido */}
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold tracking-tight">Tu pedido</h2>
                <div className="text-xs text-white/60">{cart.count} artículos</div>
              </div>

              {empty ? (
                <div className="text-sm text-white/70">
                  Carrito vacío.{" "}
                  <Link href={slug ? `/r/${slug}` : "/"} className="underline text-white/80">
                    Volver al menú
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.items.map((i) => (
                    <div key={i.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{i.name}</div>
                          <div className="text-xs text-white/60 mt-1">{money(i.price)} c/u</div>
                        </div>
                        <div className="text-sm font-semibold whitespace-nowrap">{money(i.price * i.qty)}</div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => cart.setQty(i.id, Math.max(1, i.qty - 1))}
                            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition"
                          >
                            −
                          </button>
                          <div className="min-w-[34px] text-center text-sm font-medium">{i.qty}</div>
                          <button
                            onClick={() => cart.setQty(i.id, i.qty + 1)}
                            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition"
                          >
                            +
                          </button>
                        </div>

                        <button
                          onClick={() => cart.removeItem(i.id)}
                          className="text-xs px-3 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Datos */}
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold tracking-tight">Datos</h2>
                <div className="text-xs text-white/50">Pago: efectivo</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={[
                    "rounded-2xl border px-4 py-3 text-sm transition",
                    deliveryType === "delivery" ? "border-white/20 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10",
                  ].join(" ")}
                  onClick={() => setDeliveryType("delivery")}
                  style={deliveryType === "delivery" ? { borderColor: `${accent}55`, backgroundColor: `${accent}18` } : undefined}
                >
                  Entrega
                </button>
                <button
                  type="button"
                  className={[
                    "rounded-2xl border px-4 py-3 text-sm transition",
                    deliveryType === "pickup" ? "border-white/20 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10",
                  ].join(" ")}
                  onClick={() => setDeliveryType("pickup")}
                  style={deliveryType === "pickup" ? { borderColor: `${accent}55`, backgroundColor: `${accent}18` } : undefined}
                >
                  Recoger
                </button>
              </div>

              <Field value={name} onChange={setName} placeholder="Tu nombre" required />
              <Field value={phone} onChange={(v) => setPhone(enforceMxPrefixUI(v))} placeholder="Teléfono" required type="tel" />

              {deliveryType === "delivery" ? (
                <>
                  <div className="text-xs text-white/55">
                    {geoLoading ? "Buscando ubicación..." : selectedSuggestion ? "✅ Ubicación seleccionada." : "Escribe tu calle y colonia (puedes abreviar)."}
                  </div>

                  {selectedSuggestion ? (
                    <div className="text-xs text-white/60">
                      Seleccionado: <span className="text-white/80">{selectedSuggestion.display}</span>
                    </div>
                  ) : null}

                  {geoError ? <div className="text-xs text-yellow-200/80">{geoError}</div> : null}

                  {coords && !zoneName ? (
                    <div className="text-xs text-yellow-200/80">
                      No estás dentro de una zona definida. Se usará el envío base ({money(baseFee)}).
                    </div>
                  ) : null}

                  <Field value={street} onChange={setStreet} placeholder="Calle" required />
                  <div className="grid grid-cols-2 gap-2">
                    <Field value={number} onChange={setNumber} placeholder="Número" />
                    <Field value={neighborhood} onChange={setNeighborhood} placeholder="Colonia" required />
                  </div>
                  <Field value={city} onChange={setCity} placeholder="Ciudad (opcional)" />

                  {/* ✅ LISTA DE SUGERENCIAS */}
                  {!selectedSuggestion && suggestions.length > 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden">
                      {suggestions.slice(0, 6).map((sug, idx) => (
                        <button
                          key={`${sug.lat}-${sug.lng}-${idx}`}
                          type="button"
                          onClick={() => pickSuggestion(sug)}
                          className="w-full text-left px-4 py-3 text-sm border-b border-white/5 hover:bg-white/5 transition"
                        >
                          {sug.display}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <textarea
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm min-h-[84px] outline-none placeholder:text-white/35 focus:border-white/20"
                    placeholder="Referencias (opcional)"
                    value={references}
                    onChange={(e) => setReferences(e.target.value)}
                  />
                </>
              ) : null}

              <textarea
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm min-h-[84px] outline-none placeholder:text-white/35 focus:border-white/20"
                placeholder="Notas (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              <button
                className="w-full rounded-2xl border px-4 py-4 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={placeOrder}
                disabled={placing || !restaurant || !validRestaurant || empty || !canOrder}
                style={{ borderColor: `${accent}55`, backgroundColor: `${accent}18` }}
              >
                {placing ? "Enviando..." : "Confirmar pedido"}
              </button>

              {!validRestaurant ? <div className="text-xs text-white/45">Tu carrito es de otro restaurante. Vacíalo para continuar.</div> : null}
            </section>
          </div>

          {/* Right */}
          <aside className="lg:col-span-2 space-y-5 lg:sticky lg:top-[92px] h-fit">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">Resumen</div>
                <div className="text-xs text-white/55">{cart.count} artículos</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-2">
                <div className="flex justify-between text-sm text-white/75">
                  <span>Subtotal</span>
                  <span>{money(subtotal)}</span>
                </div>

                <div className="flex justify-between text-sm text-white/75">
                  <span>Envío</span>
                  <span>{deliveryType === "delivery" ? money(deliveryFee) : money(0)}</span>
                </div>

                {deliveryType === "delivery" ? (
                  <div className="text-[11px] text-white/45">
                    {feeLive != null ? `Tarifa por zona${zoneName ? ` (${zoneName})` : ""}.` : `Tarifa base del restaurante.`}
                  </div>
                ) : null}

                <div className="h-px w-full bg-white/10 my-2" />

                <div className="flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span>{money(total)}</span>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => cart.clear()}
                  className="flex-1 px-4 py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm"
                  disabled={empty}
                >
                  Vaciar
                </button>

                <Link
                  href={slug ? `/r/${slug}` : "/"}
                  className="flex-1 px-4 py-3 rounded-2xl border text-sm font-semibold text-center transition"
                  style={{ borderColor: `${accent}55`, backgroundColor: `${accent}18` }}
                >
                  Menú
                </Link>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="text-sm font-semibold">Seguridad</div>
              <div className="text-xs text-white/60 mt-2">Este pedido se guarda directamente en el sistema del restaurante.</div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
