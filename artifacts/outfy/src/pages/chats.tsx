import { ArrowLeft, Check, ImagePlus, Info, MessageCircle, Send, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { chats } from '@/mock-data';
import type { Chat } from '@/types';
import { cn } from '@/utils';

export function Chats() {
  const [selectedId, setSelectedId] = useState(chats[0].id);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const selected = chats.find((chat) => chat.id === selectedId) ?? chats[0];
  const mobileChatOpen = Boolean(selectedId);
  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    setSent((current) => [...current, message.trim()]);
    setMessage('');
  };
  return (
    <div className="space-y-7">
      <div><p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">La conversación sigue fuera</p><h1 className="mt-2 text-4xl font-bold tracking-[-.06em]">Mensajes</h1></div>
      <div className="grid min-h-[530px] overflow-hidden rounded-[24px] border border-border bg-card soft-shadow lg:grid-cols-[310px_1fr]">
        <div className={cn('border-r border-border', mobileChatOpen && 'hidden lg:block')}>
          <div className="flex items-center justify-between border-b border-border p-4"><p className="text-sm font-bold">Tus conversaciones</p><span className="rounded-full bg-primary/10 px-2 py-1 font-mono-ui text-[9px] text-primary">4 activas</span></div>
          <div className="p-2">{chats.map((chat) => <ChatRow key={chat.id} chat={chat} selected={chat.id === selectedId} onSelect={() => setSelectedId(chat.id)} />)}</div>
        </div>
        <div className={cn('min-h-[530px] flex-col', !mobileChatOpen ? 'hidden lg:flex' : 'flex')}>
          <div className="flex items-center gap-3 border-b border-border p-4"><button type="button" onClick={() => setSelectedId('')} className="rounded-full p-2 hover:bg-muted lg:hidden" aria-label="Volver a conversaciones" data-testid="button-back-chats"><ArrowLeft className="h-4 w-4" /></button><div className={cn('flex h-10 w-10 items-center justify-center rounded-xl text-[10px] font-bold', `tone-${selected.color}`)}>{selected.initials}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{selected.name}</p><p className="flex items-center gap-1 text-[11px] text-muted-foreground">{selected.isGroup ? <><Users className="h-3 w-3" /> {selected.activity}</> : 'En línea hace poco'}</p></div><button type="button" onClick={() => setInfoOpen((current) => !current)} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Información de conversación" data-testid="button-chat-info"><Info className="h-4 w-4" /></button></div>
          {infoOpen && <div className="border-b border-border bg-accent/25 px-4 py-2.5 text-xs text-muted-foreground">Conversación privada y segura para organizar el próximo plan.</div>}
          <div className="flex flex-1 flex-col justify-end gap-4 bg-background/50 p-4 sm:p-6">
            <div className="mx-auto rounded-full bg-muted px-3 py-1.5 text-[10px] text-muted-foreground">{selected.isGroup ? `Plan · ${selected.activity}` : 'Conexión reciente'}</div>
            <div className="flex items-end gap-2"><div className="max-w-[78%] rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm leading-relaxed">¡Hola! Qué ganas de que llegue el plan. ¿Te apuntas?</div><span className="font-mono-ui text-[9px] text-muted-foreground">16:38</span></div>
            <div className="flex items-end justify-end gap-2"><span className="font-mono-ui text-[9px] text-muted-foreground">16:40</span><div className="max-w-[78%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">Sí, me viene genial. Nos vemos allí.</div></div>
            {sent.map((item, index) => <div className="flex items-end justify-end gap-2" key={`${item}-${index}`}><span className="font-mono-ui text-[9px] text-muted-foreground">Ahora</span><div className="max-w-[78%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-foreground">{item}</div></div>)}
          </div>
          <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-border p-3"><button type="button" onClick={() => setInfoOpen(true)} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Añadir imagen" data-testid="button-add-image"><ImagePlus className="h-5 w-5" /></button><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escribe algo..." className="min-w-0 flex-1 rounded-xl bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-chat-message" /><button type="submit" className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:-translate-y-0.5 disabled:opacity-50" disabled={!message.trim()} aria-label="Enviar mensaje" data-testid="button-send-message"><Send className="h-4 w-4" /></button></form>
        </div>
      </div>
    </div>
  );
}

function ChatRow({ chat, selected, onSelect }: { chat: Chat; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} className={cn('flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-muted', selected && 'bg-primary/8')} data-testid={`button-chat-${chat.id}`}><div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold', `tone-${chat.color}`)}>{chat.initials}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold">{chat.name}</p><span className="font-mono-ui text-[9px] text-muted-foreground">{chat.time}</span></div><p className="mt-1 truncate text-[11px] text-muted-foreground">{chat.preview}</p></div>{chat.unread && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-mono-ui text-[9px] font-bold text-primary-foreground">{chat.unread}</span>}</button>;
}