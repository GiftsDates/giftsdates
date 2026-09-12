import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { t } from "../lib/i18n";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Send } from "lucide-react";
import { toast } from "sonner";

export default function Chats() {
  const { user, lang } = useApp();
  const [sp, setSp] = useSearchParams();
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(sp.get("c") || null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const endRef = useRef();

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
    catch { toast.error("Failed"); }
  };
  const partner = convs.find(c => c.conversation_id === active)?.user;

  return (
    <div className="aurora-bg min-h-[calc(100vh-4rem)]">
      <div className="max-w-6xl mx-auto px-4 py-8 grid md:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-8rem)]">
        <div className="glass rounded-2xl p-3 overflow-auto scrollbar-thin">
          <h3 className="font-serif-luxe text-xl px-2 pb-2">{t("chats", lang)}</h3>
          {convs.length === 0 && <div className="text-xs text-slate-500 p-3">No matches yet.</div>}
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
                <div data-testid={`chat-message-${m.id}`} className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm ${m.from_id===user.id ? "rose-btn text-white" : "bg-white/10 text-slate-100"}`}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={endRef}/>
          </div>
          {active && (
            <div className="p-3 border-t border-white/10 flex gap-2">
              <Input data-testid="chat-message-input" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key==='Enter' && send()} placeholder={t("message_placeholder", lang)} className="bg-white/5 border-white/10"/>
              <Button data-testid="chat-message-send-button" onClick={send} className="rose-btn text-white border-0"><Send size={16}/></Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
