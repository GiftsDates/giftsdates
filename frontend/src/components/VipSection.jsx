import React, { useEffect, useState } from "react";
import { Crown, Lock, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { VIP_PLACES, PRICE_KEYS } from "../lib/vipCatalog";

export default function VipSection({ userId, name }) {
  const { user, refreshUser } = useApp();
  const nav = useNavigate();
  const [data, setData] = useState(undefined); // undefined=loading, null=none
  const [slot, setSlot] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/vip/profile/${userId}`).then((r) => setData(r.data)).catch(() => setData(null));
  }, [userId]);

  if (data === undefined || data === null) return null;

  if (data.locked) {
    return (
      <div className="mt-6 relative rounded-2xl overflow-hidden gold-hairline" data-testid="vip-locked">
        <div className="p-8 blur-sm select-none pointer-events-none">
          <div className="h-4 w-40 bg-white/10 rounded mb-3" /><div className="h-3 w-full bg-white/10 rounded mb-2" /><div className="h-3 w-2/3 bg-white/10 rounded" />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-center px-6">
          <Lock className="text-amber-300" size={26} />
          <div className="font-serif-luxe text-lg text-white mt-2">Sensitive content</div>
          <p className="text-xs text-slate-300 mt-1 max-w-xs">Приватный VIP-раздел доступен по подписке Premium.</p>
          <Button data-testid="vip-unlock-cta" onClick={() => nav("/wallet?premium=1")} className="rose-btn text-white border-0 mt-3">Открыть по подписке</Button>
        </div>
      </div>
    );
  }

  const v = data.vip || {};
  const priceFor = (k) => v.prices?.[k] || 0;

  const book = async (durKey) => {
    const coins = priceFor(durKey);
    if (!coins) { toast.error("Цена не указана"); return; }
    if ((user?.coins || 0) < coins) { toast.error("Недостаточно монет", { action: { label: "Пополнить", onClick: () => nav("/wallet") } }); return; }
    setBusy(true);
    try {
      await api.post("/vip/book", { target_id: userId, venue: "VIP свидание", city: data.city || "-", scheduled_at: `${slot.date}T${slot.from}:00`, coins });
      toast.success("Бронь создана — монеты в эскроу");
      setSlot(null);
      await refreshUser();
    } catch (e) { toast.error(e.response?.data?.detail || "Ошибка"); } finally { setBusy(false); }
  };

  return (
    <div className="mt-6 glass rounded-2xl p-6 border border-rose-500/30 space-y-4" data-testid="vip-section">
      <h3 className="font-serif-luxe text-xl gold-text flex items-center gap-2"><Crown size={20} className="text-amber-300" /> VIP · приватные услуги</h3>

      {v.services?.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="vip-services">
          {v.services.map((s) => <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-200">{s}</span>)}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="vip-prices">
        {PRICE_KEYS.map((p) => priceFor(p.k) > 0 && (
          <div key={p.k} className="glass rounded-xl p-3 text-center">
            <div className="text-[11px] text-slate-400">{p.l}</div>
            <div className="font-mono-num text-amber-300">🪙 {priceFor(p.k)}</div>
          </div>
        ))}
      </div>

      {v.places?.length > 0 && (
        <div className="text-sm text-slate-300"><span className="text-slate-500">Место: </span>{v.places.map((pv) => VIP_PLACES.find((x) => x.v === pv)?.l).filter(Boolean).join(" · ")}</div>
      )}

      {v.client_wants && (
        <div className="text-sm text-slate-300"><span className="text-slate-500">Пожелания: </span>{v.client_wants}</div>
      )}

      {!data.is_owner && v.availability?.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-amber-200 mb-2 flex items-center gap-1.5"><Calendar size={15} /> Забронировать</div>
          <div className="flex flex-wrap gap-2" data-testid="vip-slots">
            {v.availability.map((s, i) => (
              <button key={i} data-testid={`vip-book-slot-${i}`} onClick={() => setSlot(s)} className="text-xs bg-white/5 gold-hairline rounded-lg px-3 py-1.5 text-slate-200 hover:bg-white/10 transition-colors">{s.date} · {s.from}–{s.to}</button>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!slot} onOpenChange={(o) => !o && setSlot(null)}>
        <DialogContent className="bg-[#161018] border-white/10 text-white max-w-sm" data-testid="vip-book-dialog">
          <DialogHeader><DialogTitle className="font-serif-luxe text-xl">Бронь · {name}</DialogTitle></DialogHeader>
          {slot && <p className="text-sm text-slate-400">{slot.date} · {slot.from}–{slot.to}. Выберите длительность:</p>}
          <div className="grid grid-cols-2 gap-2">
            {PRICE_KEYS.map((p) => priceFor(p.k) > 0 && (
              <Button key={p.k} data-testid={`vip-book-${p.k}`} onClick={() => book(p.k)} disabled={busy} className="rose-btn text-white border-0 h-auto py-2 flex-col">
                <span className="text-xs">{p.l}</span><span className="font-mono-num">🪙 {priceFor(p.k)}</span>
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">Монеты удерживаются в эскроу до подтверждения встречи.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
