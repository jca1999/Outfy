import {
  Compass,
  Heart,
  Home,
  MessageCircle,
  Search,
  UserRound,
} from 'lucide-react';
import type { ActivityCategory } from './types';

export const navItems = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/explore', label: 'Explorar', icon: Search },
  { href: '/matches', label: 'Conexiones', icon: Heart },
  { href: '/chats', label: 'Mensajes', icon: MessageCircle },
  { href: '/profile', label: 'Mi perfil', icon: UserRound },
] as const;

export const categoryMeta: Record<ActivityCategory, { label: string; short: string; tone: string }> = {
  Fútbol: { label: 'Fútbol', short: 'FÚ', tone: 'coral' },
  Cine: { label: 'Cine', short: 'CI', tone: 'violet' },
  Juegos: { label: 'Juegos de mesa', short: 'JM', tone: 'gold' },
  Cañas: { label: 'Cañas', short: 'CA', tone: 'teal' },
  Senderismo: { label: 'Senderismo', short: 'SE', tone: 'sky' },
  Creativo: { label: 'Creativo', short: 'CR', tone: 'violet' },
  Cocina: { label: 'Cocina', short: 'CO', tone: 'gold' },
};

export const filterCategories: Array<'Todas' | ActivityCategory> = [
  'Todas',
  'Fútbol',
  'Cine',
  'Juegos',
  'Cañas',
  'Senderismo',
  'Creativo',
  'Cocina',
];