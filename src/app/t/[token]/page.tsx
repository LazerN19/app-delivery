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

  const { data, error } = await supabase
    .from("orders")
    .select(`
      id, folio, status, created_at, delivery_type, address, total, subtotal, delivery_fee,
      customer_name, customer_phone, notes, restaurant_id, public_tracking_token,
      restaurants (
        id, name, slug, logo_url, brand_icon, brand_text, brand_tagline, accent_color, brand_mode
      ),
      order_items (
        id, name_snapshot, price_snapshot, qty, notes
      )
    `)
    .eq("public_tracking_token", token)
    .single();

  if (error || !data) {
    return (
      <div className="min-h-screen bg-black text-white p-6">
        <div className="max-w-xl mx-auto rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
          Pedido no encontrado.
        </div>
      </div>
    );
  }

  return <TrackingClient initial={data as any} />;
}
