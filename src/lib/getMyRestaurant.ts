import { supabase } from "@/lib/supabaseClient";

export async function getMyRestaurant() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { restaurant: null, user: null };

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id,name,slug,delivery_fee,theme,hours")
    .eq("owner_id", auth.user.id)
    .single();

  return { restaurant: restaurant ?? null, user: auth.user };
}
