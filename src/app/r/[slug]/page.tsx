import { createClient } from "@supabase/supabase-js";
import MenuClient from "./MenuClient";

export const revalidate = 0;

type PageProps = { params: Promise<{ slug: string }> };

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function RestaurantPage(props: PageProps) {
  const { slug } = await props.params;
  const supabase = getServerSupabase();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select(
      "id,name,slug,is_active,hours,delivery_fee,logo_url,brand_icon,brand_text,brand_tagline,accent_color,brand_mode"
    )
    .eq("slug", slug)
    .single();

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-black text-white p-6">
        <h1 className="text-xl font-semibold">Restaurante no encontrado</h1>
      </div>
    );
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("id,name,sort_order,is_active")
    .eq("restaurant_id", restaurant.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const { data: items, error: itemsErr } = await supabase
    .from("menu_items")
    .select("id,name,description,price,image_url,category_id,sort_order,is_active")
    .eq("restaurant_id", restaurant.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  // mini debug server
  if (itemsErr) console.log("menu_items error:", itemsErr?.message);

  return (
    <MenuClient
      restaurant={{
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        delivery_fee: Number(restaurant.delivery_fee ?? 0),
        is_active: Boolean(restaurant.is_active),
        hours: restaurant.hours,

        logo_url: restaurant.logo_url ?? null,
        brand_icon: restaurant.brand_icon ?? null,
        brand_text: restaurant.brand_text ?? null,
        brand_tagline: restaurant.brand_tagline ?? null,
        accent_color: restaurant.accent_color ?? null,
        brand_mode: (restaurant.brand_mode ?? "auto") as any,
      }}
      categories={(categories ?? []) as any}
      items={(items ?? []) as any}
    />
  );
}
