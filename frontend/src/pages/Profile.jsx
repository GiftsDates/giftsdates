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
import ProfileDetailsForm from "../components/ProfileDetailsForm";

const DETAIL_KEYS = ["relationship_intent", "hobbies", "height", "weight", "languages_spoken", "job_title", "income", "kids", "smoking", "drinking", "religion", "bust_size", "penis_size"];

export default function Profile() {
  const { user, refreshUser, lang } = useApp();
  const [f, setF] = useState(() => ({ name: user?.name, age: user?.age, bio: user?.bio, city: user?.city, country: user?.country,
    ...Object.fromEntries(DETAIL_KEYS.map(k => [k, user?.[k] ?? null])) }));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...f };
      for (const k of DETAIL_KEYS) if (payload[k] === "" || payload[k] === null) payload[k] = k === "hobbies" || k === "languages_spoken" ? [] : "";
      if (!payload.height) delete payload.height;
      if (!payload.weight) delete payload.weight;
      await api.patch("/auth/me", payload); await refreshUser(); toast.success(t("saved", lang));
    } catch (e) { toast.error(e.response?.data?.detail || t("failed", lang)); } finally { setBusy(false); }
  };

  return (
    <div className="aurora-bg min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="font-serif-luxe text-4xl mb-6">{t("profile", lang)}</h1>
        <div className="glass rounded-2xl p-6 space-y-4 mb-6">
          <PhotoGrid />
        </div>
        <div className="glass rounded-2xl p-6 space-y-4 mb-6">
          <h2 className="font-serif-luxe text-2xl">{t("about_me", lang)}</h2>
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
        </div>
        <ProfileDetailsForm f={f} setF={setF} lang={lang} gender={user?.gender} />
        <div className="sticky bottom-4">
          <Button data-testid="profile-save-button" disabled={busy} onClick={save} className="rose-btn text-white border-0 h-12 w-full shadow-xl">{t("save", lang)}</Button>
        </div>
      </div>
    </div>
  );
}
