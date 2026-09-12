import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";

export default function GiftModal({ open, onOpenChange, target, onSent }) {
  const { user, meta, lang, refreshUser } = useApp();
  const [selected, setSelected] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!selected) return;
    if (user.coins < selected.cost) { toast.error(t("not_enough_coins", lang)); return; }
    setBusy(true);
    try {
      await api.post("/gifts/send", { target_id: target.id, gift_id: selected.id, message: msg });
      await refreshUser();
      toast.success(`${selected.icon} sent to ${target.name}!`);
      onSent && onSent();
      onOpenChange(false); setSelected(null); setMsg("");
    } catch (e) { toast.error(e.response?.data?.detail || t("failed", lang)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#161320] border-white/10 text-white max-w-lg">
        <DialogHeader><DialogTitle className="font-serif-luxe text-2xl">{t("choose_gift", lang)} · {target?.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          {(meta?.gifts || []).map(g => (
            <button key={g.id} data-testid={`gift-option-${g.id}`} onClick={() => setSelected(g)}
              className={`p-4 rounded-2xl border transition-all ${selected?.id === g.id ? "border-rose-500 bg-rose-500/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
              <div className="text-4xl">{g.icon}</div>
              <div className="mt-1 text-xs text-slate-300">{t(g.name_key, lang)}</div>
              <div className="text-xs text-amber-300 font-mono-num">🪙 {g.cost}</div>
            </button>
          ))}
        </div>
        <Textarea data-testid="gift-message-input" placeholder={t("personal_message", lang)} value={msg} onChange={e => setMsg(e.target.value)} className="bg-white/5 border-white/10 mt-2" rows={2} />
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{t("balance", lang)}: <span className="font-mono-num text-amber-300">🪙 {user?.coins}</span></span>
          <span>{t("commission_to_recipient", lang)}</span>
        </div>
        <Button data-testid="gift-modal-send-button" disabled={!selected || busy} onClick={send} className="rose-btn text-white border-0 h-11">
          {selected ? `${t("send_gift", lang)} · 🪙 ${selected.cost}` : t("choose_gift", lang)}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
