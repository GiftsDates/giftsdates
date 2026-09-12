import React from "react";
import { Calendar } from "./ui/calendar";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";

export const toKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };

export default function AvailabilityCalendar({ value = [], onChange }) {
  const { lang } = useApp();
  const selected = value.map(fromKey);
  return (
    <div className="glass rounded-2xl p-6 mb-6" data-testid="profile-availability-section">
      <h2 className="font-serif-luxe text-2xl">{t("availability", lang)}</h2>
      <p className="text-xs text-slate-400 mt-1 mb-3">{t("availability_hint", lang)}</p>
      <div className="flex flex-wrap gap-6 items-start">
        <div data-testid="profile-availability-calendar" className="rounded-xl border border-white/10 bg-white/5">
          <Calendar mode="multiple" selected={selected} onSelect={(days) => onChange((days || []).map(toKey))} disabled={{ before: new Date() }}
            classNames={{ day_selected: "bg-rose-500 text-white hover:bg-rose-500 focus:bg-rose-500" }} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs text-slate-400 mb-2">{t("availability", lang)} · <b className="text-white" data-testid="profile-availability-count">{value.length}</b></div>
          <div className="flex flex-wrap gap-1.5">
            {value.slice(0, 30).map(k => <span key={k} className="px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-xs font-mono-num">{k}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}
