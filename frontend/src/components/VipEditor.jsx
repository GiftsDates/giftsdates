import React, { useState } from "react";
import { Crown, Plus, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { api, fileUrl } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { VIP_CATEGORIES, VIP_PLACES, PRICE_KEYS, svcLabel, catTitle, placeLabel, priceLabel } from "../lib/vipCatalog";

export default function VipEditor() {
  const { user, refreshUser, lang } = useApp();
  const nav = useNavigate();
  const isVip = user?.is_vip || (user?.vip_until && new Date(user.vip_until) > new Date());
  const v = user?.vip || {};
  const [services, setServices] = useState(v.services || []);
  const [prices, setPrices] = useState(v.prices || { hour: "", h2: "", h3: "", night: "" });
  const [places, setPlaces] = useState(v.places || []);
  const [wants, setWants] = useState(v.client_wants || "");
  const [slots, setSlots] = useState(v.availability || []);
  const [ns, setNs] = useState({ date: "", from: "18:00", to: "23:00" });
  const [photos, setPhotos] = useState(v.photos || []);
  const [busy, setBusy] = useState(false);
  const photoRef = React.useRef(null);
  const addPhoto = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (photos.length >= 12) { toast.error(t("vip_max_photos", lang)); return; }
    const fd = new FormData(); fd.append("photo", f);
    try { const { data } = await api.post("/vip/photo", fd); setPhotos(data.photos); }
    catch (er) { toast.error(er.response?.data?.detail === "MAX_PHOTOS" ? t("vip_max_photos", lang) : "Ошибка"); }
    finally { if (photoRef.current) photoRef.current.value = ""; }
  };
  const delPhoto = async (p) => {
    try { const { data } = await api.delete(`/vip/photo?path=${encodeURIComponent(p)}`); setPhotos(data.photos); } catch { toast.error("Ошибка"); }
  };
  const makeCover = async (p) => {
    const reordered = [p, ...photos.filter((x) => x !== p)];
    setPhotos(reordered);
    try { await api.post("/vip/photos/reorder", { photos: reordered }); toast.success(t("vip_cover_updated", lang)); } catch { toast.error("Ошибка"); }
  };

  if (!isVip) {
    return (
      <div className="glass rounded-2xl p-6 mb-6 border border-amber-500/30 text-center" data-testid="vip-upsell">
        <Crown className="mx-auto text-amber-300" size={34} />
        <h2 className="font-serif-luxe text-2xl mt-2 gold-text">VIP-раздел</h2>
        <p className="text-sm text-slate-300 mt-2 max-w-md mx-auto">{t("vip_upsell", lang)}</p>
        <Button data-testid="vip-upsell-cta" onClick={() => nav("/wallet?vip=1")} className="rose-btn text-white border-0 mt-4"><Sparkles size={16} className="me-1" /> {t("vip_become_btn", lang)}</Button>
      </div>
    );
  }

  const toggle = (arr, set, val) => set(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  const addSlot = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ns.date) || ns.from >= ns.to) { toast.error("Укажите дату и корректное время"); return; }
    setSlots([...slots, { ...ns }].sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from)));
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/vip/profile", {
        services, places, client_wants: wants,
        price_hour: Number(prices.hour) || 0, price_2h: Number(prices.h2) || 0, price_3h: Number(prices.h3) || 0, price_night: Number(prices.night) || 0,
        availability: slots,
      });
      await refreshUser();
      toast.success(t("vip_saved_toast", lang));
    } catch (e) { toast.error(e.response?.data?.detail || "Ошибка"); } finally { setBusy(false); }
  };

  return (
    <div className="glass rounded-2xl p-6 mb-6 border border-rose-500/30 space-y-5" data-testid="vip-editor">
      <h2 className="font-serif-luxe text-2xl gold-text flex items-center gap-2"><Crown size={22} className="text-amber-300" /> {t("vip_editor_title", lang)}</h2>
      <p className="text-xs text-slate-400">{t("vip_editor_note", lang)}</p>

      <div data-testid="vip-photos">
        <div className="text-sm font-semibold text-amber-200 mb-2">{t("vip_photos", lang)}</div>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={p} className="relative w-20 h-20 rounded-lg overflow-hidden gold-hairline group">
              <img src={fileUrl(p)} alt="" className="w-full h-full object-cover" />
              {i === 0 && <span className="absolute bottom-0 left-0 right-0 bg-amber-500/80 text-[9px] text-black text-center">{t("vip_cover", lang)}</span>}
              {i !== 0 && <button data-testid="vip-photo-cover" onClick={() => makeCover(p)} className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] text-amber-200 text-center opacity-0 group-hover:opacity-100">{t("vip_make_cover", lang)}</button>}
              <button data-testid="vip-photo-del" onClick={() => delPhoto(p)} className="absolute top-0 right-0 bg-black/70 text-rose-300 p-0.5"><X size={12} /></button>
            </div>
          ))}
          {photos.length < 12 && (
            <>
              <input ref={photoRef} data-testid="vip-photo-input" type="file" accept="image/*" onChange={addPhoto} className="hidden" id="vip-photo" />
              <label htmlFor="vip-photo" className="w-20 h-20 rounded-lg border-2 border-dashed border-amber-400/50 flex items-center justify-center text-amber-300 cursor-pointer hover:bg-white/5"><Plus size={20} /></label>
            </>
          )}
        </div>
      </div>

      {VIP_CATEGORIES.map((cat) => (
        <div key={cat.key} data-testid={`vip-cat-${cat.key}`}>
          <div className="text-sm font-semibold text-amber-200 mb-2">{catTitle(cat.key, lang)}</div>
          <div className="flex flex-wrap gap-2">
            {cat.items.map((it) => (
              <button key={it} data-testid={`vip-svc-${it}`} onClick={() => toggle(services, setServices, it)}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${services.includes(it) ? "bg-rose-500/20 border-rose-500/50 text-rose-200" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"}`}>{svcLabel(it, lang)}</button>
            ))}
          </div>
        </div>
      ))}

      <div>
        <div className="text-sm font-semibold text-amber-200 mb-2">{t("vip_prices", lang)}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PRICE_KEYS.map((p) => (
            <div key={p.k}>
              <label className="text-xs text-slate-400">{priceLabel(p.k, lang)}</label>
              <Input data-testid={`vip-price-${p.k}`} type="number" min="0" step="50" value={prices[p.k] ?? ""} onChange={(e) => setPrices({ ...prices, [p.k]: e.target.value })} className="bg-white/5 border-white/10 mt-1 font-mono-num" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold text-amber-200 mb-2">{t("vip_place", lang)}</div>
        <div className="flex gap-2 flex-wrap">
          {VIP_PLACES.map((p) => (
            <button key={p.v} data-testid={`vip-place-${p.v}`} onClick={() => toggle(places, setPlaces, p.v)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${places.includes(p.v) ? "bg-amber-500/20 border-amber-500/50 text-amber-200" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"}`}>{placeLabel(p.v, lang)}</button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold text-amber-200 mb-2">{t("vip_calendar", lang)}</div>
        <div className="flex flex-wrap items-end gap-2 mb-2">
          <Input data-testid="vip-slot-date" type="date" value={ns.date} onChange={(e) => setNs({ ...ns, date: e.target.value })} className="bg-white/5 border-white/10 w-40" />
          <Input data-testid="vip-slot-from" type="time" value={ns.from} onChange={(e) => setNs({ ...ns, from: e.target.value })} className="bg-white/5 border-white/10 w-28" />
          <span className="text-slate-500">–</span>
          <Input data-testid="vip-slot-to" type="time" value={ns.to} onChange={(e) => setNs({ ...ns, to: e.target.value })} className="bg-white/5 border-white/10 w-28" />
          <Button data-testid="vip-slot-add" onClick={addSlot} variant="outline" className="bg-white/5 border-white/15"><Plus size={15} /></Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {slots.map((s, i) => (
            <span key={i} data-testid={`vip-slot-${i}`} className="text-xs bg-white/5 gold-hairline rounded-lg px-2.5 py-1 flex items-center gap-2 text-slate-200">
              {s.date} · {s.from}–{s.to}
              <button onClick={() => setSlots(slots.filter((_, j) => j !== i))} className="text-rose-300"><X size={12} /></button>
            </span>
          ))}
          {slots.length === 0 && <span className="text-xs text-slate-500">{t("vip_no_slots", lang)}</span>}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold text-amber-200 mb-2">{t("vip_wants", lang)}</div>
        <Textarea data-testid="vip-wants" rows={3} maxLength={1000} value={wants} onChange={(e) => setWants(e.target.value)} placeholder={t("vip_wants_ph", lang)} className="bg-white/5 border-white/10" />
      </div>

      <Button data-testid="vip-save" onClick={save} disabled={busy} className="rose-btn text-white border-0 h-11 w-full">{busy ? "…" : t("vip_save_btn", lang)}</Button>
    </div>
  );
}
