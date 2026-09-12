import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";
import { Heart } from "lucide-react";

const FALLBACKS = [
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?crop=entropy&cs=srgb&fm=jpg&q=85",
  "https://images.unsplash.com/photo-1532074205216-d0e1f4b87368?crop=entropy&cs=srgb&fm=jpg&q=85",
  "https://images.unsplash.com/photo-1607746882042-944635dfe10e?crop=entropy&cs=srgb&fm=jpg&q=85",
  "https://images.unsplash.com/photo-1539125530496-3ca408f9c2d9?crop=entropy&cs=srgb&fm=jpg&q=85",
];
function hash(s){let h=0;for(let i=0;i<(s||"").length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return h;}

export default function Matches() {
  const { lang } = useApp();
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/matches").then(r => setItems(r.data)); }, []);
  return (
    <div className="aurora-bg min-h-[calc(100vh-4rem)]">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="font-serif-luxe text-4xl mb-8 flex items-center gap-3"><Heart className="fill-rose-500 text-rose-500"/> {t("matches", lang)}</h1>
        {items.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center text-slate-400">{t("like_to_match", lang)}</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(m => (
              <button key={m.conversation_id} data-testid={`match-open-${m.user.id}`} onClick={() => nav(`/chats?c=${m.conversation_id}`)} className="glass rounded-2xl p-4 flex items-center gap-4 card-lift text-left">
                <img src={m.user.photos?.[0] || FALLBACKS[Math.abs(hash(m.user.id))%FALLBACKS.length]} className="w-16 h-16 rounded-full object-cover" alt=""/>
                <div>
                  <div className="font-serif-luxe text-xl">{m.user.name}, {m.user.age}</div>
                  <div className="text-xs text-slate-400">{m.user.city}, {m.user.country}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
