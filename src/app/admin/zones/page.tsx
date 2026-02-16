"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import dynamic from "next/dynamic";

const ZoneMap = dynamic(() => import("@/components/admin/ZoneMap"), { ssr: false });

type Restaurant = { id: string; name: string; slug: string };
type ZoneRow = {
  id: string;
  restaurant_id: string;
  name: string;
  fee: number;
  priority: number;
  active: boolean;
  geojson: any;
};

export default function AdminZonesPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState<string>("");

  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [zoneName, setZoneName] = useState("");
  const [fee, setFee] = useState<number>(35);
  const [priority, setPriority] = useState<number>(10);
  const [active, setActive] = useState<boolean>(true);
  const [geojson, setGeojson] = useState<any>(null);

  const canSave = !!restaurantId && !!zoneName.trim() && !!geojson;

  useEffect(() => {
    (async () => {
      // Carga restaurantes (ajusta si tu admin usa restaurant seleccionado)
      const { data } = await supabase.from("restaurants").select("id,name,slug").order("name");
      setRestaurants((data as Restaurant[]) || []);
      if (data?.[0]?.id) setRestaurantId(data[0].id);
    })();
  }, []);

  async function loadZones(rid: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from("delivery_zones")
      .select("id,restaurant_id,name,fee,priority,active,geojson")
      .eq("restaurant_id", rid)
      .order("priority", { ascending: false });

    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    setZones((data as ZoneRow[]) || []);
  }

  useEffect(() => {
    if (!restaurantId) return;
    loadZones(restaurantId);
    // reset form
    setEditingId(null);
    setZoneName("");
    setFee(35);
    setPriority(10);
    setActive(true);
    setGeojson(null);
  }, [restaurantId]);

  function startNew() {
    setEditingId(null);
    setZoneName("");
    setFee(35);
    setPriority(10);
    setActive(true);
    setGeojson(null);
  }

  function editZone(z: ZoneRow) {
    setEditingId(z.id);
    setZoneName(z.name);
    setFee(Number(z.fee || 0));
    setPriority(Number(z.priority || 0));
    setActive(!!z.active);
    setGeojson(z.geojson);
  }

  async function save() {
    if (!canSave) return;

    const { data, error } = await supabase.rpc("upsert_delivery_zone", {
      p_id: editingId,
      p_restaurant_id: restaurantId,
      p_name: zoneName.trim(),
      p_fee: fee,
      p_priority: priority,
      p_active: active,
      p_geojson: geojson,
    });

    if (error) {
      alert(error.message);
      return;
    }

    await loadZones(restaurantId);
    // si era nuevo, deja el form listo para otro
    if (!editingId) startNew();

    return data;
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta zona?")) return;
    const { error } = await supabase.rpc("delete_delivery_zone", { p_id: id });
    if (error) return alert(error.message);
    await loadZones(restaurantId);
    if (editingId === id) startNew();
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-5 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-2xl font-semibold">Zonas de entrega</div>
            <div className="text-sm text-white/60">Dibuja polígonos y asigna tarifas por zona.</div>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm"
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
            >
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.slug})
                </option>
              ))}
            </select>

            <button
              onClick={startNew}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              + Nueva zona
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold mb-3">Mapa</div>
            <div className="text-xs text-white/60 mb-3">
              Usa el ícono de <b>polígono</b> para dibujar. Termina con doble clic.
            </div>

            <ZoneMap
              value={geojson}
              onChange={setGeojson}
            />
            <div className="text-xs text-white/50 mt-3">
              {geojson ? "✅ Polígono listo" : "Dibuja una zona para poder guardar."}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-3">
              <div className="text-sm font-semibold">
                {editingId ? "Editar zona" : "Crear zona"}
              </div>

              <input
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                placeholder="Nombre (ej. Zona 1 Parral)"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-2">
                <input
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                  type="number"
                  step="0.01"
                  placeholder="Fee"
                  value={fee}
                  onChange={(e) => setFee(Number(e.target.value))}
                />
                <input
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                  type="number"
                  step="1"
                  placeholder="Prioridad"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-white/75">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Activa
              </label>

              <button
                onClick={save}
                disabled={!canSave}
                className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                Guardar
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="text-sm font-semibold mb-3">Zonas</div>
              {loading ? (
                <div className="text-sm text-white/60">Cargando…</div>
              ) : zones.length === 0 ? (
                <div className="text-sm text-white/60">No hay zonas todavía.</div>
              ) : (
                <div className="space-y-2">
                  {zones.map((z) => (
                    <div key={z.id} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{z.name}</div>
                          <div className="text-xs text-white/60 mt-1">
                            Fee: ${Number(z.fee).toFixed(2)} · Prioridad: {z.priority} · {z.active ? "Activa" : "Inactiva"}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => editZone(z)}
                            className="text-xs px-3 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => remove(z.id)}
                            className="text-xs px-3 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="text-xs text-white/45">
              Tip: si una zona está dentro de otra, la que tenga <b>prioridad</b> más alta gana.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
