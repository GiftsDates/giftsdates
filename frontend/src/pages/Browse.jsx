import React, { useEffect, useState, useCallback } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";
import ProfileCard from "../components/ProfileCard";
import GiftModal from "../components/GiftModal";
import VideoCallModal from "../components/VideoCallModal";
import DateBookingModal from "../components/DateBookingModal";
import { Search, SlidersHorizontal, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { INTENTS, KIDS, HABITS, RELIGIONS, optLabel } from "../components/ProfileDetailsForm";

const ALL = "all";
const EXTRA_DEFAULT = { intent: ALL, kids: ALL, smoking: ALL, religion: ALL, min_height: "", max_height: "" };

function FilterSelect({ testid, field, value, options, onChange, lang, label }) {
  return (
    <div className="min-w-[150px]">
      <label className="text-xs text-slate-400">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={testid} className="bg-white/5 border-white/10 mt-1"><SelectValue /></SelectTrigger>
        <SelectContent className="bg-[#161320] border-white/10 text-white max-h-72">
          <SelectItem value={ALL}>{t("all", lang)}</SelectItem>
          {options.map(o => <SelectItem key={o} value={o}>{optLabel(field, o, lang)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function Browse() {
  const { lang } = useApp();
  const nav = useNavigate();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: "", city: "", country: "", gender: "all", min_age: 18, max_age: 60, ...EXTRA_DEFAULT });
  const [showMore, setShowMore] = useState(false);
  const [target, setTarget] = useState(null);
  const [modal, setModal] = useState(null);
  const [quota, setQuota] = useState(null);
  const loadQuota = () => api.get("/likes/quota").then(r => setQuota(r.data)).catch(() => {});
  useEffect(() => { loadQuota(); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...filters };
      Object.keys(params).forEach(k => (params[k] === ALL || params[k] === "" || params[k] == null) && delete params[k]);
      const { data } = await api.get("/profiles", { params });
      setProfiles(data);
    } catch (e) { toast.error(t("failed_load", lang)); }
    finally { setLoading(false); }
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const like = async (p) => {
    try {
      const { data } = await api.post("/likes", { target_id: p.id });
      if (data.matched) toast.success(`💘 ${t("match", lang)} · ${p.name}`);
      else toast.success(`💗 ${t("like", lang)}: ${p.name}`);
      loadQuota();
    } catch (e) {
      const d = e.response?.data?.detail || "";
      if (d.startsWith("LIKE_LIMIT:")) toast.error(t("like_limit_reached", lang).replace("{n}", d.split(":")[1]), { duration: 6000, action: { label: t("premium", lang), onClick: () => nav("/wallet?premium=1") } });
      else toast.error(t("failed", lang));
    }
  };
  const open = (m, p) => { setTarget(p); setModal(m); };

  return (
    <div className="aurora-bg min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="glass rounded-2xl p-4 mb-6 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs text-slate-400 flex items-center gap-1"><Search size={12}/> {t("search_placeholder", lang)}</label>
            <Input data-testid="profile-search-input" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} className="bg-white/5 border-white/10 mt-1" />
          </div>
          <div className="min-w-[140px]">
            <label className="text-xs text-slate-400">{t("city", lang)}</label>
            <Input data-testid="profile-city-filter-input" value={filters.city} onChange={e => setFilters({ ...filters, city: e.target.value })} className="bg-white/5 border-white/10 mt-1" />
          </div>
          <div className="min-w-[140px]">
            <label className="text-xs text-slate-400">{t("country", lang)}</label>
            <Input data-testid="profile-country-filter-input" value={filters.country} onChange={e => setFilters({ ...filters, country: e.target.value })} className="bg-white/5 border-white/10 mt-1" />
          </div>
          <div className="min-w-[120px]">
            <label className="text-xs text-slate-400">{t("gender", lang)}</label>
            <Select value={filters.gender} onValueChange={v => setFilters({ ...filters, gender: v })}>
              <SelectTrigger data-testid="profile-gender-filter-select" className="bg-white/5 border-white/10 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#161320] border-white/10 text-white">
                <SelectItem value="all">{t("all", lang)}</SelectItem>
                <SelectItem value="female">{t("female", lang)}</SelectItem>
                <SelectItem value="male">{t("male", lang)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[100px]">
            <label className="text-xs text-slate-400">Min {t("age", lang)}</label>
            <Input data-testid="profile-min-age-input" type="number" min="18" max="99" value={filters.min_age} onChange={e => setFilters({ ...filters, min_age: parseInt(e.target.value||18) })} className="bg-white/5 border-white/10 mt-1" />
          </div>
          <div className="min-w-[100px]">
            <label className="text-xs text-slate-400">Max {t("age", lang)}</label>
            <Input data-testid="profile-max-age-input" type="number" min="18" max="99" value={filters.max_age} onChange={e => setFilters({ ...filters, max_age: parseInt(e.target.value||99) })} className="bg-white/5 border-white/10 mt-1" />
          </div>
          <Button data-testid="profile-search-submit-button" onClick={load} className="rose-btn text-white border-0"><SlidersHorizontal size={14} className="me-1"/> {t("filters", lang)}</Button>
          <Button data-testid="profile-more-filters-toggle" onClick={() => setShowMore(!showMore)} variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10"><ChevronDown size={14} className={`me-1 transition-transform ${showMore ? "rotate-180" : ""}`}/> {t("more_filters", lang)}</Button>
          {quota && !quota.premium && (
            <button data-testid="likes-quota-badge" onClick={() => nav("/wallet?premium=1")} className={`ms-auto px-3 py-2 rounded-full text-xs border font-mono-num ${quota.remaining === 0 ? "bg-rose-500/15 border-rose-500/40 text-rose-300" : "bg-white/5 border-white/10 text-slate-300"}`}>
              💗 {t("likes_left", lang).replace("{a}", quota.used).replace("{b}", quota.limit)}
            </button>
          )}
        </div>
        {showMore && (
          <div className="glass rounded-2xl p-4 mb-6 flex flex-wrap gap-3 items-end float-in" data-testid="profile-more-filters-panel">
            <FilterSelect testid="filter-intent-select" field="relationship_intent" label={t("relationship_intent", lang)} value={filters.intent} options={INTENTS} onChange={v => setFilters({ ...filters, intent: v })} lang={lang} />
            <FilterSelect testid="filter-kids-select" field="kids" label={t("kids", lang)} value={filters.kids} options={KIDS} onChange={v => setFilters({ ...filters, kids: v })} lang={lang} />
            <FilterSelect testid="filter-smoking-select" field="smoking" label={t("smoking", lang)} value={filters.smoking} options={HABITS} onChange={v => setFilters({ ...filters, smoking: v })} lang={lang} />
            <FilterSelect testid="filter-religion-select" field="religion" label={t("religion", lang)} value={filters.religion} options={RELIGIONS.filter(r => r !== "prefer_not")} onChange={v => setFilters({ ...filters, religion: v })} lang={lang} />
            <div className="min-w-[100px]">
              <label className="text-xs text-slate-400">{t("height", lang)} · {t("min", lang)}</label>
              <Input data-testid="filter-min-height-input" type="number" min="100" max="250" value={filters.min_height} onChange={e => setFilters({ ...filters, min_height: e.target.value })} className="bg-white/5 border-white/10 mt-1" />
            </div>
            <div className="min-w-[100px]">
              <label className="text-xs text-slate-400">{t("height", lang)} · {t("max", lang)}</label>
              <Input data-testid="filter-max-height-input" type="number" min="100" max="250" value={filters.max_height} onChange={e => setFilters({ ...filters, max_height: e.target.value })} className="bg-white/5 border-white/10 mt-1" />
            </div>
            <Button data-testid="profile-filters-reset-button" variant="ghost" onClick={() => setFilters({ ...filters, ...EXTRA_DEFAULT })} className="text-slate-400 hover:text-white">{t("reset", lang)}</Button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="rounded-3xl bg-white/5 h-96 animate-pulse" />)}
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-24 text-slate-400" data-testid="browse-empty">{t("no_profiles", lang)}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {profiles.map(p => <ProfileCard key={p.id} p={p} onOpen={(p) => nav(`/profile/${p.id}`)} onLike={like} onGift={(p)=>open("gift",p)} onVideo={(p)=>open("video",p)} onDate={(p)=>open("date",p)} onMessage={()=>nav("/chats")} />)}
          </div>
        )}
      </div>

      <GiftModal open={modal==="gift"} onOpenChange={(v)=>!v&&setModal(null)} target={target}/>
      <VideoCallModal open={modal==="video"} onOpenChange={(v)=>!v&&setModal(null)} target={target}/>
      <DateBookingModal open={modal==="date"} onOpenChange={(v)=>!v&&setModal(null)} target={target}/>
    </div>
  );
}
