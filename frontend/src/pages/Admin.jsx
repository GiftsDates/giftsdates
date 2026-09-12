import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";
import AdminPrices from "../components/AdminPrices";
import AdminVerifications from "../components/AdminVerifications";

export default function Admin() {
  const { lang } = useApp();
  const [tab, setTab] = useState("payouts");
  const [accounts, setAccounts] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [err, setErr] = useState(null);

  const load = async () => {
    try {
      const [a, w] = await Promise.all([api.get("/admin/payout-accounts"), api.get("/admin/withdrawals")]);
      setAccounts(a.data); setWithdrawals(w.data);
    } catch (e) { setErr(e.response?.data?.detail || "Error"); }
  };
  useEffect(() => { load(); }, []);

  const verify = async (uid, approve) => {
    const reason = approve ? "" : (window.prompt(t("reason", lang)) || "");
    try { await api.post(`/admin/payout-accounts/${uid}/verify`, { approve, reason }); toast.success(approve ? t("approve", lang) : t("reject", lang)); load(); }
    catch (e) { toast.error(e.response?.data?.detail || t("failed", lang)); }
  };
  const wd = async (id, action) => {
    try { await api.post(`/admin/withdrawals/${id}/${action}`); toast.success(action); load(); }
    catch (e) { toast.error(e.response?.data?.detail || t("failed", lang)); }
  };

  if (err) return <div className="aurora-bg min-h-[calc(100vh-4rem)] flex items-center justify-center text-rose-300" data-testid="admin-forbidden">{err}</div>;

  return (
    <div className="aurora-bg min-h-[calc(100vh-4rem)]">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        <h1 className="font-serif-luxe text-4xl flex items-center gap-3"><ShieldCheck /> {t("admin", lang)}</h1>
        <div className="flex gap-2" data-testid="admin-tabs">
          {["payouts", "verifications", "prices"].map(k => (
            <button key={k} data-testid={`admin-tab-${k}`} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-sm border transition-colors ${tab === k ? "bg-rose-500/15 text-rose-300 border-rose-500/30" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"}`}>{t(k, lang)}</button>
          ))}
        </div>
        {tab === "prices" ? <AdminPrices /> : tab === "verifications" ? <AdminVerifications /> : <>

        <div className="glass rounded-2xl p-5" data-testid="admin-payout-accounts">
          <h3 className="font-serif-luxe text-xl mb-3">{t("bank_account", lang)} · {t("status_pending", lang)} ({accounts.length})</h3>
          {accounts.length === 0 ? <div className="text-sm text-slate-500 py-4 text-center">—</div> : accounts.map(a => (
            <div key={a.id} data-testid={`admin-account-${a.user_id}`} className="py-3 border-t border-white/5 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[240px]">
                <div className="text-sm">{a.user_name} <span className="text-slate-500">· {a.user_email}</span></div>
                <div className="text-xs text-slate-400 font-mono">{a.holder_name} · Tax ID {a.tax_id} · {a.recipient_email}</div>
                <div className="text-xs text-slate-500">{[a.recipient_street, a.recipient_city, a.recipient_province, a.recipient_postal_code, a.country].filter(Boolean).join(", ")}</div>
                <div className="text-xs text-slate-400 font-mono mt-1">{a.bank_name} · {a.iban} · SWIFT {a.swift}{a.routing_number ? ` · RTN ${a.routing_number}` : ""}</div>
                <div className="text-xs text-slate-500">{[a.bank_street, a.bank_city, a.bank_province, a.bank_postal_code, a.bank_country].filter(Boolean).join(", ")}</div>
              </div>
              <Button data-testid={`admin-approve-${a.user_id}`} size="sm" onClick={() => verify(a.user_id, true)} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">{t("approve", lang)}</Button>
              <Button data-testid={`admin-reject-${a.user_id}`} size="sm" variant="outline" onClick={() => verify(a.user_id, false)} className="bg-rose-500/10 border-rose-500/40 text-rose-300">{t("reject", lang)}</Button>
            </div>
          ))}
        </div>

        <div className="glass rounded-2xl p-5" data-testid="admin-withdrawals">
          <h3 className="font-serif-luxe text-xl mb-3">{t("withdraw", lang)} ({withdrawals.length})</h3>
          {withdrawals.length === 0 ? <div className="text-sm text-slate-500 py-4 text-center">—</div> : withdrawals.map(w => (
            <div key={w.id} data-testid={`admin-withdrawal-${w.id}`} className="py-3 border-t border-white/5 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[240px]">
                <div className="text-sm font-mono-num">🪙 {w.amount} − {t("commission", lang)} {w.fee} = <b className="text-emerald-300">${w.usd}</b></div>
                <div className="text-xs text-slate-400">{w.destination} · {new Date(w.created_at).toLocaleString()} · <span className="uppercase">{w.status}</span></div>
              </div>
              {w.status === "pending" && <>
                <Button data-testid={`admin-withdrawal-paid-${w.id}`} size="sm" onClick={() => wd(w.id, "paid")} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">{t("mark_paid", lang)}</Button>
                <Button data-testid={`admin-withdrawal-reject-${w.id}`} size="sm" variant="outline" onClick={() => wd(w.id, "rejected")} className="bg-rose-500/10 border-rose-500/40 text-rose-300">{t("reject", lang)}</Button>
              </>}
            </div>
          ))}
        </div>
        </>}
      </div>
    </div>
  );
}
