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
import { Search, SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Browse() {
  const { lang } = useApp();
  const nav = useNavigate();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: "", city: "", country: "", gender: "all", min_age: 18, max_age: 60 });
  const [target, setTarget] = useState(null);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...filters };
      if (params.gender === "all") delete params.gender;
      Object.keys(params).forEach(k => (params[k] === "" || params[k] == null) && delete params[k]);
      const { data } = await api.get("/profiles", { params });
      setProfiles(data);
    } catch (e) { toast.error("Failed to load"); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const like = async (p) => {
    try {
      const { data } = await api.post("/likes", { target_id: p.id });
      if (data.matched) toast.success(`💘 ${t("match", lang)} · ${p.name}`);
      else toast.success(`💗 ${t("like", lang)}: ${p.name}`);
    } catch (e) { toast.error("Failed"); }
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
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="rounded-3xl bg-white/5 h-96 animate-pulse" />)}
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-24 text-slate-400" data-testid="browse-empty">{t("no_profiles", lang)}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {profiles.map(p => <ProfileCard key={p.id} p={p} onLike={like} onGift={(p)=>open("gift",p)} onVideo={(p)=>open("video",p)} onDate={(p)=>open("date",p)} onMessage={()=>nav("/chats")} />)}
          </div>
        )}
      </div>

      <GiftModal open={modal==="gift"} onOpenChange={(v)=>!v&&setModal(null)} target={target}/>
      <VideoCallModal open={modal==="video"} onOpenChange={(v)=>!v&&setModal(null)} target={target}/>
      <DateBookingModal open={modal==="date"} onOpenChange={(v)=>!v&&setModal(null)} target={target}/>
    </div>
  );
}
