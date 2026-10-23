import {
  Compass,
  Heart,
  Home,
  MessageCircle,
  Search,
  UserRound,
} from "lucide-react";
import type { ActivityCategory } from "./types";

export const navItems = [
  {
    id: "home",
    href: "/",
    labelKey: "navigation.home",
    icon: Home,
  },
  {
    id: "explore",
    href: "/explore",
    labelKey: "navigation.explore",
    icon: Search,
  },
  {
    id: "connections",
    href: "/matches",
    labelKey: "navigation.connections",
    icon: Heart,
  },
  {
    id: "messages",
    href: "/chats",
    labelKey: "navigation.messages",
    icon: MessageCircle,
  },
  {
    id: "profile",
    href: "/profile",
    labelKey: "navigation.profile",
    icon: UserRound,
  },
] as const;

export const categoryMeta: Record<
  ActivityCategory,
  { label: string; short: string; tone: string }
> = {
  Fútbol: { label: "Fútbol", short: "FÚ", tone: "coral" },
  Cine: { label: "Cine", short: "CI", tone: "violet" },
  Juegos: { label: "Juegos de mesa", short: "JM", tone: "gold" },
  Cañas: { label: "Cañas", short: "CA", tone: "teal" },
  Senderismo: { label: "Senderismo", short: "SE", tone: "sky" },
  Creativo: { label: "Creativo", short: "CR", tone: "violet" },
  Cocina: { label: "Cocina", short: "CO", tone: "gold" },
};

export const filterCategories: Array<"Todas" | ActivityCategory> = [
  "Todas",
  "Fútbol",
  "Cine",
  "Juegos",
  "Cañas",
  "Senderismo",
  "Creativo",
  "Cocina",
];
