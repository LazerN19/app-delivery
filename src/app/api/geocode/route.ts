import { NextResponse } from "next/server";

// Bounding box aproximado de Hidalgo del Parral (lon/lat)
// (minLon, minLat, maxLon, maxLat)
const PARRAL_VIEWBOX = "-105.9782353,26.8623592,-105.3973646,27.3681834";

function isLikelyHtmlOrXml(t: string) {
  const s = (t || "").trim().toLowerCase();
  return s.startsWith("<!doctype") || s.startsWith("<html") || s.startsWith("<?xml") || s.startsWith("<");
}

function scoreResult(x: any, q: string) {
  const d = String(x.display_name || "").toLowerCase();
  const a = x.address || {};
  const ql = (q || "").toLowerCase();

  let s = 0;

  // ciudad
  if (d.includes("hidalgo del parral")) s += 6;
  if (d.includes("parral")) s += 3;

  const road = String(a.road || "").toLowerCase();
  const suburb = String(a.suburb || a.neighbourhood || a.quarter || "").toLowerCase();
  const postcode = String(a.postcode || "").toLowerCase();

  if (road && ql.includes(road)) s += 4;
  if (suburb && ql.includes(suburb)) s += 3;
  if (postcode && ql.includes(postcode)) s += 6;

  // importancia del proveedor
  const imp = Number(x.importance || 0);
  s += imp;

  // pequeña preferencia si parece calle
  const cls = String(x.class || "").toLowerCase();
  const typ = String(x.type || "").toLowerCase();
  if (cls === "highway") s += 1.5;
  if (typ.includes("residential") || typ.includes("tertiary") || typ.includes("secondary")) s += 1;

  return s;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q0 = (searchParams.get("q") || "").trim();
    if (!q0) return NextResponse.json({ ok: false, error: "missing q" }, { status: 400 });

    const url =
      "https://nominatim.openstreetmap.org/search" +
      `?format=jsonv2&limit=8&addressdetails=1&countrycodes=mx&accept-language=es` +
      `&bounded=1&viewbox=${encodeURIComponent(PARRAL_VIEWBOX)}` +
      `&q=${encodeURIComponent(q0)}`;

    const r = await fetch(url, {
      headers: {
        "User-Agent": "siteapp.mx delivery (contact: admin@siteapp.mx)",
        "Accept": "application/json",
        "Referer": "https://siteapp.mx/",
      },
      cache: "no-store",
    });

    const text = await r.text();

    // Si Nominatim respondió HTML/XML o error, devuelve ok:false para que el front lo trate como servicio saturado
    if (!r.ok || isLikelyHtmlOrXml(text)) {
      return NextResponse.json(
        { ok: false, error: "provider_blocked", results: [], meta: { status: r.status } },
        { status: 429 }
      );
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, error: "parse_failed", results: [], meta: { status: r.status } },
        { status: 502 }
      );
    }

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ ok: true, found: false, results: [] }, { status: 200 });
    }

    // filtro extra: quedarnos con resultados que digan Parral en address/display
    const filtered = data.filter((x: any) => {
      const d = String(x.display_name || "").toLowerCase();
      const a = x.address || {};
      const city = String(a.city || a.town || a.village || a.county || "").toLowerCase();
      return d.includes("parral") || city.includes("parral") || d.includes("hidalgo del parral");
    });

    const base = filtered.length ? filtered : data;

    // Rankeo
    const ranked = base
      .map((x: any) => ({ x, score: scoreResult(x, q0) }))
      .sort((a: any, b: any) => b.score - a.score)
      .map((o: any) => o.x);

    const out = ranked.map((x: any) => ({
      lat: Number(x.lat),
      lng: Number(x.lon),
      display: x.display_name,
      raw: x,
    }));

    return NextResponse.json({ ok: true, found: true, results: out }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: "geocode_failed" }, { status: 500 });
  }
}
