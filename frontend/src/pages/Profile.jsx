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
import AvailabilityCalendar from "../components/AvailabilityCalendar";

const DETAIL_KEYS = ["relationship_intent", "hobbies", "height", "weight", "languages_spoken", "job_title", "income", "income_custom", "kids", "smoking", "drinking", "religion", "bust_size", "penis_size", "date_price", "video_rate", "availability", "availability_time", "availability_slots"];

export default function Profile() {
  const { user, refreshUser, lang, meta } = useApp();
  const [f, setF] = useState(() => ({ name: user?.name, age: user?.age, bio: user?.bio, city: user?.city, country: user?.country,
    ...Object.fromEntries(DETAIL_KEYS.map(k => [k, user?.[k] ?? null])) }));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...f };
      for (const k of DETAIL_KEYS) if (payload[k] === "" || payload[k] === null) payload[k] = ["hobbies", "languages_spoken", "availability"].includes(k) ? [] : ["availability_time", "availability_slots"].includes(k) ? {} : "";
      if (!payload.availability_time?.from) payload.availability_time = { from: "18:00", to: "23:00" };
      if (!payload.height) delete payload.height;
      if (!payload.weight) delete payload.weight;
      if (!payload.date_price) delete payload.date_price;
      if (!payload.video_rate) delete payload.video_rate;
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
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <Label className="text-xs text-amber-300">{t("date_price", lang)}</Label>
            <Input data-testid="profile-date-price-input" type="number" min={meta?.date_min_coins || 300} step="50" value={f.date_price || ""} placeholder={String(meta?.date_min_coins || 300)} onChange={e => setF({ ...f, date_price: e.target.value ? parseInt(e.target.value) : null })} className="bg-white/5 border-white/10 mt-1 font-mono-num"/>
            <p className="text-xs text-slate-400 mt-1">{t("date_price_hint", lang).replace("{n}", meta?.date_min_coins || 300)}</p>
          </div>
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
            <Label className="text-xs text-violet-300">{t("video_price", lang)}</Label>
            <Input data-testid="profile-video-rate-input" type="number" min={meta?.video_rate || 10} step="5" value={f.video_rate || ""} placeholder={String(meta?.video_rate || 10)} onChange={e => setF({ ...f, video_rate: e.target.value ? parseInt(e.target.value) : null })} className="bg-white/5 border-white/10 mt-1 font-mono-num"/>
            <p className="text-xs text-slate-400 mt-1">{t("video_price_hint", lang).replace("{n}", meta?.video_rate || 10)}</p>
          </div>
        </div>
        <ProfileDetailsForm f={f} setF={setF} lang={lang} gender={user?.gender} />
        <AvailabilityCalendar value={f.availability || []} onChange={(days) => setF({ ...f, availability: days })}
          timeWindow={f.availability_time} onTimeWindow={(w) => setF({ ...f, availability_time: w })}
          slots={f.availability_slots || {}} onSlots={(s) => setF({ ...f, availability_slots: s })} />
        <div className="sticky bottom-4">
          <Button data-testid="profile-save-button" disabled={busy} onClick={save} className="rose-btn text-white border-0 h-12 w-full shadow-xl">{t("save", lang)}</Button>
        </div>
      </div>
    </div>
  );
}
