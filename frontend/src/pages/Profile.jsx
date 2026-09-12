import React, { useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import PhotoGrid from "../components/PhotoGrid";

export default function Profile() {
  const { user, refreshUser, lang } = useApp();
  const [f, setF] = useState({ name: user?.name, age: user?.age, bio: user?.bio, city: user?.city, country: user?.country });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try { await api.patch("/auth/me", f); await refreshUser(); toast.success(t("saved", lang)); }
    catch { toast.error(t("failed", lang)); } finally { setBusy(false); }
  };

  return (
    <div className="aurora-bg min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="font-serif-luxe text-4xl mb-6">{t("profile", lang)}</h1>
        <div className="glass rounded-2xl p-6 space-y-4 mb-6">
          <PhotoGrid />
        </div>
        <div className="glass rounded-2xl p-6 space-y-4 mb-6">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-400">{t("name", lang)}</Label>
              <Input data-testid="profile-name-input" value={f.name || ""} onChange={e => setF({ ...f, name: e.target.value })} className="bg-white/5 border-white/10 mt-1"/></div>
            <div><Label className="text-xs text-slate-400">{t("age", lang)}</Label>
              <Input data-testid="profile-age-input" type="number" value={f.age || 18} onChange={e => setF({ ...f, age: parseInt(e.target.value||18) })} className="bg-white/5 border-white/10 mt-1"/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-400">{t("city", lang)}</Label>
              <Input data-testid="profile-city-input" value={f.city || ""} onChange={e => setF({ ...f, city: e.target.value })} className="bg-white/5 border-white/10 mt-1"/></div>
            <div><Label className="text-xs text-slate-400">{t("country", lang)}</Label>
              <Input data-testid="profile-country-input" value={f.country || ""} onChange={e => setF({ ...f, country: e.target.value })} className="bg-white/5 border-white/10 mt-1"/></div>
          </div>
          <div><Label className="text-xs text-slate-400">{t("bio", lang)}</Label>
            <Textarea data-testid="profile-bio-input" rows={4} value={f.bio || ""} onChange={e => setF({ ...f, bio: e.target.value })} className="bg-white/5 border-white/10 mt-1"/></div>
          <Button data-testid="profile-save-button" disabled={busy} onClick={save} className="rose-btn text-white border-0 h-11">{t("save", lang)}</Button>
        </div>
      </div>
    </div>
  );
}
