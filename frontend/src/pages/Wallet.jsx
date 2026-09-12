import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Coins, Lock, Wallet as WalletIcon, Crown, ArrowUpRight, ArrowDownRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import PayoutAccountCard from "../components/PayoutAccountCard";
import ReferralCard from "../components/ReferralCard";

export default function Wallet() {
  const { user, lang, meta, refreshUser } = useApp();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [wallet, setWallet] = useState({ transactions: [], withdrawals: [], payout_account: null, withdraw_commission: 0.3 });
  const [topOpen, setTopOpen] = useState(false);
  const [wdOpen, setWdOpen] = useState(false);
  const [premOpen, setPremOpen] = useState(sp.get("premium") === "1");
  const [wdForm, setWdForm] = useState({ amount: 100 });

  const load = () => api.get("/wallet").then(r => setWallet(r.data));
  useEffect(() => { load(); }, []);

  const buy = async (pkg) => {
    try {
      const { data } = await api.post("/payments/checkout", { package_id: pkg, origin_url: window.location.origin });
      window.location.href = data.checkout_url;
    } catch (e) { toast.error(t("payment_init_failed", lang)); }
  };
  const verified = wallet.payout_account?.status === "verified";
  const fee = Math.round(wdForm.amount * wallet.withdraw_commission * 100) / 100;
  const net = Math.round((wdForm.amount - fee) * 100) / 100;
  const withdraw = async () => {
    try { await api.post("/wallet/withdraw", { amount: wdForm.amount }); await refreshUser(); await load(); toast.success(t("withdrawal_requested", lang)); setWdOpen(false); }
    catch (e) { toast.error(e.response?.data?.detail || t("failed", lang)); }
  };
  const isPremium = user?.premium_until && new Date(user.premium_until) > new Date();

  return (
    <div className="aurora-bg min-h-[calc(100vh-4rem)]">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <h1 className="font-serif-luxe text-4xl flex items-center gap-3"><WalletIcon /> {t("wallet", lang)}</h1>
          <div className="flex gap-2">
            {wallet.is_admin && <Button data-testid="wallet-admin-link" onClick={() => nav("/admin")} variant="outline" className="bg-amber-500/10 border-amber-500/40 text-amber-300"><ShieldCheck size={16} className="me-1"/> {t("admin", lang)}</Button>}
            <Button data-testid="wallet-topup-stripe-button" onClick={() => setTopOpen(true)} className="rose-btn text-white border-0"><Coins size={16} className="me-1"/> {t("topup", lang)}</Button>
            <Button data-testid="wallet-withdraw-open-button" onClick={() => setWdOpen(true)} variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10">{t("withdraw", lang)}</Button>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <Card icon={Coins} title={t("balance", lang)} value={`🪙 ${user?.coins ?? 0}`} tone="amber" testid="wallet-balance-coins"/>
          <Card icon={Lock} title={t("escrow", lang)} value={`🪙 ${user?.escrow ?? 0}`} tone="violet" testid="wallet-escrow-coins"/>
          <Card icon={WalletIcon} title={t("withdrawable", lang)} value={`🪙 ${user?.withdrawable ?? 0}`} sub={`≈ $${((user?.withdrawable||0)*(1-wallet.withdraw_commission)/100).toFixed(2)} ${t("you_receive", lang).toLowerCase()} (−${Math.round(wallet.withdraw_commission*100)}%)`} tone="emerald" testid="wallet-withdrawable-coins"/>
        </div>

        <PayoutAccountCard key={wallet.payout_account?.submitted_at || "new"} account={wallet.payout_account} onSaved={load} />
        <ReferralCard />

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center"><Crown className="text-amber-300"/></div>
              <div>
                <div className="font-serif-luxe text-xl">{t("premium", lang)}</div>
                {isPremium ? <div className="text-xs text-emerald-300">{t("premium_active", lang)} · {new Date(user.premium_until).toLocaleDateString()}</div>
                  : <div className="text-xs text-slate-400">${meta?.premium?.amount}{t("per_month", lang)} · {t("premium_perks_short", lang)}</div>}
              </div>
            </div>
            {!isPremium && <Button data-testid="wallet-buy-premium-button" onClick={() => setPremOpen(true)} className="rose-btn text-white border-0">{t("buy_premium", lang)}</Button>}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-serif-luxe text-xl mb-3">{t("transactions", lang)}</h3>
          {wallet.transactions.length === 0 ? <div className="text-sm text-slate-500 py-6 text-center">{t("no_transactions", lang)}</div> : (
            <div className="divide-y divide-white/5">
              {wallet.transactions.map(tx => (
                <div key={tx.id} className="py-3 flex items-center gap-3" data-testid={`tx-row-${tx.id}`}>
                  <div className="text-2xl">{tx.type === "gift" ? tx.gift_icon : tx.type === "referral_bonus" ? "🎁" : "📞"}</div>
                  <div className="flex-1">
                    <div className="text-sm capitalize">{tx.type}</div>
                    <div className="text-xs text-slate-500">{new Date(tx.created_at).toLocaleString()}</div>
                  </div>
                  <div className={`font-mono-num text-sm flex items-center gap-1 ${tx.from_id === user.id ? "text-red-300" : "text-emerald-300"}`}>
                    {tx.from_id === user.id ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
                    🪙 {tx.from_id === user.id ? tx.cost : tx.net}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top-up dialog */}
      <Dialog open={topOpen} onOpenChange={setTopOpen}>
        <DialogContent className="bg-[#161320] border-white/10 text-white max-w-md">
          <DialogHeader><DialogTitle className="font-serif-luxe text-2xl">{t("topup", lang)}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {(meta?.coin_packages || []).map(p => (
              <button key={p.id} data-testid={`topup-package-${p.id}`} onClick={() => buy(p.id)} className="w-full glass rounded-xl p-4 flex items-center justify-between hover:bg-white/10 transition-all">
                <div className="text-left">
                  <div className="font-serif-luxe text-lg">🪙 {p.coins}{p.bonus ? ` + ${p.bonus} bonus` : ""}</div>
                  <div className="text-xs text-slate-400">{p.name}</div>
                </div>
                <div className="text-amber-300 font-mono-num">${p.amount}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Premium dialog */}
      <Dialog open={premOpen} onOpenChange={setPremOpen}>
        <DialogContent className="bg-[#161320] border-white/10 text-white max-w-md">
          <DialogHeader><DialogTitle className="font-serif-luxe text-2xl">{t("buy_premium", lang)}</DialogTitle></DialogHeader>
          <div className="glass rounded-xl p-5 text-center space-y-3">
            <Crown size={40} className="mx-auto text-amber-300"/>
            <div className="font-serif-luxe text-2xl">${meta?.premium?.amount}<span className="text-sm text-slate-400"> {t("per_month", lang)}</span></div>
            <ul className="text-sm text-slate-300 text-left space-y-1">
              <li>✓ {t("perk_unlimited_likes", lang)}</li><li>✓ {t("perk_top_placement", lang)}</li><li>✓ {t("perk_advanced_filters", lang)}</li><li>✓ {t("perk_see_likes", lang)}</li><li>✓ {t("perk_priority_support", lang)}</li>
            </ul>
            <Button data-testid="premium-subscribe-confirm" onClick={() => buy("premium_monthly")} className="rose-btn text-white border-0 w-full h-11">{t("buy_premium", lang)}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Withdraw dialog */}
      <Dialog open={wdOpen} onOpenChange={setWdOpen}>
        <DialogContent className="bg-[#161320] border-white/10 text-white max-w-md">
          <DialogHeader><DialogTitle className="font-serif-luxe text-2xl">{t("withdraw", lang)}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!verified && <div data-testid="withdraw-verify-warning" className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">⚠️ {t("verify_bank_first", lang)}</div>}
            <div><Label className="text-xs text-slate-400">{t("withdraw_amount", lang)}</Label>
              <Input data-testid="withdraw-amount-input" type="number" min="100" max={user?.withdrawable} value={wdForm.amount} onChange={e => setWdForm({ amount: parseFloat(e.target.value||0) })} className="bg-white/5 border-white/10 mt-1"/></div>
            {verified && <div className="text-xs text-slate-400">{t("bank", lang)}: {wallet.payout_account.bank_name} ····{wallet.payout_account.iban.slice(-4)}</div>}
            <div className="glass rounded-lg p-3 text-sm space-y-1 font-mono-num" data-testid="withdraw-breakdown">
              <div className="flex justify-between text-slate-400"><span>{t("commission", lang)} {Math.round(wallet.withdraw_commission*100)}%</span><span className="text-rose-300">− 🪙 {fee}</span></div>
              <div className="flex justify-between"><span>{t("you_receive", lang)}</span><span className="text-emerald-300">🪙 {net} ≈ ${(net/100).toFixed(2)}</span></div>
            </div>
            <Button data-testid="wallet-withdraw-submit-button" disabled={!verified} onClick={withdraw} className="rose-btn text-white border-0 w-full h-11">{t("withdraw", lang)}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Card({ icon: Icon, title, value, sub, tone, testid }) {
  const tones = {
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-300",
    violet: "bg-violet-500/10 border-violet-500/30 text-violet-300",
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  };
  return (
    <div className={`glass rounded-2xl p-5 border ${tones[tone]}`} data-testid={testid}>
      <div className="flex items-center gap-2 text-xs uppercase font-mono tracking-widest">
        <Icon size={14}/> {title}
      </div>
      <div className="mt-2 font-serif-luxe text-3xl">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1 font-mono-num">{sub}</div>}
    </div>
  );
}
