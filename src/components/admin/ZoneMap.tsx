"use client";

import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet-draw";

type Props = {
  value: any | null; // GeoJSON geometry (Polygon)
  onChange: (geojson: any | null) => void;
};

export default function ZoneMap({ value, onChange }: Props) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawnRef = useRef<L.FeatureGroup | null>(null);

  useEffect(() => {
    if (!mapDivRef.current) return;
    if (mapRef.current) return;

    // Fix íconos default
    // @ts-ignore
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });

    // Centro aproximado de Parral
    const center: L.LatLngExpression = [26.9315, -105.666];

    const map = L.map(mapDivRef.current, { zoomControl: true }).setView(center, 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    drawnItems.addTo(map);

    const drawControl = new L.Control.Draw({
      position: "topright",
      draw: {
  polygon: {},     // ✅ antes: true
  rectangle: {},   // ✅ antes: true
  circle: false,
  circlemarker: false,
  marker: false,
  polyline: false,
},
edit: {
  featureGroup: drawnItems,
  edit: {},        // ✅ antes: true
  remove: true,
},
    });

    map.addControl(drawControl);

   map.on("draw:created", (e: any) => {
  const layer = e.layer as L.Layer;

  drawnItems.clearLayers();
  drawnItems.addLayer(layer);

  const gj = (layer as any).toGeoJSON();
  onChange(gj.geometry);
});

map.on("draw:edited", () => {
  const layers = drawnItems.getLayers();
  if (layers.length === 0) {
    onChange(null);
    return;
  }
  const gj = (layers[0] as any).toGeoJSON();
  onChange(gj.geometry);
});

map.on("draw:deleted", () => {
  onChange(null);
});


    mapRef.current = map;
    drawnRef.current = drawnItems;

    return () => {
      map.off();
      map.remove();
      mapRef.current = null;
      drawnRef.current = null;
    };
  }, [onChange]);

  // Si llega value (editar zona), dibujarla en el mapa
  useEffect(() => {
    const map = mapRef.current;
    const drawnItems = drawnRef.current;
    if (!map || !drawnItems) return;

    drawnItems.clearLayers();

    if (value) {
      const layer = L.geoJSON(value);
      layer.eachLayer((l: L.Layer) => drawnItems.addLayer(l));

      try {
        const bounds = (layer as any).getBounds?.();
        if (bounds && bounds.isValid()) map.fitBounds(bounds.pad(0.2));
      } catch {}
    }
  }, [value]);

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10">
      <div ref={mapDivRef} style={{ width: "100%", height: 520 }} />
    </div>
  );
}
