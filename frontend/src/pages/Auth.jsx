import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { GENDERS, ORIENTATIONS, optLabel } from "../components/ProfileDetailsForm";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";
import { Heart } from "lucide-react";
import SpinWheel from "../components/SpinWheel";

export default function Auth() {
  const { login, register, lang } = useApp();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [mode, setMode] = useState(sp.get("register") ? "register" : "login");
  const [f, setF] = useState({ email: "", password: "", name: "", age: 25, gender: "female", interested_in: "male", orientation: "straight", city: "", country: "", bio: "", referral_code: sp.get("ref") || "" });
  const [busy, setBusy] = useState(false);
  const [pendingSpin] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem("gd_spin_prize") || "null"); return p && localStorage.getItem("gd_spin_token") ? p : null; } catch { return null; }
  });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (mode === "login") { await login(f.email, f.password); toast.success(t("welcome_back", lang)); }
      else {
        const st = localStorage.getItem("gd_spin_token");
        await register({ ...f, spin_token: st || undefined });
        if (pendingSpin) {
          localStorage.removeItem("gd_spin_token"); localStorage.removeItem("gd_spin_prize");
          const p = pendingSpin.type === "premium" ? t("spin_premium_prize", lang) : t("spin_coins_prize", lang).replace("{n}", pendingSpin.coins);
          toast.success(t("spin_bonus_applied", lang).replace("{p}", p));
        } else { toast.success(t("welcome_new", lang)); }
      }
      nav(mode === "login" ? "/browse" : "/verify");
    } catch (err) {
      const d = err.response?.data?.detail || "";
      if (d.startsWith("BLOCKED:")) toast.error(t("account_blocked", lang).replace("{d}", new Date(d.slice(8)).toLocaleDateString()), { duration: 8000 });
      else toast.error(d || t("failed", lang));
    }
    finally { setBusy(false); }
  };

  return (
    <div className="aurora-bg min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md glass rounded-3xl p-8 float-in">
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl rose-btn flex items-center justify-center">
            <Heart className="fill-white text-white" size={26} />
          </div>
          <h2 className="font-serif-luxe text-3xl">{mode === "login" ? t("login", lang) : t("register", lang)}</h2>
        </div>

        {mode === "register" && pendingSpin && (
          <div data-testid="spin-pending-banner" className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-center text-sm">
            <span className="font-semibold text-amber-200">🎁 {t("spin_banner", lang).replace("{p}", pendingSpin.type === "premium" ? t("spin_premium_prize", lang) : t("spin_coins_prize", lang).replace("{n}", pendingSpin.coins))}</span>
          </div>
        )}
        {!pendingSpin && (
          <div className="mb-4 flex justify-center">
            <SpinWheel onClaim={() => setMode("register")} />
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="text-xs text-slate-400">{t("email", lang)}</Label>
            <Input data-testid="auth-email-input" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className="bg-white/5 border-white/10 mt-1" />
          </div>
          <div>
            <Label className="text-xs text-slate-400">{t("password", lang)}</Label>
            <Input data-testid="auth-password-input" type="password" required value={f.password} onChange={e => setF({ ...f, password: e.target.value })} className="bg-white/5 border-white/10 mt-1" />
          </div>

          {mode === "register" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs text-slate-400">{t("name", lang)}</Label>
                  <Input data-testid="auth-name-input" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className="bg-white/5 border-white/10 mt-1" /></div>
                <div><Label className="text-xs text-slate-400">{t("age", lang)}</Label>
                  <Input data-testid="auth-age-input" type="number" min="18" max="99" required value={f.age} onChange={e => setF({ ...f, age: parseInt(e.target.value || 18) })} className="bg-white/5 border-white/10 mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-400">{t("gender", lang)}</Label>
                  <Select value={f.gender} onValueChange={v => setF({ ...f, gender: v })}>
                    <SelectTrigger data-testid="auth-gender-select" className="bg-white/5 border-white/10 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#161320] border-white/10">{GENDERS.map(g => <SelectItem key={g} value={g}>{t(g, lang)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-400">{t("interested_in", lang)}</Label>
                  <Select value={f.interested_in} onValueChange={v => setF({ ...f, interested_in: v })}>
                    <SelectTrigger data-testid="auth-interest-select" className="bg-white/5 border-white/10 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#161320] border-white/10">{GENDERS.map(g => <SelectItem key={g} value={g}>{t(g, lang)}</SelectItem>)}<SelectItem value="all">{t("all", lang)}</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-400">{t("orientation", lang)}</Label>
                  <Select value={f.orientation} onValueChange={v => setF({ ...f, orientation: v })}>
                    <SelectTrigger data-testid="auth-orientation-select" className="bg-white/5 border-white/10 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#161320] border-white/10">{ORIENTATIONS.map(o => <SelectItem key={o} value={o}>{optLabel("orientation", o, lang)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs text-slate-400">{t("city", lang)}</Label>
                  <Input data-testid="auth-city-input" required value={f.city} onChange={e => setF({ ...f, city: e.target.value })} className="bg-white/5 border-white/10 mt-1" /></div>
                <div><Label className="text-xs text-slate-400">{t("country", lang)}</Label>
                  <Input data-testid="auth-country-input" required value={f.country} onChange={e => setF({ ...f, country: e.target.value })} className="bg-white/5 border-white/10 mt-1" /></div>
              </div>
              <div><Label className="text-xs text-slate-400">{t("bio", lang)}</Label>
                <Textarea data-testid="auth-bio-input" rows={2} value={f.bio} onChange={e => setF({ ...f, bio: e.target.value })} className="bg-white/5 border-white/10 mt-1" /></div>
              <div><Label className="text-xs text-slate-400">{t("referral_optional", lang)}</Label>
                <Input data-testid="auth-referral-input" value={f.referral_code} onChange={e => setF({ ...f, referral_code: e.target.value.toUpperCase() })} className="bg-white/5 border-white/10 mt-1 font-mono" /></div>
            </>
          )}

          <Button data-testid="auth-submit-button" disabled={busy} type="submit" className="w-full rose-btn text-white border-0 h-11 mt-2">
            {busy ? "…" : (mode === "login" ? t("login", lang) : t("register", lang))}
          </Button>
        </form>

        <button data-testid="auth-toggle-mode" onClick={() => setMode(mode === "login" ? "register" : "login")} className="mt-4 w-full text-center text-sm text-slate-400 hover:text-rose-300">
          {mode === "login" ? `${t("register", lang)} →` : `← ${t("login", lang)}`}
        </button>
      </div>
    </div>
  );
}
