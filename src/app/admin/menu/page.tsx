"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Restaurant = { id: string; name: string; slug: string };

type Category = {
  id: string;
  name: string;
  sort_order: number | null;
  is_active: boolean | null;
};

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category_id: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  is_available?: boolean | null;
};

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function normalize(s: string) {
  return (s || "").toLowerCase().trim();
}

async function uploadToRestaurantAssets(restaurantId: string, file: File) {
  const ext = file.name.split(".").pop() || "png";
  const path = `${restaurantId}/items/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage.from("restaurant-assets").upload(path, file, {
    upsert: false,
    cacheControl: "3600",
    contentType: file.type || "image/png",
  });

  if (upErr) throw new Error(upErr.message);

  const { data } = supabase.storage.from("restaurant-assets").getPublicUrl(path);
  return data.publicUrl;
}

export default function AdminMenuPage() {
  const router = useRouter();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("__all__");

  // Create category
  const [newCatName, setNewCatName] = useState("");
  const [creatingCat, setCreatingCat] = useState(false);

  // Create item
  const [newItemName, setNewItemName] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemCategoryId, setNewItemCategoryId] = useState<string | null>(null);
  const [newItemFile, setNewItemFile] = useState<File | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);

  // Edit category (inline)
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);

  // Edit item (drawer/modal simple)
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  async function resolveRestaurant(): Promise<Restaurant | null> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      router.push("/admin/login");
      return null;
    }

    const { data: r, error } = await supabase
      .from("restaurants")
      .select("id,name,slug")
      .eq("owner_id", auth.user.id)
      .single();

    if (error || !r) {
      router.push("/admin/onboarding");
      return null;
    }

    return r as Restaurant;
  }

  async function loadAll(rest?: Restaurant) {
    setLoading(true);
    const rr = rest ?? (await resolveRestaurant());
    if (!rr) {
      setLoading(false);
      return;
    }
    setRestaurant(rr);

    const { data: c, error: cErr } = await supabase
      .from("categories")
      .select("id,name,sort_order,is_active")
      .eq("restaurant_id", rr.id)
      .order("sort_order", { ascending: true });

    if (cErr) console.error(cErr);

    const { data: it, error: itErr } = await supabase
      .from("menu_items")
      .select("id,name,description,price,image_url,category_id,sort_order,is_active")

      .eq("restaurant_id", rr.id)
      .order("sort_order", { ascending: true });

    if (itErr) console.error(itErr);

    setCategories((c ?? []) as Category[]);
    setItems((it ?? []) as MenuItem[]);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catsSorted = useMemo(() => {
    const arr = [...categories];
    arr.sort((a, b) => Number(a.sort_order ?? 9999) - Number(b.sort_order ?? 9999));
    return arr;
  }, [categories]);

  const filteredItems = useMemo(() => {
    const q = normalize(search);
    let base = [...items];

    if (catFilter !== "__all__") {
      base = base.filter((x) => (x.category_id ?? "__uncat__") === catFilter);
    }

    if (!q) return base;

    return base.filter((x) => normalize(`${x.name} ${x.description || ""}`).includes(q));
  }, [items, search, catFilter]);

  async function createCategory() {
    if (!restaurant) return;
    const name = newCatName.trim();
    if (!name) return;

    setCreatingCat(true);

    const nextSort = (catsSorted.at(-1)?.sort_order ?? (catsSorted.length - 1)) ?? 0;
    const { error } = await supabase.from("categories").insert({
      restaurant_id: restaurant.id,
      name,
      sort_order: Number(nextSort) + 1,
      is_active: true,
    });

    setCreatingCat(false);
    if (error) return alert(error.message);

    setNewCatName("");
    await loadAll(restaurant);
  }

  async function startEditCategory(cat: Category) {
    setEditingCatId(cat.id);
    setEditingCatName(cat.name);
  }

  async function saveCategory() {
    if (!restaurant) return;
    if (!editingCatId) return;

    const name = editingCatName.trim();
    if (!name) return;

    setSavingCat(true);
    const { error } = await supabase
      .from("categories")
      .update({ name })
      .eq("id", editingCatId)
      .eq("restaurant_id", restaurant.id);

    setSavingCat(false);

    if (error) return alert(error.message);

    setEditingCatId(null);
    setEditingCatName("");
    await loadAll(restaurant);
  }

  async function deleteCategory(cat: Category) {
    if (!restaurant) return;
    const ok = confirm(
      `¿Eliminar categoría "${cat.name}"?\n\nOJO: si hay productos con esta categoría, se quedarán “Sin categoría”.`
    );
    if (!ok) return;

    // 1) desvincular items
    const { error: upErr } = await supabase
      .from("menu_items")
      .update({ category_id: null })
      .eq("restaurant_id", restaurant.id)
      .eq("category_id", cat.id);

    if (upErr) return alert(upErr.message);

    // 2) borrar categoría
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", cat.id)
      .eq("restaurant_id", restaurant.id);

    if (error) return alert(error.message);

    if (catFilter === cat.id) setCatFilter("__all__");
    await loadAll(restaurant);
  }

  async function toggleCategoryActive(cat: Category) {
    if (!restaurant) return;
    const next = !(cat.is_active ?? true);

    const { error } = await supabase
      .from("categories")
      .update({ is_active: next })
      .eq("id", cat.id)
      .eq("restaurant_id", restaurant.id);

    if (error) return alert(error.message);
    await loadAll(restaurant);
  }

  async function createItem() {
    if (!restaurant) return;
    const name = newItemName.trim();
    const price = Number(newItemPrice);

    if (!name) return;
    if (!Number.isFinite(price) || price <= 0) return;

    setCreatingItem(true);

    let image_url: string | null = null;
    try {
      if (newItemFile) image_url = await uploadToRestaurantAssets(restaurant.id, newItemFile);
    } catch (e: any) {
      setCreatingItem(false);
      return alert(e.message || "Error subiendo imagen");
    }

    const nextSort = (items.at(-1)?.sort_order ?? (items.length - 1)) ?? 0;

    const { error } = await supabase.from("menu_items").insert({
      restaurant_id: restaurant.id,
      name,
      description: newItemDesc.trim() || null,
      price,
      category_id: newItemCategoryId || null,
      sort_order: Number(nextSort) + 1,
      is_active: true,
      image_url,
    });

    setCreatingItem(false);
    if (error) return alert(error.message);

    setNewItemName("");
    setNewItemDesc("");
    setNewItemPrice("");
    setNewItemCategoryId(null);
    setNewItemFile(null);

    await loadAll(restaurant);
  }

  function openEdit(it: MenuItem) {
    setEditItem(it);
    setEditName(it.name || "");
    setEditDesc(it.description || "");
    setEditPrice(String(it.price ?? ""));
    setEditCategoryId(it.category_id ?? null);
    setEditFile(null);
    setEditOpen(true);
  }

  async function saveItem() {
    if (!restaurant || !editItem) return;

    const name = editName.trim();
    const price = Number(editPrice);
    if (!name) return;
    if (!Number.isFinite(price) || price <= 0) return;

    setSavingItem(true);

    let image_url = editItem.image_url ?? null;
    try {
      if (editFile) image_url = await uploadToRestaurantAssets(restaurant.id, editFile);
    } catch (e: any) {
      setSavingItem(false);
      return alert(e.message || "Error subiendo imagen");
    }

    const payload = {
      name,
      description: editDesc.trim() || null,
      price,
      category_id: editCategoryId || null,
      image_url,
    };

    const { error } = await supabase
      .from("menu_items")
      .update(payload)
      .eq("id", editItem.id)
      .eq("restaurant_id", restaurant.id);

    setSavingItem(false);
    if (error) return alert(error.message);

    setEditOpen(false);
    setEditItem(null);
    await loadAll(restaurant);
  }

  async function deleteItem(it: MenuItem) {
    if (!restaurant) return;
    const ok = confirm(`¿Eliminar producto "${it.name}"?`);
    if (!ok) return;

    const { error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", it.id)
      .eq("restaurant_id", restaurant.id);

    if (error) return alert(error.message);
    await loadAll(restaurant);
  }

  async function toggleItemActive(it: MenuItem) {
    if (!restaurant) return;
    const next = !(it.is_active ?? true);

    const { error } = await supabase
      .from("menu_items")
      .update({ is_active: next })
      .eq("id", it.id)
      .eq("restaurant_id", restaurant.id);

    if (error) return alert(error.message);
    await loadAll(restaurant);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  const publicLink = restaurant?.slug ? `/r/${restaurant.slug}` : "";

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Menú</h1>
            <p className="text-sm text-white/60">Crea, edita y elimina categorías y productos.</p>
            {publicLink ? (
              <p className="text-xs text-white/45 mt-2">
                Link público: <span className="font-mono">{publicLink}</span>
              </p>
            ) : null}
          </div>

          <div className="flex gap-2 items-center flex-wrap justify-end">
            <button
              className="px-4 py-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition text-sm"
              onClick={() => router.push("/admin/orders")}
              disabled={!restaurant}
            >
              Pedidos
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

        {/* Search + filter */}
        <div className="max-w-6xl mx-auto px-6 pb-5 flex flex-col md:flex-row gap-3">
          <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center gap-3">
            <div className="text-white/50 text-sm">🔎</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto por nombre o descripción…"
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

          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="md:w-[320px] rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
          >
            <option value="__all__">Todas las categorías</option>
            <option value="__uncat__">Sin categoría</option>
            {catsSorted.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">Cargando…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* LEFT: Categorías */}
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Categorías</h2>
                  <p className="text-xs text-white/55">Edita o elimina categorías.</p>
                </div>
                <div className="text-xs text-white/45">{categories.length} total</div>
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Ej: Sushi"
                  className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                />
                <button
                  onClick={createCategory}
                  disabled={creatingCat}
                  className="px-5 py-3 rounded-2xl border border-white/10 bg-white/10 hover:bg-white/15 transition text-sm font-medium disabled:opacity-60"
                >
                  {creatingCat ? "Agregando…" : "Agregar"}
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {catsSorted.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
                    Aún no hay categorías.
                  </div>
                ) : (
                  catsSorted.map((c) => {
                    const count = items.filter((it) => it.category_id === c.id).length;
                    const isEditing = editingCatId === c.id;

                    return (
                      <div key={c.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <input
                                value={editingCatName}
                                onChange={(e) => setEditingCatName(e.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm outline-none"
                              />
                            ) : (
                              <div className="font-semibold truncate">{c.name}</div>
                            )}
                            <div className="text-xs text-white/55 mt-1">{count} productos</div>
                          </div>

                          <div className="flex gap-2 items-center flex-wrap justify-end">
                            <button
                              onClick={() => toggleCategoryActive(c)}
                              className={[
                                "px-3 py-2 rounded-full border text-xs transition",
                                (c.is_active ?? true)
                                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                              ].join(" ")}
                            >
                              {(c.is_active ?? true) ? "Activa" : "Inactiva"}
                            </button>

                            {isEditing ? (
                              <>
                                <button
                                  onClick={saveCategory}
                                  disabled={savingCat}
                                  className="px-3 py-2 rounded-full border border-white/15 bg-white/10 hover:bg-white/15 transition text-xs disabled:opacity-60"
                                >
                                  {savingCat ? "Guardando…" : "Guardar"}
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingCatId(null);
                                    setEditingCatName("");
                                  }}
                                  className="px-3 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEditCategory(c)}
                                  className="px-3 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => deleteCategory(c)}
                                  className="px-3 py-2 rounded-full border border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15 transition text-xs"
                                >
                                  Borrar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* RIGHT: Productos */}
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Productos</h2>
                  <p className="text-xs text-white/55">Crea, edita y elimina productos.</p>
                </div>
                <div className="text-xs text-white/45">{items.length} total</div>
              </div>

              {/* Create product form */}
              <div className="mt-4 space-y-3">
                <input
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Nombre (Ej: Roll California)"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                />

                <textarea
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.target.value)}
                  placeholder="Descripción (ej: 6pz, aguacate, surimi, pepino...)"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none min-h-[84px]"
                />

                <div className="flex gap-2 flex-col md:flex-row">
                  <input
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    placeholder="Precio (Ej: 120)"
                    className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                  />

                  <select
                    value={newItemCategoryId ?? ""}
                    onChange={(e) => setNewItemCategoryId(e.target.value ? e.target.value : null)}
                    className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                  >
                    <option value="">Sin categoría</option>
                    {catsSorted.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={createItem}
                    disabled={creatingItem}
                    className="px-6 py-3 rounded-2xl border border-white/10 bg-white/10 hover:bg-white/15 transition text-sm font-medium disabled:opacity-60"
                  >
                    {creatingItem ? "Agregando…" : "Agregar"}
                  </button>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/60">
                    Foto del producto (opcional) — se sube a <span className="font-mono">restaurant-assets</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setNewItemFile(e.target.files?.[0] ?? null)}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* List */}
              <div className="mt-5 space-y-3">
                {filteredItems.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
                    No hay productos con ese filtro/búsqueda.
                  </div>
                ) : (
                  filteredItems.map((it) => {
                    const catName =
                      it.category_id ? catsSorted.find((c) => c.id === it.category_id)?.name : "Sin categoría";

                    return (
                      <div key={it.id} className="rounded-3xl border border-white/10 bg-black/30 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="h-12 w-12 rounded-2xl border border-white/10 bg-white/5 overflow-hidden shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {it.image_url ? (
                                <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-[10px] text-white/35">
                                  Sin foto
                                </div>
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="font-semibold truncate">{it.name}</div>
                                <span className="text-xs text-white/55">
                                  {catName ? `${catName} · ` : ""}
                                  {money(it.price)}
                                </span>
                              </div>

                              {it.description ? (
                                <div className="text-xs text-white/55 mt-1 line-clamp-2">{it.description}</div>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex gap-2 items-center flex-wrap justify-end">
                            <button
                              onClick={() => toggleItemActive(it)}
                              className={[
                                "px-3 py-2 rounded-full border text-xs transition",
                                (it.is_active ?? true)
                                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                              ].join(" ")}
                            >
                              {(it.is_active ?? true) ? "Activo" : "Inactivo"}
                            </button>

                            <button
                              onClick={() => openEdit(it)}
                              className="px-3 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                            >
                              Editar
                            </button>

                            <button
                              onClick={() => deleteItem(it)}
                              className="px-3 py-2 rounded-full border border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15 transition text-xs"
                            >
                              Borrar
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* EDIT ITEM DRAWER */}
      <div className={["fixed inset-0 z-40", editOpen ? "" : "pointer-events-none"].join(" ")}>
        <div
          className={["absolute inset-0 bg-black/60 transition-opacity", editOpen ? "opacity-100" : "opacity-0"].join(" ")}
          onClick={() => setEditOpen(false)}
        />

        <aside
          className={[
            "absolute right-0 top-0 h-full w-full sm:w-[520px] border-l border-white/10 bg-black/80 backdrop-blur-xl",
            "transition-transform duration-300",
            editOpen ? "translate-x-0" : "translate-x-full",
          ].join(" ")}
        >
          <div className="h-full flex flex-col">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">Editar producto</div>
                <div className="text-xs text-white/60">{editItem?.name ?? ""}</div>
              </div>
              <button
                onClick={() => setEditOpen(false)}
                className="px-3 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm"
              >
                Cerrar
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-3">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nombre"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
              />

              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Descripción"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none min-h-[120px]"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="Precio"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                />

                <select
                  value={editCategoryId ?? ""}
                  onChange={(e) => setEditCategoryId(e.target.value ? e.target.value : null)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"
                >
                  <option value="">Sin categoría</option>
                  {catsSorted.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-2xl border border-white/10 bg-white/5 overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {editItem?.image_url ? (
                      <img src={editItem.image_url} alt="img" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[10px] text-white/35">
                        Sin foto
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="text-sm font-medium">Cambiar foto</div>
                    <div className="text-xs text-white/55 mt-1">Tip: fotos cuadradas se ven mejor.</div>
                  </div>
                </div>

                <div className="mt-3">
                  <input type="file" accept="image/*" onChange={(e) => setEditFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-white/10 flex gap-2">
              <button
                onClick={() => setEditOpen(false)}
                className="flex-1 px-4 py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={saveItem}
                disabled={savingItem || !editItem}
                className="flex-1 px-4 py-3 rounded-2xl border border-white/15 bg-white/10 hover:bg-white/15 transition text-sm font-semibold disabled:opacity-60"
              >
                {savingItem ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display:none; }
        .no-scrollbar { -ms-overflow-style:none; scrollbar-width:none; }
      `}</style>
    </div>
  );
}
