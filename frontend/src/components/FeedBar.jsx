import React, { useEffect, useRef, useState } from "react";
import { Plus, X, Video as VideoIcon, Trash2, Play } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { api, fileUrl } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";

const FB_W = "https://images.unsplash.com/photo-1581841064838-a470c740e8ee?crop=entropy&cs=srgb&fm=jpg&q=85&w=200";
const FB_M = "https://images.unsplash.com/photo-1545996124-0501ebae84d0?crop=entropy&cs=srgb&fm=jpg&q=85&w=200";
const avatarUrl = (it) => (it.user_avatar ? fileUrl(it.user_avatar) : (String(it.gender || "").toLowerCase().startsWith("m") ? FB_M : FB_W));

const Circle = ({ it, onClick }) => (
  <button data-testid={`feed-item-${it.id}`} onClick={onClick} className="flex flex-col items-center gap-1.5 shrink-0 w-[76px] group">
    {it.text && (
      <div className="relative max-w-[76px]">
        <div className="px-2 py-1 rounded-lg bg-[#1A0A14] gold-hairline text-[10px] text-amber-100 leading-tight truncate w-[76px] text-center">{it.text}</div>
      </div>
    )}
    <div className={`w-16 h-16 rounded-full p-[2px] ${it.has_video ? "bg-gradient-to-tr from-rose-500 to-red-600" : "bg-gradient-to-tr from-[#D4AF37] to-[#F3E5AB]"}`}>
      <div className="w-full h-full rounded-full overflow-hidden bg-[#1A0A14] relative">
        <img src={avatarUrl(it)} alt="" className="w-full h-full object-cover" />
        {it.has_video && <span className="absolute bottom-0 right-0 bg-red-600 rounded-full p-0.5"><Play size={9} className="text-white fill-white" /></span>}
      </div>
    </div>
    <span className="text-[10px] text-slate-400 truncate w-full text-center">{it.user_name}</span>
  </button>
);

export default function FeedBar() {
  const { user, lang, refreshUser } = useApp();
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [compose, setCompose] = useState(false);
  const [view, setView] = useState(null);
  const [text, setText] = useState("");
  const [videoFile, setVideoFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = () => api.get("/feed").then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const cost = (text.trim() ? 100 : 0) + (videoFile ? 150 : 0);

  const pickVideo = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("video/")) { toast.error(t("feed_not_video", lang)); return; }
    const url = URL.createObjectURL(f);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (v.duration > 15.5) { toast.error(t("feed_video_too_long", lang)); if (fileRef.current) fileRef.current.value = ""; return; }
      setVideoFile(f);
    };
    v.onerror = () => { URL.revokeObjectURL(url); toast.error(t("feed_not_video", lang)); };
    v.src = url;
  };

  const submit = async () => {
    if (!text.trim() && !videoFile) { toast.error(t("feed_empty", lang)); return; }
    if ((user?.coins || 0) < cost) { toast.error(t("feed_insufficient", lang), { action: { label: t("topup", lang), onClick: () => nav("/wallet") } }); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("text", text.trim());
      if (videoFile) fd.append("video", videoFile);
      await api.post("/feed", fd);
      toast.success(t("feed_posted", lang));
      setText(""); setVideoFile(null); if (fileRef.current) fileRef.current.value = "";
      setCompose(false);
      await Promise.all([load(), refreshUser()]);
    } catch (e) {
      const d = e.response?.data?.detail || "";
      if (d === "INSUFFICIENT_COINS") toast.error(t("feed_insufficient", lang), { action: { label: t("topup", lang), onClick: () => nav("/wallet") } });
      else if (d === "VIDEO_TOO_LARGE") toast.error(t("feed_video_large", lang));
      else toast.error(t("failed", lang));
    } finally { setBusy(false); }
  };

  const remove = async (it) => {
    try { await api.delete(`/feed/${it.id}`); toast.success(t("feed_deleted", lang)); setView(null); load(); }
    catch { toast.error(t("failed", lang)); }
  };

  return (
    <div className="glass rounded-2xl p-4 mb-6" data-testid="feed-bar">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif-luxe text-lg gold-text">{t("feed_title", lang)}</h2>
        <span className="text-[11px] text-slate-500">{t("feed_hint", lang)}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        <button data-testid="feed-add-button" onClick={() => setCompose(true)} className="flex flex-col items-center gap-1.5 shrink-0 w-[76px]">
          <div className="w-16 h-16 mt-[22px] rounded-full border-2 border-dashed border-amber-400/50 flex items-center justify-center text-amber-300 hover:bg-white/5 transition-colors"><Plus size={22} /></div>
          <span className="text-[10px] text-slate-400">{t("feed_add", lang)}</span>
        </button>
        {items.map((it) => <Circle key={it.id} it={it} onClick={() => setView(it)} />)}
        {items.length === 0 && <div className="flex items-center text-sm text-slate-500 px-3">{t("feed_empty_list", lang)}</div>}
      </div>

      {/* Composer */}
      <Dialog open={compose} onOpenChange={setCompose}>
        <DialogContent className="bg-[#161018] border-white/10 text-white max-w-md" data-testid="feed-composer">
          <DialogHeader><DialogTitle className="font-serif-luxe text-2xl gold-text">{t("feed_add", lang)}</DialogTitle></DialogHeader>
          <div className="relative">
            <Textarea data-testid="feed-text-input" value={text} onChange={(e) => setText(e.target.value.slice(0, 100))} maxLength={100} rows={3} placeholder={t("feed_placeholder", lang)} className="bg-white/5 border-white/15 text-white placeholder:text-slate-500" />
            <span className="absolute bottom-2 right-2 text-[10px] text-slate-500">{text.length}/100 · 🪙100</span>
          </div>
          <div>
            <input ref={fileRef} data-testid="feed-video-input" type="file" accept="video/*" onChange={pickVideo} className="hidden" id="feed-video" />
            <label htmlFor="feed-video" className="flex items-center justify-between gap-2 rounded-xl bg-white/5 gold-hairline px-3 py-2.5 cursor-pointer hover:bg-white/10 transition-colors">
              <span className="flex items-center gap-2 text-sm text-slate-200"><VideoIcon size={16} className="text-rose-400" /> {videoFile ? videoFile.name.slice(0, 24) : t("feed_video_add", lang)}</span>
              <span className="text-[11px] text-slate-500">≤15s · 🪙150</span>
            </label>
            {videoFile && <button onClick={() => { setVideoFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-[11px] text-rose-300 mt-1">{t("remove", lang)}</button>}
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm text-slate-400">{t("balance", lang)}: <span className="font-mono-num text-amber-300">🪙 {user?.coins}</span></span>
            <span data-testid="feed-cost" className="text-sm font-mono-num text-amber-300">{t("feed_total", lang)}: 🪙 {cost}</span>
          </div>
          <Button data-testid="feed-submit" onClick={submit} disabled={busy || cost === 0} className="rose-btn text-white border-0 h-11">{busy ? t("feed_posting", lang) : `${t("feed_post", lang)} · 🪙 ${cost}`}</Button>
        </DialogContent>
      </Dialog>

      {/* Viewer */}
      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent className="bg-[#161018] border-white/10 text-white max-w-md" data-testid="feed-viewer">
          {view && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <img src={avatarUrl(view)} alt="" className="w-10 h-10 rounded-full object-cover" />
                  <button onClick={() => { nav(`/profile/${view.user_id}`); setView(null); }} className="font-serif-luxe text-xl hover:text-amber-300">{view.user_name}</button>
                </DialogTitle>
              </DialogHeader>
              {view.video_path && <video data-testid="feed-video-player" src={fileUrl(view.video_path)} controls autoPlay className="w-full rounded-xl max-h-[60vh] bg-black" />}
              {view.text && <p className="text-slate-200 leading-relaxed">{view.text}</p>}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500">{new Date(view.created_at).toLocaleString()}</span>
                {(view.user_id === user?.id || user?.is_admin) && (
                  <button data-testid={`feed-delete-${view.id}`} onClick={() => remove(view)} className="flex items-center gap-1 text-xs text-rose-300 hover:text-rose-200"><Trash2 size={13} /> {t("delete", lang)}</button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
