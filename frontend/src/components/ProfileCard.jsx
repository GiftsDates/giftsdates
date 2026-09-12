import React from "react";
import { Heart, Gift, Video, CalendarHeart, MapPin, BadgeCheck, Crown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";
import { fileUrl } from "../lib/api";
import { optLabel } from "./ProfileDetailsForm";

const FALLBACKS = [
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?crop=entropy&cs=srgb&fm=jpg&q=85",
  "https://images.unsplash.com/photo-1532074205216-d0e1f4b87368?crop=entropy&cs=srgb&fm=jpg&q=85",
  "https://images.unsplash.com/photo-1607746882042-944635dfe10e?crop=entropy&cs=srgb&fm=jpg&q=85",
  "https://images.unsplash.com/photo-1539125530496-3ca408f9c2d9?crop=entropy&cs=srgb&fm=jpg&q=85",
];

export default function ProfileCard({ p, onLike, onGift, onVideo, onDate, onMessage }) {
  const { lang } = useApp();
  const [idx, setIdx] = React.useState(0);
  const photos = p.photos?.length ? p.photos.map(fileUrl) : [FALLBACKS[Math.abs(hash(p.id)) % FALLBACKS.length]];
  const img = photos[Math.min(idx, photos.length - 1)];
  const step = (d) => setIdx((idx + d + photos.length) % photos.length);
  return (
    <div className={`group relative rounded-3xl overflow-hidden border card-lift bg-[#161320] ${p.is_premium ? "border-amber-400/50 shadow-[0_0_30px_-8px_rgba(251,191,36,0.45)]" : "border-white/10"}`} data-testid={`profile-card-${p.id}`}>
      <div className="aspect-[3/4] relative">
        <img src={img} alt={p.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0D0B12] via-[#0D0B12]/40 to-transparent" />
        {photos.length > 1 && (
          <>
            <button data-testid={`profile-card-prev-photo-${p.id}`} onClick={() => step(-1)} className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"><ChevronLeft size={16} /></button>
            <button data-testid={`profile-card-next-photo-${p.id}`} onClick={() => step(1)} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"><ChevronRight size={16} /></button>
            <div className="absolute top-2 inset-x-3 flex gap-1">
              {photos.map((_, i) => <span key={i} className={`h-0.5 flex-1 rounded-full ${i === idx ? "bg-white" : "bg-white/30"}`} />)}
            </div>
          </>
        )}
        <div className="absolute top-4 left-3 flex items-center gap-2">
          <span className="pulse-dot w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="text-xs text-emerald-200 font-mono uppercase tracking-widest">online</span>
        </div>
        <div className="absolute top-4 right-3 flex items-center gap-1.5">
          {p.is_premium && <span data-testid={`profile-card-premium-badge-${p.id}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/90 text-black text-[10px] font-semibold uppercase tracking-wider"><Crown size={10} /> {t("premium", lang)}</span>}
          {p.verified && <BadgeCheck size={20} className="text-amber-300" />}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="font-serif-luxe text-2xl leading-tight">{p.name}, {p.age}</h3>
              <p className="text-xs text-slate-300 flex items-center gap-1 mt-0.5"><MapPin size={11} /> {p.city}, {p.country}</p>
            </div>
          </div>
          {p.bio && <p className="mt-2 text-xs text-slate-400 line-clamp-2">{p.bio}</p>}
          {(p.relationship_intent || p.height || p.job_title) && (
            <div className="mt-2 flex flex-wrap gap-1" data-testid={`profile-card-details-${p.id}`}>
              {p.relationship_intent && <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-[10px] text-rose-200">{optLabel("relationship_intent", p.relationship_intent, lang)}</span>}
              {p.height && <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-[10px] text-slate-200">{p.height} cm</span>}
              {p.job_title && <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-[10px] text-slate-200 truncate max-w-[120px]">{p.job_title}</span>}
            </div>
          )}
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
