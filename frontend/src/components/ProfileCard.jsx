import React from "react";
import { Heart, Gift, Video, CalendarHeart, MapPin, BadgeCheck } from "lucide-react";
import { Button } from "./ui/button";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";

const FALLBACKS = [
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?crop=entropy&cs=srgb&fm=jpg&q=85",
  "https://images.unsplash.com/photo-1532074205216-d0e1f4b87368?crop=entropy&cs=srgb&fm=jpg&q=85",
  "https://images.unsplash.com/photo-1607746882042-944635dfe10e?crop=entropy&cs=srgb&fm=jpg&q=85",
  "https://images.unsplash.com/photo-1539125530496-3ca408f9c2d9?crop=entropy&cs=srgb&fm=jpg&q=85",
];

export default function ProfileCard({ p, onLike, onGift, onVideo, onDate, onMessage }) {
  const { lang } = useApp();
  const img = p.photos?.[0] || FALLBACKS[Math.abs(hash(p.id)) % FALLBACKS.length];
  return (
    <div className="group relative rounded-3xl overflow-hidden border border-white/10 card-lift bg-[#161320]">
      <div className="aspect-[3/4] relative">
        <img src={img} alt={p.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0D0B12] via-[#0D0B12]/40 to-transparent" />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="pulse-dot w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="text-xs text-emerald-200 font-mono uppercase tracking-widest">online</span>
        </div>
        {p.verified && <BadgeCheck size={20} className="absolute top-3 right-3 text-amber-300" />}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="font-serif-luxe text-2xl leading-tight">{p.name}, {p.age}</h3>
              <p className="text-xs text-slate-300 flex items-center gap-1 mt-0.5"><MapPin size={11} /> {p.city}, {p.country}</p>
            </div>
          </div>
          {p.bio && <p className="mt-2 text-xs text-slate-400 line-clamp-2">{p.bio}</p>}
        </div>
      </div>
      <div className="p-3 flex items-center gap-1.5 bg-[#161320]/80 backdrop-blur">
        <Button data-testid={`profile-card-like-button-${p.id}`} onClick={() => onLike(p)} size="icon" className="rose-btn text-white border-0 rounded-full h-10 w-10 flex-shrink-0" title={t("like", lang)}><Heart size={16} className="fill-white" /></Button>
        <Button data-testid={`profile-card-gift-button-${p.id}`} onClick={() => onGift(p)} size="icon" variant="outline" className="rounded-full h-10 w-10 flex-shrink-0 bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/20 text-amber-300" title={t("gift", lang)}><Gift size={16} /></Button>
        <Button data-testid={`profile-card-videocall-button-${p.id}`} onClick={() => onVideo(p)} size="icon" variant="outline" className="rounded-full h-10 w-10 flex-shrink-0 bg-violet-500/10 border-violet-500/40 hover:bg-violet-500/20 text-violet-300" title={t("video_call", lang)}><Video size={16} /></Button>
        <Button data-testid={`profile-card-date-button-${p.id}`} onClick={() => onDate(p)} size="icon" variant="outline" className="rounded-full h-10 w-10 flex-shrink-0 bg-white/5 border-white/15 hover:bg-white/10" title={t("book_date", lang)}><CalendarHeart size={16} /></Button>
      </div>
    </div>
  );
}
function hash(s) { let h = 0; for (let i = 0; i < (s||"").length; i++) h = ((h<<5)-h + s.charCodeAt(i))|0; return h; }
