import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';

interface CreatePlanDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string) => void;
}

export function CreatePlanDialog({ open, onClose, onCreate }: CreatePlanDialogProps) {
  const [title, setTitle] = useState('');
  if (!open) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim()) {
      onCreate(title.trim());
      setTitle('');
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/35 p-3 sm:items-center" role="dialog" aria-modal="true" data-testid="dialog-create-plan">
      <div className="w-full max-w-md rounded-[24px] border border-border bg-card p-6 soft-shadow animate-rise-in">
        <div className="mb-5 flex items-center justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-primary">Abrir un plan</p><h2 className="mt-1 text-2xl font-bold">¿Qué montamos?</h2></div><button type="button" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Cerrar" data-testid="button-close-create-plan"><X className="h-5 w-5" /></button></div>
        <form onSubmit={submit}>
          <label className="text-sm font-semibold" htmlFor="plan-title">Nombre del plan</label>
          <input id="plan-title" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus placeholder="Ej. Vermú y paseo por el centro" className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" data-testid="input-plan-title" />
          <p className="mt-2 text-xs text-muted-foreground">Podrás añadir fecha, lugar y detalles después. Por ahora, dale un nombre.</p>
          <button type="submit" className="mt-6 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5" data-testid="button-submit-create-plan">Crear plan</button>
        </form>
      </div>
    </div>
  );
}