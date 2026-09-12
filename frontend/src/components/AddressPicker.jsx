import React, { useEffect, useState } from "react";
import { MapPin, ExternalLink } from "lucide-react";
import { Input } from "./ui/input";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";

export const mapsLink = (loc) => loc?.lat && loc?.lng ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}` :
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([loc?.venue, loc?.address, loc?.city].filter(Boolean).join(", "))}`;

export function MapsLink({ loc, testid }) {
  const { lang } = useApp();
  return <a data-testid={testid} href={mapsLink(loc)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-300 hover:underline"><ExternalLink size={11} /> {t("open_in_maps", lang)}</a>;
}

// Address autocomplete via OpenStreetMap Nominatim (no API key); result opens in Google Maps.
export default function AddressPicker({ value, onChange, testid = "address" }) {
  const { lang } = useApp();
  const [q, setQ] = useState(value?.address || "");
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (q.trim().length < 3) { setResults([]); return; }
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&accept-language=${lang}&q=${encodeURIComponent(q)}`);
        setResults(await r.json());
      } catch { setResults([]); }
    }, 400);
    return () => clearTimeout(id);
  }, [q, lang]);
  const pick = (r) => {
    const a = r.address || {};
    onChange({ address: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon), city: a.city || a.town || a.village || a.municipality || a.county || value?.city || "", postal_code: a.postcode || "", country: a.country || "", venue: value?.venue || a.amenity || a.shop || a.tourism || "" });
    setQ(r.display_name); setResults([]);
  };
  return (
    <div className="relative w-full">
      <div className="relative">
        <MapPin size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input data-testid={`${testid}-search-input`} value={q} onChange={e => setQ(e.target.value)} placeholder={t("search_address", lang)} className="bg-white/5 border-white/10 h-9 ps-8" />
      </div>
      {results.length > 0 && (
        <div data-testid={`${testid}-results`} className="absolute z-30 mt-1 w-full rounded-lg border border-white/10 bg-[#161320] shadow-xl max-h-56 overflow-auto">
          {results.map(r => <button key={r.place_id} type="button" data-testid={`${testid}-result-${r.place_id}`} onClick={() => pick(r)} className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 border-b border-white/5 last:border-0">{r.display_name}</button>)}
        </div>
      )}
      {value?.lat && <div className="mt-1"><MapsLink loc={value} testid={`${testid}-maps-link`} /></div>}
    </div>
  );
}
