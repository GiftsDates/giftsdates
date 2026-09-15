import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarHeart, MapPin, Clock, Coins, ShieldAlert, Flag, Camera, Car, Check, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { api, fileUrl } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";
import AddressPicker, { MapsLink } from "../components/AddressPicker";
import LegacyDates from "./Dates";

const FALLBACK = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80";
const TERMINAL = ["COMPLETED", "COMPLETED_AUTO", "CANCELLED", "CANCELLED_TRANSPORTATION", "REFUNDED"];

function Countdown({ to, label }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return <span className="font-mono-num text-amber-300">{label} {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(ss).padStart(2, "0")}</span>;
}

const REASONS = ["No-show", "Cancelled last minute", "Misleading profile", "Rude or disrespectful", "Made me uncomfortable", "Harassment", "Asked for money", "Suspicious / scam", "Unsafe situation", "Other"];

function DateCard({ d, reload }) {
  const { lang } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [choose, setChoose] = useState("");
  const [loc, setLoc] = useState({});
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState(""); const [time, setTime] = useState("19:00");
  const [taxi, setTaxi] = useState(""); const [pickup, setPickup] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [reasons, setReasons] = useState([]); const [details, setDetails] = useState(""); const [evidence, setEvidence] = useState("");
  const [showVerify, setShowVerify] = useState(false); const [vfile, setVfile] = useState(null); const [vok, setVok] = useState(false);
  const isInv = d.role === "inviter";
  const w = d.windows || {};
  const nowMs = Date.now();
  const reportOpen = w.report_open && nowMs >= new Date(w.report_open).getTime() && nowMs <= new Date(w.report_close).getTime();
  const canVerify = w.verify_at && nowMs >= new Date(w.verify_at).getTime();

  const act = async (fn) => { setBusy(true); try { await fn(); await reload(); } catch (e) { toast.error(e.response?.data?.detail || t("failed", lang)); } finally { setBusy(false); } };
  const post = (path, body) => api.post(`/invites/${d.id}${path}`, body);

  const submitReport = () => act(async () => {
    if (details.trim().length < 10) { throw { response: { data: { detail: "Please describe what happened (min 10 chars)" } } }; }
    await post("/report", { reasons, details, evidence }); toast.success("Report submitted"); setShowReport(false);
  });
  const submitVerify = () => act(async () => {
    if (!vfile || !vok) { throw { response: { data: { detail: "Photo and confirmation required" } } }; }
    const fd = new FormData(); fd.append("file", vfile); fd.append("confirm", "true"); fd.append("note", "");
    await api.post(`/invites/${d.id}/verify`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    toast.success("Sent for verification"); setShowVerify(false);
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-[#161320] p-4" data-testid={`date-card-${d.id}`}>
      <div className="flex gap-3">
        <img src={d.other?.photo ? fileUrl(d.other.photo) : FALLBACK} onError={e => e.currentTarget.src = FALLBACK} alt=""
          onClick={() => nav(`/profile/${d.other?.id}`)} data-testid={`date-card-photo-${d.id}`}
          className="w-16 h-16 rounded-xl object-cover cursor-pointer flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-serif-luxe text-lg truncate">{d.other?.name}{d.other?.age ? `, ${d.other.age}` : ""}</h4>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300 uppercase tracking-wide" data-testid={`date-status-${d.id}`}>{d.status_label}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5" data-testid={`date-next-${d.id}`}>➜ {d.next_step}</p>
          {d.chosen_idea && <div className="text-sm text-rose-200 mt-1"><CalendarHeart size={13} className="inline me-1" />{d.chosen_idea.name}</div>}
          {!d.chosen_idea && d.options && <div className="text-xs text-slate-300 mt-1">Options: {d.options.map(o => o.name).join(" · ")}</div>}
          {d.location?.venue && <div className="text-xs text-slate-400 mt-1"><MapPin size={12} className="inline me-1" />{[d.location.venue, d.location.address, d.location.city].filter(Boolean).join(", ")} <MapsLink loc={d.location} testid={`date-maps-${d.id}`} /></div>}
          {d.location?.scheduled_start && <div className="text-xs text-slate-400"><Clock size={12} className="inline me-1" />{new Date(d.location.scheduled_start).toLocaleString()} (3h)</div>}
          {d.transportation?.status && <div className="text-xs text-sky-300 mt-0.5"><Car size={12} className="inline me-1" />{d.transportation.type}: {d.transportation.status}{d.transportation.taxi_amount ? ` · 🪙${d.transportation.taxi_amount}` : ""}{d.transportation.pickup_address ? ` · ${d.transportation.pickup_address}` : ""}</div>}
          <div className="text-xs text-amber-300/90 mt-0.5"><Coins size={12} className="inline me-1" />🪙 {d.total_hold || d.coins}{d.gift ? ` + gift ${d.gift.icon || ""}` : ""}</div>
          {reportOpen && <div className="text-[11px] mt-1"><Countdown to={w.report_close} label="Report window closes in" /></div>}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {d.status === "INVITATION_SENT" && !isInv && (
          <div className="w-full space-y-2" data-testid={`date-choose-${d.id}`}>
            <div className="flex flex-wrap gap-2">{d.options.map(o => (
              <button key={o.idea_id} data-testid={`date-choose-opt-${o.idea_id}`} onClick={() => setChoose(o.idea_id)}
                className={`text-xs px-3 py-1.5 rounded-full border ${choose === o.idea_id ? "bg-rose-500/20 border-rose-500/50 text-rose-200" : "bg-white/5 border-white/10 text-slate-300"}`}>{o.name}</button>))}</div>
            <Button data-testid={`date-choose-confirm-${d.id}`} disabled={busy || !choose} onClick={() => act(() => post("/choose", { idea_id: choose }))} className="rose-btn text-white border-0 h-9">Confirm Date Choice</Button>
          </div>
        )}
        {d.status === "DATE_ACTIVITY_SELECTED" && isInv && (
          <div className="w-full space-y-2 rounded-lg border border-white/10 p-2" data-testid={`date-location-${d.id}`}>
            <div className="text-xs text-amber-200">Choose Meeting Location</div>
            <Input data-testid={`date-venue-${d.id}`} value={venue} onChange={e => setVenue(e.target.value)} placeholder="Venue" className="bg-white/5 border-white/10 h-9" />
            <AddressPicker value={loc} onChange={setLoc} />
            <div className="flex gap-2"><Input data-testid={`date-date-${d.id}`} type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-white/5 border-white/10 h-9" />
              <Input data-testid={`date-time-${d.id}`} type="time" value={time} onChange={e => setTime(e.target.value)} className="bg-white/5 border-white/10 h-9" /></div>
            <Button data-testid={`date-location-submit-${d.id}`} disabled={busy || !venue || !date} onClick={() => act(() => post("/location", { venue, address: loc.address, city: loc.city, country: loc.country, postal_code: loc.postal_code, lat: loc.lat, lng: loc.lng, scheduled_start: new Date(`${date}T${time}:00`).toISOString() }))} className="rose-btn text-white border-0 h-9">Propose Location</Button>
          </div>
        )}
        {d.status === "LOCATION_PROPOSED" && !isInv && (
          <div className="w-full space-y-2" data-testid={`date-confirm-loc-${d.id}`}>
            <div className="flex gap-2">
              <Button data-testid={`date-confirm-location-${d.id}`} disabled={busy} onClick={() => act(() => post("/location/confirm"))} className="rose-btn text-white border-0 h-9"><Check size={14} className="me-1" />Confirm Location</Button>
            </div>
            <div className="flex gap-2 items-center"><Input data-testid={`date-taxi-amount-${d.id}`} type="number" min="1" value={taxi} onChange={e => setTaxi(e.target.value)} placeholder="Taxi amount 🪙" className="bg-white/5 border-white/10 h-9 max-w-[160px]" />
              <Button data-testid={`date-taxi-request-${d.id}`} disabled={busy || !taxi} onClick={() => act(() => post("/taxi/request", { amount: parseInt(taxi) }))} variant="outline" className="h-9 bg-white/5 border-white/15"><Car size={14} className="me-1" />Request Taxi</Button></div>
          </div>
        )}
        {d.status === "TAXI_REQUESTED" && isInv && (
          <div className="w-full flex flex-wrap gap-2" data-testid={`date-transport-${d.id}`}>
            <Button data-testid={`date-taxi-confirm-${d.id}`} disabled={busy} onClick={() => act(() => post("/taxi/confirm"))} className="rose-btn text-white border-0 h-9">Confirm &amp; Pay Taxi 🪙{d.transportation?.taxi_amount}</Button>
            <Button data-testid={`date-pickup-offer-${d.id}`} disabled={busy} onClick={() => act(() => post("/pickup/offer"))} variant="outline" className="h-9 bg-white/5 border-white/15">Offer Pickup</Button>
            <Button data-testid={`date-transport-refuse-${d.id}`} disabled={busy} onClick={() => act(() => post("/transport/refuse"))} variant="outline" className="h-9 bg-rose-500/10 border-rose-500/40 text-rose-300">Refuse</Button>
          </div>
        )}
        {d.status === "PICKUP_ADDRESS_PENDING" && !isInv && (
          <div className="w-full flex gap-2 items-center" data-testid={`date-pickup-addr-${d.id}`}>
            <Input data-testid={`date-pickup-input-${d.id}`} value={pickup} onChange={e => setPickup(e.target.value)} placeholder="Your pickup address" className="bg-white/5 border-white/10 h-9" />
            <Button data-testid={`date-pickup-submit-${d.id}`} disabled={busy || !pickup} onClick={() => act(() => post("/pickup/address", { pickup_address: pickup }))} className="rose-btn text-white border-0 h-9">Send</Button>
          </div>
        )}
        {d.status === "PICKUP_ADDRESS_SELECTED" && isInv && (
          <div className="w-full flex flex-wrap gap-2">
            <Button data-testid={`date-pickup-confirm-${d.id}`} disabled={busy} onClick={() => act(() => post("/pickup/confirm"))} className="rose-btn text-white border-0 h-9">Confirm Pickup</Button>
            <Button data-testid={`date-pay-taxi-instead-${d.id}`} disabled={busy} onClick={() => act(() => post("/taxi/confirm"))} variant="outline" className="h-9 bg-white/5 border-white/15">Pay Taxi Instead</Button>
          </div>
        )}
        {!TERMINAL.includes(d.status) && d.status !== "PHOTO_VERIFICATION_PENDING" && (
          <Button data-testid={`date-cancel-${d.id}`} disabled={busy} onClick={() => act(() => post("/cancel"))} variant="ghost" className="h-9 text-slate-400 hover:text-rose-300">Cancel</Button>
        )}
        {reportOpen && <Button data-testid={`date-report-${d.id}`} onClick={() => setShowReport(v => !v)} variant="outline" className="h-9 bg-rose-500/10 border-rose-500/40 text-rose-300"><Flag size={14} className="me-1" />Report this date</Button>}
        {canVerify && ["DATE_CONFIRMED", "DATE_COMPLETED_PENDING_VERIFICATION"].includes(d.status) &&
          <Button data-testid={`date-verify-${d.id}`} onClick={() => setShowVerify(v => !v)} variant="outline" className="h-9 bg-emerald-500/10 border-emerald-500/40 text-emerald-300"><Camera size={14} className="me-1" />Send Photo for Confirmation</Button>}
      </div>

      {showReport && (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 space-y-2" data-testid={`report-form-${d.id}`}>
          <div className="text-xs font-semibold text-rose-200 flex items-center gap-1"><ShieldAlert size={13} />Report this date — what went wrong?</div>
          <div className="flex flex-wrap gap-1.5">{REASONS.map(r => (
            <button key={r} onClick={() => setReasons(s => s.includes(r) ? s.filter(x => x !== r) : [...s, r])}
              className={`text-[11px] px-2 py-1 rounded-full border ${reasons.includes(r) ? "bg-rose-500/20 border-rose-500/50 text-rose-200" : "bg-white/5 border-white/10 text-slate-400"}`}>{r}</button>))}</div>
          <textarea data-testid={`report-details-${d.id}`} value={details} onChange={e => setDetails(e.target.value)} placeholder="Tell us what happened..." className="w-full bg-white/5 border border-white/10 rounded-md p-2 text-sm text-slate-200 min-h-[70px]" />
          <Input data-testid={`report-evidence-${d.id}`} value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Evidence link (optional)" className="bg-white/5 border-white/10 h-9" />
          <Button data-testid={`report-submit-${d.id}`} disabled={busy} onClick={submitReport} className="rose-btn text-white border-0 h-9">Submit Report</Button>
        </div>
      )}
      {showVerify && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2" data-testid={`verify-form-${d.id}`}>
          <div className="text-xs text-emerald-200">Photo confirmation is available 24h after the scheduled start time.</div>
          <input data-testid={`verify-file-${d.id}`} type="file" accept="image/*" onChange={e => setVfile(e.target.files[0])} className="text-xs text-slate-300" />
          <label className="flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" checked={vok} onChange={e => setVok(e.target.checked)} className="mt-0.5" />I confirm that this date took place and that the information submitted is accurate.</label>
          <Button data-testid={`verify-submit-${d.id}`} disabled={busy} onClick={submitVerify} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0 h-9">Send for Confirmation</Button>
        </div>
      )}
    </div>
  );
}

export default function InviteDates() {
  const { lang } = useApp();
  const [tab, setTab] = useState("invites");
  const [data, setData] = useState({ incoming: [], outgoing: [] });
  const load = useCallback(async () => { try { const r = await api.get("/invites"); setData(r.data); } catch {} }, []);
  useEffect(() => { load(); const id = setInterval(load, 20000); return () => clearInterval(id); }, [load]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-serif-luxe text-3xl mb-4 flex items-center gap-2"><CalendarHeart className="text-rose-400" /> {t("dates", lang)}</h1>
      <div className="flex gap-2 mb-5">
        <button data-testid="tab-invites" onClick={() => setTab("invites")} className={`text-sm px-4 py-2 rounded-full border ${tab === "invites" ? "bg-rose-500/20 border-rose-500/50 text-rose-200" : "bg-white/5 border-white/10 text-slate-300"}`}>Invitations</button>
        <button data-testid="tab-vip" onClick={() => setTab("vip")} className={`text-sm px-4 py-2 rounded-full border ${tab === "vip" ? "bg-amber-500/20 border-amber-500/50 text-amber-200" : "bg-white/5 border-white/10 text-slate-300"}`}>VIP bookings</button>
      </div>

      {tab === "vip" ? <LegacyDates embedded /> : (
        <div className="grid md:grid-cols-2 gap-6">
          <section data-testid="incoming-dates">
            <h2 className="text-lg font-semibold mb-3 text-slate-200">Incoming Dates</h2>
            <div className="space-y-3">
              {data.incoming.map(d => <DateCard key={d.id} d={d} reload={load} />)}
              {!data.incoming.length && <p className="text-sm text-slate-500">No incoming invitations.</p>}
            </div>
          </section>
          <section data-testid="outgoing-dates">
            <h2 className="text-lg font-semibold mb-3 text-slate-200">Outgoing Dates</h2>
            <div className="space-y-3">
              {data.outgoing.map(d => <DateCard key={d.id} d={d} reload={load} />)}
              {!data.outgoing.length && <p className="text-sm text-slate-500">No sent invitations yet.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
