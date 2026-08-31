import { Compass } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return <div className="flex min-h-[70dvh] items-center justify-center p-6"><div className="text-center"><Compass className="mx-auto h-10 w-10 text-primary" /><p className="mt-5 font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">404 · fuera de ruta</p><h1 className="mt-3 text-3xl font-bold">Este plan no existe.</h1><Link href="/" className="mt-6 inline-flex rounded-full bg-foreground px-4 py-3 text-xs font-bold text-background" data-testid="link-not-found-home">Volver al inicio</Link></div></div>;
}
