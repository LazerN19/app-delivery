"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { supabase } from "@/lib/supabaseClient";
import { getOpenStatus } from "@/lib/hours";

type RestaurantLite = {
  name: string;
  slug: string;
  delivery_fee: number;
  is_active: boolean;
  hours: any;
};

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

export default function CheckoutPage() {
  const params = useParams();
  const slug = (params?.slug as string) || "";
  const router = useRouter();
  const cart = useCart();

  const [restaurant, setRestaurant] = useState<RestaurantLite | null>(null);
  const [loadingRestaurant, setLoadingRestaurant] = useState(true);

  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">("delivery");

  // datos cliente
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // dirección
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [references, setReferences] = useState("");

  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);

  const validRestaurant = !!slug && cart.restaurantSlug === slug;

  // cargar restaurante
  useEffect(() => {
    if (!slug) return;

    async function loadRestaurant() {
      setLoadingRestaurant(true);

      const { data, error } = await supabase
        .from("restaurants")
        .select("name,slug,delivery_fee,is_active,hours")
        .eq("slug", slug)
        .single();

      setLoadingRestaurant(false);

      if (error || !data) {
        setRestaurant(null);
        return;
      }

      setRestaurant(data as RestaurantLite);
    }

    loadRestaurant();
  }, [slug]);

  const open = useMemo(
    () => getOpenStatus(restaurant?.hours),
    [restaurant?.hours]
  );
  

  const canOrder = !!restaurant?.is_active && open.isOpen;

  const subtotal = useMemo(() => cart.subtotal, [cart.subtotal]);
  const deliveryFee = Number(restaurant?.delivery_fee || 0);
  const total =
    deliveryType === "delivery" ? subtotal + deliveryFee : subtotal;

  async function placeOrder() {
    if (!slug) return;
    if (!validRestaurant) return;
    if (!restaurant) return;
    if (!canOrder) return;
    if (cart.items.length === 0) return;
    if (!name.trim() || !phone.trim()) return;

    if (deliveryType === "delivery") {
      if (!street.trim() || !neighborhood.trim()) return;
    }

    setPlacing(true);

    const payloadItems = cart.items.map((i) => ({
      menu_item_id: i.id,
      qty: i.qty,
      notes: "",
    }));

    const address =
      deliveryType === "delivery"
        ? {
            street: street.trim(),
            number: number.trim(),
            neighborhood: neighborhood.trim(),
            city: city.trim(),
            references: references.trim(),
          }
        : null;

    const { data, error } = await supabase.rpc("create_order", {
      p_restaurant_slug: slug,
      p_customer_name: name.trim(),
      p_customer_phone: phone.trim(),
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

    // ✅ REDIRECCIÓN AUTOMÁTICA AL TRACKING
    if (res?.public_tracking_token) {
      router.push(`/t/${res.public_tracking_token}`);
      return;
    }

    // fallback (no debería pasar)
    router.push(`/r/${slug}`);
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold tracking-tight">Checkout</div>
            <div className="text-xs text-white/60">
              {loadingRestaurant ? "Cargando..." : restaurant?.name ?? "Restaurante"}
            </div>
          </div>

          <Link
            href={slug ? `/r/${slug}` : "/"}
            className="px-4 py-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition text-sm"
          >
            Volver
          </Link>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-5 py-6 space-y-4">
        {/* Avisos */}
        {slug && cart.restaurantSlug && cart.restaurantSlug !== slug && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="font-medium">Tu carrito pertenece a otro restaurante.</div>
            <div className="mt-3">
              <button
                className="px-4 py-2 rounded-full border border-white/15 bg-white/10 hover:bg-white/15 transition text-sm"
                onClick={() => cart.clear()}
              >
                Vaciar carrito
              </button>
            </div>
          </div>
        )}

        {restaurant && !canOrder && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="font-medium">Restaurante cerrado</div>
            <div className="text-sm text-white/70 mt-1">
              {!restaurant.is_active ? "No disponible" : open.reason}
            </div>
          </div>
        )}

        {/* Pedido */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold tracking-tight">Tu pedido</h2>
            <div className="text-xs text-white/60">{cart.count} artículos</div>
          </div>

          {cart.items.length === 0 ? (
            <div className="text-sm text-white/70">Carrito vacío.</div>
          ) : (
            <div className="space-y-3">
              {cart.items.map((i) => (
                <div key={i.id} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{i.name}</div>
                    <div className="text-sm text-white/60">
                      {money(i.price)} c/u
                    </div>
                  </div>
                  <div className="text-sm font-semibold">
                    {money(i.price * i.qty)}
                  </div>
                </div>
              ))}

              <div className="border-t border-white/10 pt-4 mt-4 space-y-1 text-sm">
                <div className="flex justify-between text-white/70">
                  <span>Subtotal</span>
                  <span>{money(subtotal)}</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>Envío</span>
                  <span>
                    {deliveryType === "delivery"
                      ? money(deliveryFee)
                      : money(0)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{money(total)}</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Datos */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div className="flex justify-between">
            <h2 className="font-semibold tracking-tight">Datos</h2>
            <div className="text-xs text-white/50">Pago: efectivo</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-2xl border px-4 py-3 text-sm transition ${
                deliveryType === "delivery"
                  ? "border-white/20 bg-white/10"
                  : "border-white/10 bg-white/5"
              }`}
              onClick={() => setDeliveryType("delivery")}
            >
              Entrega
            </button>
            <button
              type="button"
              className={`rounded-2xl border px-4 py-3 text-sm transition ${
                deliveryType === "pickup"
                  ? "border-white/20 bg-white/10"
                  : "border-white/10 bg-white/5"
              }`}
              onClick={() => setDeliveryType("pickup")}
            >
              Recoger
            </button>
          </div>

          <input
            className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm"
            placeholder="Tu nombre *"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm"
            placeholder="Teléfono *"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          {deliveryType === "delivery" && (
            <>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm"
                placeholder="Calle *"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-2">
                <input
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm"
                  placeholder="Número"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                />
                <input
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm"
                  placeholder="Colonia *"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                />
              </div>

              <input
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm"
                placeholder="Ciudad (opcional)"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />

              <textarea
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm min-h-[80px]"
                placeholder="Referencias (opcional)"
                value={references}
                onChange={(e) => setReferences(e.target.value)}
              />
            </>
          )}

          <textarea
            className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm min-h-[80px]"
            placeholder="Notas (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <button
            className="w-full rounded-2xl border border-white/15 bg-white/10 hover:bg-white/15 transition px-4 py-4 text-sm font-medium disabled:opacity-50"
            onClick={placeOrder}
            disabled={
              placing ||
              !restaurant ||
              !validRestaurant ||
              cart.items.length === 0 ||
              !canOrder
            }
          >
            {placing ? "Enviando..." : "Confirmar pedido"}
          </button>
        </section>
      </div>
    </div>
  );
}
