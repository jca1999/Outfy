export type ActivityCategory =
  | 'Fútbol'
  | 'Cine'
  | 'Juegos'
  | 'Cañas'
  | 'Senderismo'
  | 'Creativo'
  | 'Cocina';

export type ActivityTone = 'coral' | 'teal' | 'gold' | 'violet' | 'sky';

export interface Activity {
  id: string;
  title: string;
  category: ActivityCategory;
  day: string;
  date: string;
  time: string;
  location: string;
  neighborhood: string;
  participants: number;
  capacity: number;
  host: string;
  hostInitials: string;
  description: string;
  tone: ActivityTone;
  featured?: boolean;
}

export interface Person {
  id: string;
  name: string;
  initials: string;
  age: number;
  occupation: string;
  bio: string;
  interests: ActivityCategory[];
  compatibility: number;
  active: string;
  color: string;
}

export interface Chat {
  id: string;
  name: string;
  initials: string;
  preview: string;
  time: string;
  unread?: number;
  isGroup?: boolean;
  activity?: string;
  color: string;
}