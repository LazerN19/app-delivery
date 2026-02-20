import { createClient } from "@supabase/supabase-js";
import TrackingClient from "./TrackingClient";

export const revalidate = 0;

type PageProps = { params: Promise<{ token: string }> };

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function TrackingPage(props: PageProps) {
  const { token } = await props.params;

  const supabase = getServerSupabase();

  // ✅ Nuevo: traer pedido por RPC (funciona en incógnito / anon)
  const { data, error } = await supabase.rpc("get_public_order", { p_token: token });

  if (error || !data) {
    return (
      <div className="min-h-screen bg-black text-white p-6">
        <div className="max-w-xl mx-auto rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
          Pedido no encontrado.
        </div>
      </div>
    );
  }

  // data viene como json (order + restaurant + items)
  const order = data as any;

  // ✅ Normalizamos al shape que ya usabas: restaurants + order_items
  const normalized = {
    ...order,
    restaurants: order.restaurant ?? null,
    order_items: Array.isArray(order.items)
      ? order.items.map((it: any) => ({
          id: it.id,
          name_snapshot: it.name,
          price_snapshot: it.price,
          qty: it.qty,
          notes: it.notes ?? null,
        }))
      : [],
  };

  return <TrackingClient initial={normalized as any} />;
}