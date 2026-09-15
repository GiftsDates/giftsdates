import React, { useState } from "react";
import { Crown, Plus, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { VIP_CATEGORIES, VIP_PLACES, PRICE_KEYS } from "../lib/vipCatalog";

export default function VipEditor() {
  const { user, refreshUser } = useApp();
  const nav = useNavigate();
  const isVip = user?.is_vip || (user?.vip_until && new Date(user.vip_until) > new Date());
  const v = user?.vip || {};
  const [services, setServices] = useState(v.services || []);
  const [prices, setPrices] = useState(v.prices || { hour: "", h2: "", h3: "", night: "" });
  const [places, setPlaces] = useState(v.places || []);
  const [wants, setWants] = useState(v.client_wants || "");
  const [slots, setSlots] = useState(v.availability || []);
  const [ns, setNs] = useState({ date: "", from: "18:00", to: "23:00" });
  const [busy, setBusy] = useState(false);

  if (!isVip) {
    return (
      <div className="glass rounded-2xl p-6 mb-6 border border-amber-500/30 text-center" data-testid="vip-upsell">
        <Crown className="mx-auto text-amber-300" size={34} />
        <h2 className="font-serif-luxe text-2xl mt-2 gold-text">VIP-раздел</h2>
        <p className="text-sm text-slate-300 mt-2 max-w-md mx-auto">Оформите <b>VIP Premium ($49.99/мес)</b>, чтобы добавить приватный раздел услуг, цены, места и календарь бронирования. VIP включает все Premium-возможности.</p>
        <Button data-testid="vip-upsell-cta" onClick={() => nav("/wallet?vip=1")} className="rose-btn text-white border-0 mt-4"><Sparkles size={16} className="me-1" /> Стать VIP</Button>
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
      toast.success("VIP-раздел сохранён");
    } catch (e) { toast.error(e.response?.data?.detail || "Ошибка"); } finally { setBusy(false); }
  };

  return (
    <div className="glass rounded-2xl p-6 mb-6 border border-rose-500/30 space-y-5" data-testid="vip-editor">
      <h2 className="font-serif-luxe text-2xl gold-text flex items-center gap-2"><Crown size={22} className="text-amber-300" /> VIP-раздел (приват)</h2>
      <p className="text-xs text-slate-400">Виден только Premium/VIP пользователям. Для остальных — размыт с надписью «sensitive content».</p>

      {VIP_CATEGORIES.map((cat) => (
        <div key={cat.key} data-testid={`vip-cat-${cat.key}`}>
          <div className="text-sm font-semibold text-amber-200 mb-2">{cat.title}</div>
          <div className="flex flex-wrap gap-2">
            {cat.items.map((it) => (
              <button key={it} data-testid={`vip-svc-${it}`} onClick={() => toggle(services, setServices, it)}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${services.includes(it) ? "bg-rose-500/20 border-rose-500/50 text-rose-200" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"}`}>{it}</button>
            ))}
          </div>
        </div>
      ))}

      <div>
        <div className="text-sm font-semibold text-amber-200 mb-2">Цены (монеты)</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PRICE_KEYS.map((p) => (
            <div key={p.k}>
              <label className="text-xs text-slate-400">{p.l}</label>
              <Input data-testid={`vip-price-${p.k}`} type="number" min="0" step="50" value={prices[p.k] ?? ""} onChange={(e) => setPrices({ ...prices, [p.k]: e.target.value })} className="bg-white/5 border-white/10 mt-1 font-mono-num" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold text-amber-200 mb-2">Место</div>
        <div className="flex gap-2 flex-wrap">
          {VIP_PLACES.map((p) => (
            <button key={p.v} data-testid={`vip-place-${p.v}`} onClick={() => toggle(places, setPlaces, p.v)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${places.includes(p.v) ? "bg-amber-500/20 border-amber-500/50 text-amber-200" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"}`}>{p.l}</button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold text-amber-200 mb-2">Календарь доступности (можно несколько в день)</div>
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
          {slots.length === 0 && <span className="text-xs text-slate-500">Слотов пока нет</span>}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold text-amber-200 mb-2">Что вы хотите от клиента</div>
        <Textarea data-testid="vip-wants" rows={3} maxLength={1000} value={wants} onChange={(e) => setWants(e.target.value)} placeholder="Опишите пожелания к клиенту…" className="bg-white/5 border-white/10" />
      </div>

      <Button data-testid="vip-save" onClick={save} disabled={busy} className="rose-btn text-white border-0 h-11 w-full">{busy ? "Сохраняем…" : "Сохранить VIP-раздел"}</Button>
    </div>
  );
}
