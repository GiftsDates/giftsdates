import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Calendar } from "./ui/calendar";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";
import { toKey, fromKey } from "./AvailabilityCalendar";

export default function DateBookingModal({ open, onOpenChange, target }) {
  const { user, meta, lang, refreshUser } = useApp();
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState(target?.city || "");
  const [day, setDay] = useState(null);
  const [time, setTime] = useState("19:00");
  const [coins, setCoins] = useState(target?.date_price || meta?.date_min_coins || 300);
  const [avail, setAvail] = useState({ available_days: [], busy_days: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCity(target?.city || ""); setCoins(target?.date_price || meta?.date_min_coins || 300); setDay(null);
    if (open && target?.id) api.get(`/profiles/${target.id}/availability`).then(r => setAvail(r.data)).catch(() => {});
  }, [target, meta, open]);

  const busySet = new Set(avail.busy_days);
  const availSet = new Set(avail.available_days);
  const isDisabled = (d) => {
    const k = toKey(d);
    if (d < new Date(new Date().setHours(0, 0, 0, 0))) return true;
    if (busySet.has(k)) return true;
    if (availSet.size && !availSet.has(k)) return true;
    return false;
  };

  const submit = async () => {
    if (!venue || !day) { toast.error(t("fill_all", lang)); return; }
    if (user.coins < coins) { toast.error(t("not_enough_coins", lang)); return; }
    setBusy(true);
    try {
      const [h, m] = time.split(":").map(Number);
      const dt = fromKey(day); dt.setHours(h || 0, m || 0, 0, 0);
      await api.post("/dates/book", { target_id: target.id, venue, city, scheduled_at: dt.toISOString(), coins });
      await refreshUser();
      toast.success(t("date_booked", lang));
      onOpenChange(false);
    } catch (e) {
      const d = e.response?.data?.detail || "";
      toast.error(d === "DAY_UNAVAILABLE" ? t("day_unavailable_err", lang) : d === "DAY_BUSY" ? t("day_busy_err", lang) : d || t("failed", lang));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#161320] border-white/10 text-white max-w-2xl">
        <DialogHeader><DialogTitle className="font-serif-luxe text-2xl">{t("book_date", lang)} · {target?.name}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-[auto_1fr] gap-5">
          <div>
            <Label className="text-xs text-slate-400">{t("pick_day", lang)}</Label>
            <div className="mt-1 rounded-xl border border-white/10 bg-white/5" data-testid="date-calendar">
              <Calendar mode="single" selected={day ? fromKey(day) : undefined} onSelect={(d) => d && setDay(toKey(d))} disabled={isDisabled}
                modifiers={{ busy: avail.busy_days.map(fromKey), available: avail.available_days.map(fromKey) }}
                modifiersClassNames={{ busy: "line-through text-rose-400/70", available: "ring-1 ring-emerald-400/50 rounded-md" }}
                classNames={{ day_selected: "bg-rose-500 text-white hover:bg-rose-500 focus:bg-rose-500" }} />
            </div>
            <div className="flex gap-3 mt-2 text-[11px] text-slate-400">
              <span><span className="inline-block w-2.5 h-2.5 rounded-sm ring-1 ring-emerald-400/60 me-1" />{t("availability", lang)}</span>
              <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-400/50 me-1" />{t("busy_day", lang)} / {t("unavailable_day", lang)}</span>
            </div>
          </div>
          <div className="space-y-3">
            <div><Label className="text-xs text-slate-400">{t("venue", lang)}</Label>
              <Input data-testid="date-venue-input" value={venue} onChange={e => setVenue(e.target.value)} placeholder="Le Bernardin" className="bg-white/5 border-white/10 mt-1" /></div>
            <div><Label className="text-xs text-slate-400">{t("city", lang)}</Label>
              <Input data-testid="date-city-input" value={city} onChange={e => setCity(e.target.value)} className="bg-white/5 border-white/10 mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">{t("when", lang)}</Label>
                <div data-testid="date-selected-day" className="mt-1 h-10 flex items-center px-3 rounded-md bg-white/5 border border-white/10 text-sm font-mono-num">{day || "—"}</div></div>
              <div><Label className="text-xs text-slate-400">{t("time", lang)}</Label>
                <Input data-testid="date-time-input" type="time" value={time} onChange={e => setTime(e.target.value)} className="bg-white/5 border-white/10 mt-1" /></div>
            </div>
            <div><Label className="text-xs text-slate-400">{t("coins", lang)} (min {meta?.date_min_coins})</Label>
              <Input data-testid="date-coins-input" type="number" min={meta?.date_min_coins || 300} step="50" value={coins} onChange={e => setCoins(parseInt(e.target.value || 0))} className="bg-white/5 border-white/10 mt-1" /></div>
            <div className="text-xs text-slate-400 glass rounded-lg p-3">🔒 {t("commission_note", lang)}</div>
            <Button data-testid="date-booking-submit-button" disabled={busy || !day} onClick={submit} className="rose-btn text-white border-0 w-full h-11">
              {t("book_date", lang)} · 🪙 {coins}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
