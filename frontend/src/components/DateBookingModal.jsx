import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";

export default function DateBookingModal({ open, onOpenChange, target }) {
  const { user, meta, lang, refreshUser } = useApp();
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState(target?.city || "");
  const [when, setWhen] = useState("");
  const [coins, setCoins] = useState(meta?.date_min_coins || 500);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => { setCity(target?.city || ""); }, [target]);

  const submit = async () => {
    if (!venue || !when) { toast.error(t("fill_all", lang)); return; }
    if (user.coins < coins) { toast.error(t("not_enough_coins", lang)); return; }
    setBusy(true);
    try {
      await api.post("/dates/book", { target_id: target.id, venue, city, scheduled_at: new Date(when).toISOString(), coins });
      await refreshUser();
      toast.success(t("date_booked", lang));
      onOpenChange(false);
    } catch (e) { toast.error(e.response?.data?.detail || t("failed", lang)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#161320] border-white/10 text-white max-w-lg">
        <DialogHeader><DialogTitle className="font-serif-luxe text-2xl">{t("book_date", lang)} · {target?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs text-slate-400">{t("venue", lang)}</Label>
            <Input data-testid="date-venue-input" value={venue} onChange={e => setVenue(e.target.value)} placeholder="Le Bernardin" className="bg-white/5 border-white/10 mt-1" /></div>
          <div><Label className="text-xs text-slate-400">{t("city", lang)}</Label>
            <Input data-testid="date-city-input" value={city} onChange={e => setCity(e.target.value)} className="bg-white/5 border-white/10 mt-1" /></div>
          <div><Label className="text-xs text-slate-400">{t("when", lang)}</Label>
            <Input data-testid="date-when-input" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className="bg-white/5 border-white/10 mt-1" /></div>
          <div><Label className="text-xs text-slate-400">{t("coins", lang)} (min {meta?.date_min_coins})</Label>
            <Input data-testid="date-coins-input" type="number" min={meta?.date_min_coins || 500} value={coins} onChange={e => setCoins(parseInt(e.target.value || 0))} className="bg-white/5 border-white/10 mt-1" /></div>
          <div className="text-xs text-slate-400 glass rounded-lg p-3">
            🔒 {t("commission_note", lang)}
          </div>
          <Button data-testid="date-booking-submit-button" disabled={busy} onClick={submit} className="rose-btn text-white border-0 w-full h-11">
            {t("book_date", lang)} · 🪙 {coins}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
