"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = {
  id: string;          // menu_item_id
  name: string;
  price: number;
  qty: number;
};

type CartState = {
  restaurantSlug: string | null;
  items: CartItem[];
};

type CartContextType = {
  restaurantSlug: string | null;
  items: CartItem[];
  count: number;
  subtotal: number;
  setRestaurantSlug: (slug: string) => void;
  addItem: (slug: string, item: { id: string; name: string; price: number }) => void;
  removeItem: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextType | null>(null);

const STORAGE_KEY = "food_saas_cart_v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CartState>({ restaurantSlug: null, items: [] });
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const count = useMemo(() => state.items.reduce((a, i) => a + i.qty, 0), [state.items]);
  const subtotal = useMemo(
    () => state.items.reduce((a, i) => a + i.price * i.qty, 0),
    [state.items]
  );

  function setRestaurantSlug(slug: string) {
    setState((prev) => {
      if (prev.restaurantSlug && prev.restaurantSlug !== slug) {
        // si cambias de restaurante, limpiamos carrito para evitar mezclar
        return { restaurantSlug: slug, items: [] };
      }
      return { ...prev, restaurantSlug: slug };
    });
  }

  function addItem(slug: string, item: { id: string; name: string; price: number }) {
    setState((prev) => {
      if (prev.restaurantSlug && prev.restaurantSlug !== slug) {
        // nuevo restaurante => reset
        return { restaurantSlug: slug, items: [{ ...item, qty: 1 }] };
      }
      const existing = prev.items.find((x) => x.id === item.id);
      if (existing) {
        return {
          restaurantSlug: slug,
          items: prev.items.map((x) => (x.id === item.id ? { ...x, qty: x.qty + 1 } : x)),
        };
      }
      return { restaurantSlug: slug, items: [...prev.items, { ...item, qty: 1 }] };
    });
  }

  function removeItem(id: string) {
    setState((prev) => ({ ...prev, items: prev.items.filter((x) => x.id !== id) }));
  }

  function setQty(id: string, qty: number) {
    const q = Math.max(1, qty);
    setState((prev) => ({
      ...prev,
      items: prev.items.map((x) => (x.id === id ? { ...x, qty: q } : x)),
    }));
  }

  function clear() {
    setState({ restaurantSlug: state.restaurantSlug, items: [] });
  }

  const value: CartContextType = {
    restaurantSlug: state.restaurantSlug,
    items: state.items,
    count,
    subtotal,
    setRestaurantSlug,
    addItem,
    removeItem,
    setQty,
    clear,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
