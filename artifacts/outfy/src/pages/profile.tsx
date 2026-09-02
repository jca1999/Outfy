import { useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  Edit3,
  LogOut,
  MapPin,
  Plus,
  Trophy,
} from "lucide-react";
import { activities } from "@/mock-data";
import { categoryMeta } from "@/constants";
import type { ActivityCategory } from "@/types";
import { cn } from "@/utils";
import { useAuth } from "@/auth/auth-context";
import { useLocation } from "wouter";
import { LanguageSwitcher } from "@/components/language-switcher";

const initialInterests: ActivityCategory[] = [
  "Cine",
  "Cañas",
  "Senderismo",
  "Juegos",
];

export function Profile() {
  const { user, signOut } = useAuth();
  const [, navigate] = useLocation();
  const [interests, setInterests] =
    useState<ActivityCategory[]>(initialInterests);
  const [editing, setEditing] = useState(false);
  const [photoAdded, setPhotoAdded] = useState(false);
  const toggleInterest = (interest: ActivityCategory) =>
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest],
    );
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">
            Tu punto de partida
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-[-.06em]">
            Mi perfil
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageSwitcher />
          
          <button
            type="button"
            onClick={() => setEditing((current) => !current)}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2.5 text-xs font-bold hover:bg-muted"
            data-testid="button-edit-profile"
          >
            <Edit3 className="h-3.5 w-3.5" />
            {editing ? "Guardar" : "Editar perfil"}
          </button>
          <button
            type="button"
            onClick={() => {
              void signOut().then(() => navigate("/sign-in"));
            }}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
            data-testid="button-sign-out"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </div>
      <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <div className="relative overflow-hidden rounded-[24px] bg-sidebar p-6 text-sidebar-foreground sm:p-8">
          <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full border-[22px] border-primary/20" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <div
              className={cn(
                "relative flex h-24 w-24 shrink-0 items-center justify-center rounded-[28px] text-xl font-bold text-primary-foreground",
                photoAdded ? "bg-teal text-teal-foreground" : "bg-primary",
              )}
            >
              {(user?.username ?? "LC").slice(0, 2).toUpperCase()}
              <button
                type="button"
                onClick={() => setPhotoAdded(true)}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-4 border-sidebar bg-accent text-accent-foreground"
                aria-label="Cambiar foto de perfil"
                data-testid="button-change-profile-photo"
              >
                {photoAdded ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-[-.04em]">
                {user?.username ?? "Laura Cebrián"}
              </h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-sidebar-foreground/60">
                <MapPin className="h-3.5 w-3.5 text-primary" /> Zaragoza · 28
                años
              </p>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-sidebar-foreground/75">
                Siempre hay un plan mejor que quedarse en casa. Me apunto a lo
                que tenga buena conversación.
              </p>
            </div>
          </div>
          <div className="relative mt-7 flex gap-8 border-t border-sidebar-border pt-5">
            <div>
              <p className="font-mono-ui text-xl font-bold">12</p>
              <p className="mt-1 text-[10px] text-sidebar-foreground/55">
                planes hechos
              </p>
            </div>
            <div>
              <p className="font-mono-ui text-xl font-bold">8</p>
              <p className="mt-1 text-[10px] text-sidebar-foreground/55">
                conexiones
              </p>
            </div>
            <div>
              <p className="font-mono-ui text-xl font-bold">4.9</p>
              <p className="mt-1 text-[10px] text-sidebar-foreground/55">
                valoración
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-[24px] border border-border bg-card p-6 soft-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-primary">
                Tu mezcla
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-[-.04em]">
                Intereses
              </h2>
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-1 font-mono-ui text-[9px] text-secondary-foreground">
              {interests.length} elegidos
            </span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {(Object.keys(categoryMeta) as ActivityCategory[]).map(
              (interest) => {
                const active = interests.includes(interest);
                return (
                  <button
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    key={interest}
                    className={cn(
                      "rounded-full border px-3 py-2 text-xs font-semibold transition",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/50",
                    )}
                    data-testid={`button-interest-${interest}`}
                  >
                    {active && (
                      <Check className="mr-1 inline h-3 w-3 text-primary" />
                    )}
                    {categoryMeta[interest].label}
                  </button>
                );
              },
            )}
          </div>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Tus intereses ayudan a ordenar los planes y acercarte a gente con
            ganas parecidas.
          </p>
        </div>
      </section>
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">
              Pequeñas victorias
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-[-.04em]">
              Actividades completadas
            </h2>
          </div>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Trophy className="h-3.5 w-3.5 text-accent-foreground" />
            12 en total
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activities.slice(0, 3).map((activity, index) => (
            <div
              key={activity.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
            >
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[9px] font-bold",
                  `tone-${activity.tone}`,
                )}
              >
                {categoryMeta[activity.category].short}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{activity.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {index === 0
                    ? "Hace 2 días"
                    : index === 1
                      ? "La semana pasada"
                      : "Hace 3 semanas"}
                </p>
              </div>
              <Check className="h-4 w-4 text-teal" />
            </div>
          ))}
        </div>
      </section>
      {editing && (
        <section className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-5">
          <p className="text-sm font-bold">Perfil actualizado</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Tus cambios se guardan solo en esta sesión de prueba.
          </p>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary"
            data-testid="button-finish-edit-profile"
          >
            Listo <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </section>
      )}
      <section className="flex flex-col items-start justify-between gap-4 rounded-[22px] border border-border bg-secondary p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-bold">Tu perfil cuenta una historia.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cada plan que haces abre una puerta nueva.
          </p>
        </div>
        <button
          type="button"
          onClick={() => toggleInterest("Creativo")}
          className="flex items-center gap-1 text-xs font-bold text-primary"
          data-testid="button-add-interest"
        >
          <Plus className="h-3.5 w-3.5" /> Añadir interés
        </button>
      </section>
    </div>
  );
}
