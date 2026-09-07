export const activityTaxonomy = {
  sports: [
    'football',
    'padel',
    'basketball',
    'tennis',
    'running',
    'gym',
    'cycling',
    'other_sport',
  ],

  music: [
    'concert',
    'festival',
    'live_music',
    'karaoke',
    'jam_session',
    'other_music',
  ],

  movies: [
    'cinema',
    'movie_night',
    'series_watch',
    'other_movies',
  ],

  outdoors: [
    'hiking',
    'walking',
    'beach',
    'picnic',
    'nature',
    'camping',
    'other_outdoors',
  ],

  social: [
    'drinks',
    'city_walk',
    'meet_people',
    'party',
    'conversation',
    'nightlife',
    'other_social',
  ],

  food: [
    'breakfast',
    'brunch',
    'lunch',
    'dinner',
    'coffee',
    'restaurant',
    'cooking',
    'other_food',
  ],

  gaming: [
    'pc',
    'playstation',
    'xbox',
    'nintendo',
    'mobile',
    'retro',
    'lan_party',
    'other_gaming',
  ],

  board_games: [
    'board_games',
    'cards',
    'role_playing',
    'chess',
    'puzzles',
    'other_tabletop',
  ],

  culture: [
    'museum',
    'theatre',
    'exhibition',
    'photography',
    'monuments',
    'literature',
    'other_culture',
  ],

  travel: [
    'day_trip',
    'weekend_trip',
    'road_trip',
    'tourism',
    'other_travel',
  ],

  learning: [
    'languages',
    'study',
    'programming',
    'workshop',
    'other_learning',
  ],

  other: [
    'other',
  ],
} as const;

export type ActivityCategoryId =
  keyof typeof activityTaxonomy;

export type ActivitySubcategoryId =
  (typeof activityTaxonomy)[ActivityCategoryId][number];

export type ActivityLocationType =
  | 'physical'
  | 'online';