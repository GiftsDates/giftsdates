import React, { useState } from "react";
import { Landmark, ShieldCheck, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";

const STATUS = {
  pending: { icon: Clock, cls: "bg-amber-500/15 border-amber-500/40 text-amber-300", key: "status_pending" },
  verified: { icon: ShieldCheck, cls: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300", key: "status_verified" },
  rejected: { icon: XCircle, cls: "bg-rose-500/15 border-rose-500/40 text-rose-300", key: "status_rejected" },
};

export default function PayoutAccountCard({ account, onSaved }) {
  const { lang } = useApp();
  const [edit, setEdit] = useState(!account);
  const [f, setF] = useState({ holder_name: account?.holder_name || "", bank_name: account?.bank_name || "", iban: account?.iban || "", country: account?.country || "", swift: account?.swift || "" });
  const [busy, setBusy] = useState(false);
  const st = account && STATUS[account.status];

  const submit = async () => {
    if (!f.holder_name || !f.bank_name || !f.iban || !f.country) { toast.error(t("fill_all", lang)); return; }
    setBusy(true);
    try { await api.post("/wallet/payout-account", f); toast.success(t("status_pending", lang)); setEdit(false); onSaved?.(); }
    catch (e) { toast.error(e.response?.data?.detail || t("failed", lang)); } finally { setBusy(false); }
  };

  return (
    <div className="glass rounded-2xl p-5" data-testid="payout-account-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center"><Landmark className="text-emerald-300" /></div>
          <div>
            <div className="font-serif-luxe text-xl">{t("bank_account", lang)}</div>
            {account && !edit && <div className="text-xs text-slate-400">{account.bank_name} · ····{account.iban.slice(-4)} · {account.holder_name}</div>}
          </div>
        </div>
        {st && !edit && (
          <div className="flex items-center gap-2">
            <span data-testid="payout-account-status" className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs ${st.cls}`}><st.icon size={12} /> {t(st.key, lang)}</span>
            {account.status !== "verified" && <Button data-testid="payout-account-edit-button" size="sm" variant="outline" onClick={() => setEdit(true)} className="bg-white/5 border-white/10">✎</Button>}
          </div>
        )}
      </div>
      {account?.status === "rejected" && account.reason && !edit && <div className="mt-2 text-xs text-rose-300">{account.reason}</div>}
      {edit && (
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <div><Label className="text-xs text-slate-400">{t("holder_name", lang)}</Label><Input data-testid="payout-holder-input" value={f.holder_name} onChange={e => setF({ ...f, holder_name: e.target.value })} className="bg-white/5 border-white/10 mt-1" /></div>
          <div><Label className="text-xs text-slate-400">{t("bank_name", lang)}</Label><Input data-testid="payout-bank-input" value={f.bank_name} onChange={e => setF({ ...f, bank_name: e.target.value })} className="bg-white/5 border-white/10 mt-1" /></div>
          <div><Label className="text-xs text-slate-400">{t("iban", lang)}</Label><Input data-testid="payout-iban-input" value={f.iban} onChange={e => setF({ ...f, iban: e.target.value })} className="bg-white/5 border-white/10 mt-1 font-mono" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-400">{t("country", lang)}</Label><Input data-testid="payout-country-input" value={f.country} onChange={e => setF({ ...f, country: e.target.value })} className="bg-white/5 border-white/10 mt-1" /></div>
            <div><Label className="text-xs text-slate-400">SWIFT</Label><Input data-testid="payout-swift-input" value={f.swift} onChange={e => setF({ ...f, swift: e.target.value })} className="bg-white/5 border-white/10 mt-1" /></div>
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <Button data-testid="payout-account-submit-button" disabled={busy} onClick={submit} className="rose-btn text-white border-0 h-10">{t("submit_verification", lang)}</Button>
            {account && <Button variant="ghost" onClick={() => setEdit(false)} className="text-slate-400">{t("cancel", lang)}</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
