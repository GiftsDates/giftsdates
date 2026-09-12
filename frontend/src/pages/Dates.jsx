import React, { useEffect, useState, useRef } from "react";
import { api, fileUrl } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { CalendarHeart, Camera, Clock, Check, X } from "lucide-react";

const STATUS_MAP = { escrow: "status_escrow", accepted: "status_accepted", confirmed: "status_confirmed", released: "status_released", cancelled: "status_cancelled", declined: "status_declined" };
const STATUS_COLOR = { escrow: "bg-amber-500/15 text-amber-300 border-amber-500/30", accepted: "bg-sky-500/15 text-sky-300 border-sky-500/30", confirmed: "bg-violet-500/15 text-violet-300 border-violet-500/30", released: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", cancelled: "bg-red-500/15 text-red-300 border-red-500/30", declined: "bg-red-500/15 text-red-300 border-red-500/30" };

export default function Dates() {
  const { lang, refreshUser } = useApp();
  const [data, setData] = useState({ outgoing: [], incoming: [] });
  const [busyId, setBusyId] = useState(null);
  const inputRef = useRef();
  const uploadingFor = useRef(null);

  const load = () => api.get("/dates").then(r => setData(r.data));
  useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv); }, []);

  const cancel = async (id) => {
    setBusyId(id);
    try { await api.post(`/dates/cancel/${id}`); await refreshUser(); await load(); toast.success(t("date_cancelled", lang)); }
    catch (e) { toast.error(e.response?.data?.detail || t("failed", lang)); }
    finally { setBusyId(null); }
  };

  const respond = async (id, accept) => {
    setBusyId(id);
    try { await api.post(`/dates/respond/${id}?accept=${accept}`); await refreshUser(); await load(); toast.success(t(accept ? "date_accepted_toast" : "date_declined_toast", lang)); }
    catch (e) { toast.error(e.response?.data?.detail || t("failed", lang)); }
    finally { setBusyId(null); }
  };

  const startUpload = (bid) => { uploadingFor.current = bid; inputRef.current?.click(); };
  const handleFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const bid = uploadingFor.current;
    setBusyId(bid);
    try {
      const fd = new FormData(); fd.append("file", f);
      const up = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await api.post("/dates/confirm", { booking_id: bid, photo_url: up.data.path });
      await load();
      toast.success(t("photo_uploaded_unlock", lang));
    } catch (err) { toast.error(t("upload_failed", lang)); }
    finally { setBusyId(null); e.target.value = ""; }
  };

  const Row = ({ b, isIncoming }) => (
    <div className="glass rounded-2xl p-4 flex flex-col sm:flex-row gap-3 sm:items-center card-lift" data-testid={`date-row-${b.id}`}>
      {b.photo_url && <img src={fileUrl(b.photo_url)} alt="" className="w-full sm:w-24 h-24 rounded-xl object-cover"/>}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1"><CalendarHeart size={14} className="text-rose-400"/><span className="font-serif-luxe text-lg">{b.venue}</span></div>
        <div className="text-xs text-slate-400 flex items-center gap-2"><Clock size={11}/> {new Date(b.scheduled_at).toLocaleString()} · {b.city}</div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[b.status]}`}>{t(STATUS_MAP[b.status], lang)}</span>
          <span className="text-xs text-amber-300 font-mono-num">🪙 {b.coins}</span>
          {b.release_at && b.status === "confirmed" && <span className="text-xs text-slate-500">→ {new Date(b.release_at).toLocaleString()}</span>}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {isIncoming && b.status === "escrow" && (
          <>
            <Button data-testid={`date-accept-btn-${b.id}`} disabled={busyId===b.id} onClick={() => respond(b.id, true)} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0"><Check size={14} className="me-1"/> {t("accept", lang)}</Button>
            <Button data-testid={`date-decline-btn-${b.id}`} disabled={busyId===b.id} onClick={() => respond(b.id, false)} variant="outline" className="bg-rose-500/10 border-rose-500/40 text-rose-300 hover:bg-rose-500/20"><X size={14} className="me-1"/> {t("decline", lang)}</Button>
          </>
        )}
        {isIncoming && b.status === "accepted" && (
          <Button data-testid={`date-confirm-btn-${b.id}`} disabled={busyId===b.id} onClick={() => startUpload(b.id)} className="rose-btn text-white border-0"><Camera size={14} className="me-1"/> {t("confirm_photo", lang)}</Button>
        )}
        {!isIncoming && (b.status === "escrow" || b.status === "accepted") && (
          <Button data-testid={`date-cancel-btn-${b.id}`} disabled={busyId===b.id} onClick={() => cancel(b.id)} variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10">{t("cancel", lang)}</Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="aurora-bg min-h-[calc(100vh-4rem)]">
      <input ref={inputRef} data-testid="photo-verification-upload-input" type="file" accept="image/*" onChange={handleFile} className="hidden"/>
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        <h1 className="font-serif-luxe text-4xl">{t("dates", lang)}</h1>
        <p className="text-xs text-slate-400 -mt-4">{t("photo_hint", lang)}</p>

        <section>
          <h2 className="text-sm font-mono uppercase tracking-widest text-rose-400 mb-3">{t("incoming_dates", lang)}</h2>
          {data.incoming.length === 0 ? <div className="glass rounded-xl p-6 text-sm text-slate-500">{t("none", lang)}</div> : <div className="space-y-3">{data.incoming.map(b => <Row key={b.id} b={b} isIncoming/>)}</div>}
        </section>
        <section>
          <h2 className="text-sm font-mono uppercase tracking-widest text-violet-400 mb-3">{t("outgoing_dates", lang)}</h2>
          {data.outgoing.length === 0 ? <div className="glass rounded-xl p-6 text-sm text-slate-500">{t("none", lang)}</div> : <div className="space-y-3">{data.outgoing.map(b => <Row key={b.id} b={b}/>)}</div>}
        </section>
      </div>
    </div>
  );
}
