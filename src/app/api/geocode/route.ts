import { NextResponse } from "next/server";

// Bounding box aproximado de Hidalgo del Parral (lon/lat)
// (minLon, minLat, maxLon, maxLat)
const PARRAL_VIEWBOX = "-105.9782353,26.8623592,-105.3973646,27.3681834";

function isLikelyHtmlOrXml(t: string) {
  const s = (t || "").trim().toLowerCase();
  return s.startsWith("<!doctype") || s.startsWith("<html") || s.startsWith("<?xml") || s.startsWith("<");
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
        // Nominatim es delicado con headers; estos ayudan a que no responda HTML raro
        "User-Agent": "siteapp.mx delivery (contact: admin@siteapp.mx)",
        "Accept": "application/json",
        "Referer": "https://siteapp.mx/",
      },
      cache: "no-store",
    });

    const text = await r.text();

    // Si Nominatim respondió HTML/XML o error, NO intentes JSON.parse
    if (!r.ok || isLikelyHtmlOrXml(text)) {
      return NextResponse.json(
        {
          ok: true,
          found: false,
          results: [],
          // útil para debug rápido (no expone todo)
          meta: { status: r.status, blocked: true },
        },
        { status: 200 }
      );
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: true, found: false, results: [], meta: { status: r.status, parse_failed: true } },
        { status: 200 }
      );
    }

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ ok: true, found: false, results: [] });
    }

    // filtro extra: quedarnos con resultados que digan Parral en address/display
    const filtered = data.filter((x: any) => {
      const d = String(x.display_name || "").toLowerCase();
      const a = x.address || {};
      const city = String(a.city || a.town || a.village || a.county || "").toLowerCase();
      return d.includes("parral") || city.includes("parral") || d.includes("hidalgo del parral");
    });

    const out = (filtered.length ? filtered : data).map((x: any) => ({
      lat: Number(x.lat),
      lng: Number(x.lon),
      display: x.display_name,
      raw: x,
    }));

    return NextResponse.json({ ok: true, found: true, results: out });
  } catch (e: any) {
    // Nunca devuelvas HTML: siempre JSON
    return NextResponse.json({ ok: false, error: "geocode_failed" }, { status: 500 });
  }
}
