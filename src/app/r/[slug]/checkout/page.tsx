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

/** Field fuera para no remonte */
function Field({
  value,
  onChange,
  placeholder,
  required,
  type = "text",
  readOnly,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  type?: string;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      readOnly={readOnly}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={required ? `${placeholder} *` : placeholder}
      inputMode={type === "tel" ? "tel" : type === "number" ? "numeric" : undefined}
      autoComplete={type === "tel" ? "tel" : undefined}
      className={[
        "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-white/25",
        disabled ? "opacity-75 cursor-not-allowed" : "",
      ].join(" ")}
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
  const [postalCode, setPostalCode] = useState("");
  // ✅ Ciudad fija para que el grid no se vea "incompleto"
  const [city, setCity] = useState("Hidalgo del Parral");
  const [references, setReferences] = useState("");

  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [coordsSource, setCoordsSource] = useState<"auto" | null>(null);

  const [feeLive, setFeeLive] = useState<number | null>(null);
  const [zoneName, setZoneName] = useState<string | null>(null);

  const [addressConfirmed, setAddressConfirmed] = useState(false);

  // estados auto-geocode
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // sugerencias
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<GeoResult | null>(null);

  // UI: feedback fuerte
  const [banner, setBanner] = useState<{ title: string; subtitle?: string; tone: "success" | "warn" | "info" } | null>(
    null
  );
  const [flashFee, setFlashFee] = useState(false);

  // debounces
  const lastGeoQueryRef = useRef<string>("");
  const activeReqRef = useRef(0);

  const validRestaurant = !!slug && cart.restaurantSlug === slug;

  useEffect(() => {
    if (!slug) return;

    async function loadRestaurant() {
      setLoadingRestaurant(true);

      const { data, error } = await supabase
        .from("restaurants")
        .select(
          "name,slug,delivery_fee,is_active,hours,logo_url,brand_icon,brand_text,brand_tagline,accent_color,brand_mode"
        )
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

  // ✅ geocode SOLO por colonia + (CP opcional) + ciudad fija
  function buildGeoQuery() {
    const c = (city.trim() || "Hidalgo del Parral").trim();
    const col = neighborhood.trim();
    const cp = postalCode.trim();
    const base = [col, cp].filter(Boolean).join(" ");
    return base ? `${base}, ${c}` : "";
  }

  function resetLocationState() {
    setCoords(null);
    setCoordsSource(null);
    setZoneName(null);
    setFeeLive(null);
    setSelectedSuggestion(null);
    setSuggestions([]);
    setGeoError(null);
    setAddressConfirmed(false);
    lastGeoQueryRef.current = "";
  }

  // ✅ auto geocode: SOLO colonia/cp/ciudad. Calle/número NO influyen
  useEffect(() => {
    if (!slug) return;
    if (deliveryType !== "delivery") return;

    if (!neighborhood.trim()) {
      setGeoLoading(false);
      setGeoError(null);
      setSuggestions([]);
      setSelectedSuggestion(null);
      setCoords(null);
      setCoordsSource(null);
      setAddressConfirmed(false);
      setFeeLive(null);
      setZoneName(null);
      return;
    }

    const q = buildGeoQuery();
    if (!q) return;

    if (lastGeoQueryRef.current === q) return;
    lastGeoQueryRef.current = q;

    const reqId = ++activeReqRef.current;
    setGeoError(null);

    const t = setTimeout(async () => {
      try {
        setGeoLoading(true);
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const j = await r.json();

        if (activeReqRef.current !== reqId) return;

        if (!r.ok || !j?.ok) {
          setGeoLoading(false);
          setGeoError("Servicio de ubicación saturado. Intenta de nuevo o agrega código postal.");
          setSuggestions([]);
          setSelectedSuggestion(null);
          setCoords(null);
          setCoordsSource(null);
          setAddressConfirmed(false);
          return;
        }

        if (!Array.isArray(j.results) || j.results.length === 0) {
          setGeoLoading(false);
          setGeoError("No pude ubicar esa colonia. Prueba otra o agrega código postal.");
          setSuggestions([]);
          setSelectedSuggestion(null);
          setCoords(null);
          setCoordsSource(null);
          setAddressConfirmed(false);
          return;
        }

        const results: GeoResult[] = j.results
          .map((x: any) => ({
            lat: Number(x.lat),
            lng: Number(x.lng),
            display: String(x.display || ""),
            raw: x.raw,
          }))
          .filter((x: GeoResult) => Number.isFinite(x.lat) && Number.isFinite(x.lng));

        setGeoLoading(false);
        setSuggestions(results);
        setSelectedSuggestion(null);
        setCoords(null);
        setCoordsSource(null);
        setAddressConfirmed(false);
      } catch {
        if (activeReqRef.current !== reqId) return;
        setGeoLoading(false);
        setGeoError("Error consultando ubicación. Intenta de nuevo.");
        setSuggestions([]);
        setSelectedSuggestion(null);
        setCoords(null);
        setCoordsSource(null);
        setAddressConfirmed(false);
      }
    }, 650);

    return () => clearTimeout(t);
  }, [slug, deliveryType, neighborhood, city, postalCode]);

  function pickSuggestion(s: GeoResult) {
    setSelectedSuggestion(s);
    setCoords({ lat: s.lat, lng: s.lng });
    setCoordsSource("auto");
    setSuggestions([]);
    setGeoError(null);
    setAddressConfirmed(true);

    setBanner({ title: "Dirección confirmada", subtitle: "Calculando zona y envío…", tone: "success" });
    window.setTimeout(() => setBanner(null), 2500);
  }

  async function ensureCoords(): Promise<{ lat: number; lng: number } | null> {
    if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) return coords;
    if (selectedSuggestion && Number.isFinite(selectedSuggestion.lat) && Number.isFinite(selectedSuggestion.lng)) {
      const c = { lat: selectedSuggestion.lat, lng: selectedSuggestion.lng };
      setCoords(c);
      setCoordsSource("auto");
      return c;
    }
    return null;
  }

  // quote en vivo solo confirmado
  useEffect(() => {
    if (!slug) return;
    if (deliveryType !== "delivery") return;

    if (!coords || !addressConfirmed) {
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
        setBanner({ title: "No pude calcular zona", subtitle: "Se usará el envío base del restaurante.", tone: "warn" });
        window.setTimeout(() => setBanner(null), 2500);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;

      const newFee = row?.fee != null ? Number(row.fee) : null;
      const newZone = row?.zone_name || null;

      setFeeLive(newFee);
      setZoneName(newZone);

      setFlashFee(true);
      window.setTimeout(() => setFlashFee(false), 1100);

      setBanner({
        title: "Envío actualizado",
        subtitle: `${newZone ? `Zona: ${newZone} · ` : ""}Envío: ${money(newFee ?? baseFee)}`,
        tone: "success",
      });
      window.setTimeout(() => setBanner(null), 2800);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, deliveryType, addressConfirmed, coords?.lat, coords?.lng, baseFee]);

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
      if (!street.trim() || !neighborhood.trim()) {
        setBanner({ title: "Falta tu domicilio", subtitle: "Escribe calle y colonia.", tone: "warn" });
        window.setTimeout(() => setBanner(null), 2500);
        return;
      }

      if (!addressConfirmed) {
        setBanner({
          title: "Confirma tu dirección",
          subtitle: "Selecciona una opción de la lista para calcular envío.",
          tone: "warn",
        });
        window.setTimeout(() => setBanner(null), 2500);
        return;
      }

      const c = await ensureCoords();
      if (!c) {
        setBanner({ title: "No pude ubicar tu colonia", subtitle: "Prueba otra o agrega código postal.", tone: "warn" });
        window.setTimeout(() => setBanner(null), 2500);
        return;
      }

      setPlacing(true);

      const payloadItems = cart.items.map((i) => ({
        menu_item_id: i.id,
        qty: i.qty,
        notes: null,
      }));

      const address = {
        street: street.trim(),
        number: number.trim(),
        neighborhood: neighborhood.trim(),
        postal_code: postalCode.trim(),
        // ✅ fijo
        city: city.trim() || "Hidalgo del Parral",
        references: references.trim(),
        lat: c.lat,
        lng: c.lng,
        coords_source: "auto_colonia",
        address_confirmed: true,
      };

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
        setBanner({ title: "No se pudo crear el pedido", subtitle: error.message, tone: "warn" });
        window.setTimeout(() => setBanner(null), 3000);
        return;
      }

      const res = Array.isArray(data) ? data[0] : data;
      cart.clear();

      if (res?.public_tracking_token) {
        router.push(`/t/${res.public_tracking_token}`);
        return;
      }

      router.push(`/r/${slug}`);
      return;
    }

    // pickup
    setPlacing(true);

    const payloadItems = cart.items.map((i) => ({
      menu_item_id: i.id,
      qty: i.qty,
      notes: null,
    }));

    const { data, error } = await supabase.rpc("create_order", {
      p_restaurant_slug: slug,
      p_customer_name: name.trim(),
      p_customer_phone: phoneE164,
      p_delivery_type: "pickup",
      p_address: null,
      p_payment_method: "cash",
      p_notes: notes.trim() || null,
      p_items: payloadItems,
    });

    setPlacing(false);

    if (error) {
      setBanner({ title: "No se pudo crear el pedido", subtitle: error.message, tone: "warn" });
      window.setTimeout(() => setBanner(null), 3000);
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

  const confirmDisabled =
    placing || !restaurant || !validRestaurant || empty || !canOrder || (deliveryType === "delivery" && !addressConfirmed);

  const bannerStyle =
    banner?.tone === "success"
      ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-50"
      : banner?.tone === "warn"
      ? "border-amber-400/70 bg-amber-400/15 text-amber-50"
      : "border-sky-400/60 bg-sky-400/15 text-sky-50";

  const addrCardStyle = addressConfirmed
    ? "border-emerald-400/60 bg-emerald-400/10"
    : "border-amber-400/70 bg-amber-400/10";

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
        {/* Banner global */}
        {banner ? (
          <div className={`mb-5 rounded-2xl border px-4 py-3 ${bannerStyle} shadow-[0_12px_40px_rgba(0,0,0,0.35)]`}>
            <div className="font-semibold text-sm">{banner.title}</div>
            {banner.subtitle ? <div className="text-xs opacity-90 mt-0.5">{banner.subtitle}</div> : null}
          </div>
        ) : null}

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
                    deliveryType === "delivery"
                      ? "border-white/20 bg-white/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10",
                  ].join(" ")}
                  onClick={() => setDeliveryType("delivery")}
                  style={deliveryType === "delivery" ? { borderColor: `${accent}75`, backgroundColor: `${accent}22` } : undefined}
                >
                  Entrega
                </button>
                <button
                  type="button"
                  className={[
                    "rounded-2xl border px-4 py-3 text-sm transition",
                    deliveryType === "pickup"
                      ? "border-white/20 bg-white/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10",
                  ].join(" ")}
                  onClick={() => {
                    setDeliveryType("pickup");
                    resetLocationState();
                    setBanner(null);
                  }}
                  style={deliveryType === "pickup" ? { borderColor: `${accent}75`, backgroundColor: `${accent}22` } : undefined}
                >
                  Recoger
                </button>
              </div>

              <Field value={name} onChange={setName} placeholder="Tu nombre" required />
              <Field value={phone} onChange={(v) => setPhone(enforceMxPrefixUI(v))} placeholder="Teléfono" required type="tel" />

              {deliveryType === "delivery" ? (
                <>
                  {/* BLOQUE DIRECCIÓN */}
                  <div className={`rounded-2xl border p-4 transition-all ${addrCardStyle}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <span className="text-lg">{addressConfirmed ? "✅" : "⚠️"}</span>
                          <span>{addressConfirmed ? "Dirección confirmada" : "Confirma tu dirección"}</span>
                        </div>
                        <div className="text-xs opacity-90 mt-1">
                          {addressConfirmed
                            ? `${zoneName ? `Zona: ${zoneName} · ` : ""}Envío: ${money(deliveryFee)}`
                            : geoLoading
                            ? "Buscando colonias…"
                            : "Selecciona una opción de la lista para calcular tu zona y envío."}
                        </div>
                      </div>

                      {addressConfirmed ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAddressConfirmed(false);
                            setZoneName(null);
                            setFeeLive(null);
                            setBanner({ title: "Edita tu dirección", subtitle: "Selecciona otra colonia si es necesario.", tone: "info" });
                            window.setTimeout(() => setBanner(null), 2500);
                          }}
                          className="text-xs px-3 py-2 rounded-full border border-white/15 bg-white/10 hover:bg-white/15 transition"
                        >
                          Cambiar
                        </button>
                      ) : null}
                    </div>

                    {addressConfirmed && selectedSuggestion?.display ? (
                      <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80">
                        <div className="opacity-70">📍 Colonia seleccionada</div>
                        <div className="mt-1">{selectedSuggestion.display}</div>
                      </div>
                    ) : null}

                    {geoError ? <div className="mt-3 text-xs text-amber-200/90">{geoError}</div> : null}
                  </div>

                  {/* Calle/numero NO resetean confirmación */}
                  <Field value={street} onChange={setStreet} placeholder="Calle" required />

                  <div className="grid grid-cols-2 gap-2">
                    <Field value={number} onChange={setNumber} placeholder="Número" />
                    <Field
                      value={neighborhood}
                      onChange={(v) => {
                        setNeighborhood(v);
                        setSelectedSuggestion(null);
                        setSuggestions([]);
                        setCoords(null);
                        setCoordsSource(null);
                        setZoneName(null);
                        setFeeLive(null);
                        setAddressConfirmed(false);
                      }}
                      placeholder="Colonia"
                      required
                    />
                  </div>

                  {/* ✅ Ciudad fija + CP (ya no se ve “faltante”) */}
                  <div className="grid grid-cols-2 gap-2">
                    <Field value={city} onChange={() => {}} placeholder="Ciudad" readOnly disabled />
                    <Field
                      value={postalCode}
                      onChange={(v) => {
                        const cp = (v || "").replace(/[^\d]/g, "").slice(0, 5);
                        setPostalCode(cp);
                        setSelectedSuggestion(null);
                        setSuggestions([]);
                        setCoords(null);
                        setCoordsSource(null);
                        setZoneName(null);
                        setFeeLive(null);
                        setAddressConfirmed(false);
                      }}
                      placeholder="Código postal (opcional)"
                    />
                  </div>

                  {/* Sugerencias */}
                  {suggestions.length > 0 && !addressConfirmed ? (
                    <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 overflow-hidden">
                      <div className="px-4 py-2 text-xs text-amber-50/90 border-b border-amber-400/30 flex items-center gap-2">
                        <span>👇</span>
                        <span className="font-semibold">Selecciona tu colonia</span>
                        <span className="text-amber-50/70 font-normal">(esto define tu envío)</span>
                      </div>
                      <div className="max-h-56 overflow-auto">
                        {suggestions.map((sug, idx) => (
                          <button
                            key={`${sug.lat}-${sug.lng}-${idx}`}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              pickSuggestion(sug);
                            }}
                            className="w-full text-left px-4 py-3 text-sm hover:bg-amber-400/10 transition border-b border-amber-400/15 last:border-b-0"
                          >
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5">📍</div>
                              <div className="min-w-0">
                                <div className="text-white/90 line-clamp-2">{sug.display || `Opción ${idx + 1}`}</div>
                                <div className="text-[11px] text-amber-50/70 mt-1">Toca para confirmar</div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <textarea
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm min-h-[84px] outline-none placeholder:text-white/35 focus:border-white/25"
                    placeholder="Referencias (opcional)"
                    value={references}
                    onChange={(e) => setReferences(e.target.value)}
                  />
                </>
              ) : null}

              <textarea
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm min-h-[84px] outline-none placeholder:text-white/35 focus:border-white/25"
                placeholder="Notas (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              <button
                className="w-full rounded-2xl border px-4 py-4 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={placeOrder}
                disabled={confirmDisabled}
                style={{ borderColor: `${accent}85`, backgroundColor: `${accent}24` }}
              >
                {placing ? "Enviando..." : deliveryType === "delivery" && !addressConfirmed ? "Confirma tu dirección" : "Confirmar pedido"}
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

                <div className={["flex justify-between text-sm transition-all duration-300", flashFee ? "text-emerald-300 scale-[1.03]" : "text-white/75"].join(" ")}>
                  <span className="flex items-center gap-2">
                    Envío
                    {flashFee ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-400/50 bg-emerald-400/15 text-emerald-100">
                        Actualizado
                      </span>
                    ) : null}
                  </span>
                  <span>{deliveryType === "delivery" ? money(deliveryFee) : money(0)}</span>
                </div>

                {deliveryType === "delivery" ? (
                  <div className="text-[11px] text-white/50">
                    {addressConfirmed ? (
                      <>
                        {zoneName ? `Zona: ${zoneName}. ` : "Fuera de zona. "}
                        {feeLive != null ? "Tarifa por zona aplicada." : "Tarifa base aplicada."}
                      </>
                    ) : (
                      "Selecciona tu colonia para calcular tu tarifa."
                    )}
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
                  style={{ borderColor: `${accent}85`, backgroundColor: `${accent}24` }}
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
