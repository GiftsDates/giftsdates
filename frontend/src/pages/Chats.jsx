import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Send, ShieldAlert, Gift } from "lucide-react";
import { toast } from "sonner";
import GiftModal from "../components/GiftModal";

export default function Chats() {
  const { user, lang, logout } = useApp();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(sp.get("c") || null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);
  const endRef = useRef();
  const reload = () => active && api.get(`/conversations/${active}/messages`).then(r => setMsgs(r.data));
  const thanks = async (mid, r) => { try { await api.post("/gifts/thanks", { message_id: mid, reaction: r }); reload(); } catch { toast.error(t("failed", lang)); } };

  useEffect(() => { api.get("/matches").then(r => { setConvs(r.data); if (!active && r.data[0]) setActive(r.data[0].conversation_id); }); }, []);
  useEffect(() => {
    if (!active) return;
    const load = () => api.get(`/conversations/${active}/messages`).then(r => setMsgs(r.data));
    load(); const iv = setInterval(load, 4000); return () => clearInterval(iv);
  }, [active]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async () => {
    if (!text.trim() || !active) return;
    try { await api.post("/conversations/messages", { conversation_id: active, text }); setText(""); const r = await api.get(`/conversations/${active}/messages`); setMsgs(r.data); }
    catch (e) {
      const d = e.response?.data?.detail || "";
      if (d.startsWith("PHONE_BLOCKED:")) { const [, a, b] = d.split(":"); toast.error(t("phone_blocked", lang).replace("{a}", a).replace("{b}", b), { duration: 6000 }); }
      else if (d.startsWith("BLOCKED:")) { toast.error(t("account_blocked", lang).replace("{d}", new Date(d.slice(8)).toLocaleDateString()), { duration: 8000 }); logout(); nav("/auth"); }
      else toast.error(t("failed", lang));
    }
  };
  const partner = convs.find(c => c.conversation_id === active)?.user;

  return (
    <div className="aurora-bg min-h-[calc(100vh-4rem)]">
      <div className="max-w-6xl mx-auto px-4 py-8 grid md:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-8rem)]">
        <div className="glass rounded-2xl p-3 overflow-auto scrollbar-thin">
          <h3 className="font-serif-luxe text-xl px-2 pb-2">{t("chats", lang)}</h3>
          {convs.length === 0 && <div className="text-xs text-slate-500 p-3">{t("no_matches_yet", lang)}</div>}
          {convs.map(c => (
            <button key={c.conversation_id} data-testid={`chat-item-${c.user.id}`} onClick={() => { setActive(c.conversation_id); setSp({ c: c.conversation_id }); }}
              className={`w-full text-left p-2 rounded-xl flex items-center gap-2 ${active===c.conversation_id ? "bg-rose-500/15 border border-rose-500/30" : "hover:bg-white/5"}`}>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-violet-500 flex items-center justify-center text-sm font-semibold">{c.user.name[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.user.name}</div>
                <div className="text-xs text-slate-400 truncate">{c.user.city}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="glass rounded-2xl flex flex-col">
          {partner && (
            <div className="p-4 border-b border-white/10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-violet-500 flex items-center justify-center text-sm font-semibold">{partner.name[0]}</div>
              <div><div className="font-serif-luxe text-lg leading-tight">{partner.name}</div><div className="text-xs text-slate-400">{partner.city}</div></div>
            </div>
          )}
          <div className="flex-1 p-4 overflow-auto space-y-2 scrollbar-thin">
            {msgs.map(m => (
              <div key={m.id} className={`flex ${m.from_id === user.id ? "justify-end" : "justify-start"}`}>
                <div data-testid={`chat-message-${m.id}`} className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm ${m.type === "gift" ? "border border-amber-400/40 bg-amber-500/10 text-amber-100" : m.from_id===user.id ? "rose-btn text-white" : "bg-white/10 text-slate-100"}`}>
                  {m.type === "gift" ? (
                    <div data-testid={`chat-gift-${m.id}`} className="text-center">
                      <div className="text-4xl leading-none">{m.gift_icon}</div>
                      <div className="text-[11px] mt-1 text-amber-300 font-mono-num">{m.from_id === user.id ? t("gift_sent_you", lang) : t("gift_received_chat", lang)} · 🪙 {m.gift_cost}</div>
                      {m.text && <div className="mt-1 text-xs text-slate-200 italic">“{m.text}”</div>}
                      {m.from_id !== user.id && !m.thanks && (
                        <div className="mt-2 flex justify-center gap-1">
                          {["❤️", "😘", "🥰"].map(r => <button key={r} type="button" data-testid={`chat-gift-thanks-${m.id}-${r.codePointAt(0)}`} onClick={() => thanks(m.id, r)} className="px-2 py-1 rounded-full bg-white/10 hover:bg-rose-500/30 text-xs transition-colors">{t("thanks", lang)} {r}</button>)}
                        </div>
                      )}
                      {m.thanks && <div data-testid={`chat-gift-thanked-${m.id}`} className="mt-1 text-[10px] text-slate-400">{t("thanked", lang)} {m.thanks}</div>}
                    </div>
                  ) : m.type === "thanks" ? <span data-testid={`chat-thanks-${m.id}`}>{t("thanks", lang)} {m.reaction}</span> : m.text}
                </div>
              </div>
            ))}
            <div ref={endRef}/>
          </div>
          {active && (
            <div className="p-3 border-t border-white/10">
              <div className="flex gap-2">
                <Button data-testid="chat-gift-button" variant="outline" onClick={() => setGiftOpen(true)} className="border-amber-400/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20" title={t("send_gift", lang)}><Gift size={16}/></Button>
                <Input data-testid="chat-message-input" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key==='Enter' && send()} placeholder={t("message_placeholder", lang)} className="bg-white/5 border-white/10"/>
                <Button data-testid="chat-message-send-button" onClick={send} className="rose-btn text-white border-0"><Send size={16}/></Button>
              </div>
              <div data-testid="chat-rule-hint" className="mt-2 text-[11px] text-slate-500 flex items-center gap-1"><ShieldAlert size={11}/> {t("chat_rule_hint", lang)}</div>
            </div>
          )}
        </div>
      </div>
      {partner && <GiftModal open={giftOpen} onOpenChange={setGiftOpen} target={partner} conversationId={active} onSent={reload} />}
    </div>
  );
}
