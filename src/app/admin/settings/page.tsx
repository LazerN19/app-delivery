"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type BrandMode = "auto" | "logo" | "icon" | "text" | "logo_text" | "icon_text";

type Restaurant = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;

  // ✅ envío
  delivery_fee: number | null;

  // branding
  logo_url: string | null;
  brand_icon: string | null;
  brand_text: string | null;
  brand_tagline: string | null;
  accent_color: string | null;
  brand_mode: string | null;

  hours: any | null; // 👈 IMPORTANTE
};

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAY_LABEL: Record<DayKey, string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

type DayHours = { closed: boolean; open: string; close: string };

function deriveAccent(r: Pick<Restaurant, "accent_color">) {
  return r.accent_color || "#ff3b30";
}

function safeMode(m: string | null): BrandMode {
  const v = (m || "auto") as BrandMode;
  return ["auto", "logo", "icon", "text", "logo_text", "icon_text"].includes(v) ? v : "auto";
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

  // auto
  if (logo) return { kind: "logo_text" as const, logo, icon, text, tagline };
  if (icon) return { kind: "icon_text" as const, logo, icon, text, tagline };
  return { kind: "text" as const, logo, icon, text, tagline };
}

/**
 * Normaliza HOURS a un objeto editable (days: { mon..sun })
 * - Si ya existe hours.days => lo usa
 * - Si existe formato directo { mon:{...}, tue:{...} } => lo toma
 * - Si no hay nada => crea default
 */
function normalizeHoursToDays(hours: any | null): { base: any; days: Record<DayKey, DayHours> } {
  const makeDefaultDay = (): DayHours => ({ closed: false, open: "09:00", close: "21:00" });

  const empty: Record<DayKey, DayHours> = {
    mon: makeDefaultDay(),
    tue: makeDefaultDay(),
    wed: makeDefaultDay(),
    thu: makeDefaultDay(),
    fri: makeDefaultDay(),
    sat: makeDefaultDay(),
    sun: { closed: true, open: "09:00", close: "21:00" },
  };

  if (!hours) {
    return { base: { days: empty }, days: empty };
  }

  // Caso A: { days: {...} }
  if (hours?.days && typeof hours.days === "object") {
    const d = hours.days;
    const days: Record<DayKey, DayHours> = {
      mon: { ...empty.mon, ...(d.mon || {}) },
      tue: { ...empty.tue, ...(d.tue || {}) },
      wed: { ...empty.wed, ...(d.wed || {}) },
      thu: { ...empty.thu, ...(d.thu || {}) },
      fri: { ...empty.fri, ...(d.fri || {}) },
      sat: { ...empty.sat, ...(d.sat || {}) },
      sun: { ...empty.sun, ...(d.sun || {}) },
    };
    return { base: { ...hours, days }, days };
  }

  // Caso B: { mon:{...}, tue:{...} } directo
  const maybeDirect = (k: DayKey) => hours?.[k] && typeof hours[k] === "object";
  if (maybeDirect("mon") || maybeDirect("tue") || maybeDirect("wed")) {
    const days: Record<DayKey, DayHours> = {
      mon: { ...empty.mon, ...(hours.mon || {}) },
      tue: { ...empty.tue, ...(hours.tue || {}) },
      wed: { ...empty.wed, ...(hours.wed || {}) },
      thu: { ...empty.thu, ...(hours.thu || {}) },
      fri: { ...empty.fri, ...(hours.fri || {}) },
      sat: { ...empty.sat, ...(hours.sat || {}) },
      sun: { ...empty.sun, ...(hours.sun || {}) },
    };
    return { base: { days }, days };
  }

  // Caso desconocido => conservamos hours en base, pero damos UI default
  return { base: hours, days: empty };
}

function isValidHHMM(v: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
}

type Toast = { id: string; title: string; body?: string };
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** ✅ cache helpers (ANTI-FLASH) */
function accentKey(slug: string) {
  return `accent_color:${slug}`;
}
function readCachedAccent(slug: string) {
  try {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(accentKey(slug));
    return v && v.startsWith("#") ? v : null;
  } catch {
    return null;
  }
}
function writeCachedAccent(slug: string, color: string) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(accentKey(slug), color);
  } catch {}
}

/** ✅ Image helpers (SUBE LOGO SIN FALLAS) */
async function resizeToPng(file: File, maxSize = 1024, quality = 0.92): Promise<Blob> {
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("No se pudo leer la imagen"));
    img.src = url;
  });

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const scale = Math.min(1, maxSize / Math.max(w, h));
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = nw;
  canvas.height = nh;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");

  ctx.drawImage(img, 0, 0, nw, nh);
  URL.revokeObjectURL(url);

  // PNG: ignora quality, pero dejamos firma uniforme
  const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b as Blob), "image/png", quality));
  return blob;
}

export default function AdminSettings() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  // ✅ Toasts internos (sin popups del navegador)
  const [toasts, setToasts] = useState<Toast[]>([]);
  function pushToast(title: string, body?: string) {
    const id = uid();
    setToasts((prev) => [{ id, title, body }, ...prev].slice(0, 3));
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }

  // Branding form fields
  const [brandMode, setBrandMode] = useState<BrandMode>("auto");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandIcon, setBrandIcon] = useState("🍽️");
  const [brandText, setBrandText] = useState("");
  const [brandTagline, setBrandTagline] = useState("Ordena directo • Sin comisiones");

  // ✅ ANTI-FLASH: NO iniciar en rojo duro
  const [accentColor, setAccentColor] = useState("#22c55e"); // fallback neutro

  // ✅ envío
  const [deliveryFee, setDeliveryFee] = useState<string>("0");

  // Hours (UI)
  const [hoursBase, setHoursBase] = useState<any | null>(null);
  const [days, setDays] = useState<Record<DayKey, DayHours> | null>(null);

  // Advanced
  const [advancedHours, setAdvancedHours] = useState(false);
  const [hoursJson, setHoursJson] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.push("/admin/login");
        return;
      }

      const { data: r, error } = await supabase
        .from("restaurants")
        .select(
          "id,owner_id,name,slug,delivery_fee,logo_url,brand_icon,brand_text,brand_tagline,accent_color,brand_mode,hours"
        )
        .eq("owner_id", auth.user.id)
        .single();

      if (error || !r) {
        router.push("/admin/onboarding");
        return;
      }

      const rr = r as Restaurant;
      setRestaurant(rr);

      // ✅ ANTI-FLASH: si hay cache por slug, úsalo antes de setear el de DB
      const cached = readCachedAccent(rr.slug);
      if (cached) setAccentColor(cached);

      setBrandMode(safeMode(rr.brand_mode));
      setLogoUrl(rr.logo_url || "");
      setBrandIcon(rr.brand_icon || "🍽️");
      setBrandText(rr.brand_text || rr.name || "");
      setBrandTagline(rr.brand_tagline || "Ordena directo • Sin comisiones");

      const dbAccent = rr.accent_color || "#ff3b30";
      setAccentColor(dbAccent);
      writeCachedAccent(rr.slug, dbAccent);

      setDeliveryFee(String(Number(rr.delivery_fee ?? 0)));

      const norm = normalizeHoursToDays(rr.hours ?? null);
      setHoursBase(norm.base);
      setDays(norm.days);
      setHoursJson(JSON.stringify(norm.base, null, 2));

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Si el usuario cambia el color, cachearlo al vuelo (antes de guardar)
  useEffect(() => {
    if (!restaurant?.slug) return;
    if (!accentColor || !accentColor.startsWith("#")) return;
    writeCachedAccent(restaurant.slug, accentColor);
  }, [restaurant?.slug, accentColor]);

  const previewRestaurant = useMemo(() => {
    if (!restaurant) return null;

    let finalHours: any = hoursBase;

    if (advancedHours) {
      try {
        finalHours = JSON.parse(hoursJson || "null");
      } catch {
        finalHours = hoursBase;
      }
    } else if (days) {
      finalHours = hoursBase?.days ? { ...hoursBase, days } : { ...(hoursBase || {}), days };
    }

    return {
      ...restaurant,
      brand_mode: brandMode,
      logo_url: logoUrl || null,
      brand_icon: brandIcon || null,
      brand_text: brandText || null,
      brand_tagline: brandTagline || null,
      accent_color: accentColor || null,
      hours: finalHours ?? null,
      delivery_fee: Number(deliveryFee || 0),
    } as Restaurant;
  }, [
    restaurant,
    brandMode,
    logoUrl,
    brandIcon,
    brandText,
    brandTagline,
    accentColor,
    hoursBase,
    days,
    advancedHours,
    hoursJson,
    deliveryFee,
  ]);

  const preview = useMemo(() => {
    if (!previewRestaurant) return null;
    return getBrand(previewRestaurant);
  }, [previewRestaurant]);

  function updateDay(k: DayKey, patch: Partial<DayHours>) {
    setDays((prev) => {
      if (!prev) return prev;
      return { ...prev, [k]: { ...prev[k], ...patch } };
    });
  }

  async function save() {
    if (!restaurant) return;

    setSaving(true);

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) {
      setSaving(false);
      router.push("/admin/login");
      return;
    }

    let finalHours: any = hoursBase;

    if (advancedHours) {
      try {
        finalHours = JSON.parse(hoursJson || "null");
      } catch {
        setSaving(false);
        pushToast("⚠️ JSON inválido", "Revisa el horario en modo avanzado (JSON).");
        return;
      }
    } else if (days) {
      finalHours = hoursBase?.days ? { ...hoursBase, days } : { ...(hoursBase || {}), days };
    }

    const payload = {
      brand_mode: brandMode,
      logo_url: logoUrl || null,
      brand_icon: (brandIcon || "").trim() || null,
      brand_text: (brandText || "").trim() || null,
      brand_tagline: (brandTagline || "").trim() || null,
      accent_color: (accentColor || "").trim() || null,
      hours: finalHours ?? null,
      delivery_fee: Number(deliveryFee || 0),
    };

    const { error } = await supabase.from("restaurants").update(payload).eq("id", restaurant.id).eq("owner_id", user.id);

    setSaving(false);

    if (error) {
      pushToast("❌ No se pudo guardar", error.message);
      return;
    }

    writeCachedAccent(restaurant.slug, accentColor);
    pushToast("✅ Guardado", "Cambios aplicados correctamente.");
  }

  async function uploadLogo(file: File) {
    if (!restaurant) return;

    // ✅ evita HEIC / formatos raros
    const okTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!okTypes.includes(file.type)) {
      pushToast("⚠️ Formato no soportado", "Usa PNG o JPG (en iPhone mándalo como “Más compatible”, no HEIC).");
      return;
    }

    setUploading(true);

    try {
      // ✅ convertir + resize (evita que “no cargue” por ser gigante)
      const blob = await resizeToPng(file, 1024);

      // ✅ path fijo (simple) + cache bust
      const path = `${restaurant.id}/logo.png`;

      const { error: upErr } = await supabase.storage.from("restaurant-assets").upload(path, blob, {
        upsert: true,
        cacheControl: "3600",
        contentType: "image/png",
      });

      if (upErr) {
        pushToast("❌ Error al subir logo", upErr.message);
        return;
      }

      const { data } = supabase.storage.from("restaurant-assets").getPublicUrl(path);

      // ✅ fuerza refresco en preview
      const busted = `${data.publicUrl}?v=${Date.now()}`;
      setLogoUrl(busted);

      pushToast("✅ Logo actualizado", "Se subió correctamente.");
    } catch (e: any) {
      pushToast("❌ No se pudo procesar la imagen", e?.message || "Intenta con otra imagen.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-6">
        <div className="max-w-3xl mx-auto rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
          Cargando ajustes…
        </div>
      </div>
    );
  }

  if (!restaurant || !previewRestaurant || !preview) return null;

  const accent = deriveAccent(previewRestaurant);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ✅ Toasts internos */}
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

      <div
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          background:
            `radial-gradient(1200px 600px at 20% 10%, ${accent}22 0%, transparent 60%),` +
            `radial-gradient(900px 500px at 80% 20%, #ff950022 0%, transparent 55%),` +
            `radial-gradient(700px 450px at 40% 90%, #ffcc0020 0%, transparent 55%)`,
        }}
      />

      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/70 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold tracking-tight">Ajustes</div>
            <div className="text-xs text-white/55">{restaurant.name}</div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => router.push("/admin/orders")}
              className="px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm"
            >
              Volver
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-full border text-sm font-medium transition"
              style={{ borderColor: `${accent}55`, backgroundColor: `${accent}18` }}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Preview */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="text-sm font-semibold mb-3">Preview (cómo se verá arriba en el menú)</div>

          <div className="rounded-3xl border border-white/10 bg-black/40 p-5 flex items-center gap-3">
            {(preview.kind === "logo" || preview.kind === "logo_text") && preview.logo ? (
              <div className="h-12 w-12 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview.logo} alt="logo" className="h-full w-full object-cover" />
              </div>
            ) : preview.kind === "icon" || preview.kind === "icon_text" ? (
              <div
                className="h-12 w-12 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-2xl"
                style={{ borderColor: `${accent}50`, backgroundColor: `${accent}12` }}
              >
                {preview.icon}
              </div>
            ) : null}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-base font-semibold truncate">
                  {preview.kind === "logo" ? restaurant.name : preview.text}
                </div>
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/70"
                  style={{ borderColor: `${accent}40`, backgroundColor: `${accent}12` }}
                >
                  Menú
                </span>
              </div>
              <div className="text-xs text-white/60 truncate">{preview.tagline}</div>
            </div>
          </div>
        </section>

        {/* Branding */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-5">
          <div className="text-sm font-semibold">Branding</div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/60">Modo</label>
              <select
                value={brandMode}
                onChange={(e) => setBrandMode(e.target.value as BrandMode)}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
              >
                <option value="auto">Auto (recomendado)</option>
                <option value="logo">Solo logo</option>
                <option value="text">Solo texto</option>
                <option value="icon">Solo ícono</option>
                <option value="logo_text">Logo + texto</option>
                <option value="icon_text">Ícono + texto</option>
              </select>
              <p className="mt-2 text-[11px] text-white/45">“Auto” usa logo si existe, si no usa ícono/texto.</p>
            </div>

            <div>
              <label className="text-xs text-white/60">Color acento</label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAccentColor(v);
                    if (restaurant?.slug) writeCachedAccent(restaurant.slug, v);
                  }}
                  className="h-12 w-14 rounded-xl border border-white/10 bg-black/40"
                />
                <input
                  value={accentColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAccentColor(v);
                    if (restaurant?.slug && v.startsWith("#")) writeCachedAccent(restaurant.slug, v);
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                  placeholder="#ff3b30"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-white/60">Texto de marca</label>
              <input
                value={brandText}
                onChange={(e) => setBrandText(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                placeholder="Sushi Express"
              />
              <p className="mt-2 text-[11px] text-white/45">Si lo dejas vacío, se usa el nombre del restaurante.</p>
            </div>

            <div>
              <label className="text-xs text-white/60">Ícono (emoji)</label>
              <input
                value={brandIcon}
                onChange={(e) => setBrandIcon(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                placeholder="🍣"
              />
              <p className="mt-2 text-[11px] text-white/45">Ejemplos: 🍣 🍔 🌮 🍕 🥡 ☕</p>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-white/60">Tagline / Slogan</label>
              <input
                value={brandTagline}
                onChange={(e) => setBrandTagline(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                placeholder="Fresco • Rápido • Hecho al momento"
              />
            </div>
          </div>
        </section>

        {/* ✅ ENVÍO */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-3">
          <div>
            <div className="text-sm font-semibold">Envío</div>
            <div className="text-[11px] text-white/45">Este monto se suma al total cuando el cliente elige “Entrega”.</div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/60">Precio de envío</label>
              <input
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                placeholder="30"
              />
              <div className="text-[11px] text-white/45 mt-2">Ejemplo: 30 (MXN)</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="text-xs text-white/60">Vista rápida</div>
              <div className="mt-2 text-sm">
                Envío: <span className="font-semibold">${Number(deliveryFee || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ✅ HORARIO */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Horario</div>
              <div className="text-[11px] text-white/45">Esto controla si el restaurante está abierto para recibir pedidos.</div>
            </div>

            <button
              type="button"
              onClick={() => setAdvancedHours((v) => !v)}
              className="px-3 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
            >
              {advancedHours ? "Modo simple" : "Modo avanzado (JSON)"}
            </button>
          </div>

          {!advancedHours ? (
            <div className="space-y-3">
              {(Object.keys(DAY_LABEL) as DayKey[]).map((k) => {
                const d = days?.[k];
                if (!d) return null;

                const invalidOpen = !d.closed && !isValidHHMM(d.open);
                const invalidClose = !d.closed && !isValidHHMM(d.close);

                return (
                  <div
                    key={k}
                    className="rounded-2xl border border-white/10 bg-black/30 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="flex items-center justify-between sm:w-44">
                      <div className="text-sm font-medium">{DAY_LABEL[k]}</div>
                      <label className="inline-flex items-center gap-2 text-xs text-white/60">
                        <input type="checkbox" checked={d.closed} onChange={(e) => updateDay(k, { closed: e.target.checked })} />
                        Cerrado
                      </label>
                    </div>

                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[11px] text-white/55 mb-1">Abre</div>
                        <input
                          value={d.open}
                          onChange={(e) => updateDay(k, { open: e.target.value })}
                          disabled={d.closed}
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none disabled:opacity-50"
                          placeholder="09:00"
                        />
                        {invalidOpen ? <div className="text-[11px] text-red-300 mt-1">Formato inválido (HH:MM)</div> : null}
                      </div>

                      <div>
                        <div className="text-[11px] text-white/55 mb-1">Cierra</div>
                        <input
                          value={d.close}
                          onChange={(e) => updateDay(k, { close: e.target.value })}
                          disabled={d.closed}
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none disabled:opacity-50"
                          placeholder="21:00"
                        />
                        {invalidClose ? <div className="text-[11px] text-red-300 mt-1">Formato inválido (HH:MM)</div> : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="text-[11px] text-white/45">Tip: usa 24h (ej. 13:30). Si manejas horarios partidos o más complejos, usa el modo JSON.</div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-white/55">
                Pega aquí tu objeto <span className="font-mono">restaurants.hours</span>. Al guardar se respeta tal cual.
              </div>
              <textarea
                value={hoursJson}
                onChange={(e) => setHoursJson(e.target.value)}
                className="w-full min-h-[220px] rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-xs font-mono outline-none"
              />
              <div className="text-[11px] text-white/45">Si esto se rompe por JSON inválido, te avisa al guardar.</div>
            </div>
          )}
        </section>

        {/* Logo */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
          <div className="text-sm font-semibold">Logo</div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/60">Logo URL</label>
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                placeholder="https://..."
              />
              <p className="mt-2 text-[11px] text-white/45">Puedes pegar un link, o subir una imagen abajo.</p>
            </div>

            <div>
              <label className="text-xs text-white/60">Subir logo (PNG/JPG)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogo(f);
                }}
                className="mt-1 w-full text-sm"
              />
              <p className="mt-2 text-[11px] text-white/45">
                Se sube al bucket <span className="font-mono">restaurant-assets</span>. Se convierte y optimiza automáticamente.
              </p>
            </div>
          </div>

          {uploading ? <div className="text-sm text-white/60">Subiendo logo…</div> : null}

          {logoUrl ? (
            <div className="mt-2 rounded-3xl border border-white/10 bg-black/40 p-4 flex items-center gap-3">
              <div className="h-14 w-14 rounded-2xl border border-white/10 overflow-hidden bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="logo-preview" className="h-full w-full object-cover" />
              </div>
              <div className="text-xs text-white/60 break-all">{logoUrl}</div>
            </div>
          ) : (
            <div className="text-xs text-white/45">Aún no hay logo configurado.</div>
          )}
        </section>

        <div className="text-center text-xs text-white/40">SiteApp.mx</div>
      </main>
    </div>
  );
}
