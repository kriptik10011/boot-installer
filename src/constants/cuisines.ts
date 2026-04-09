export const CUISINE_TYPES = [
  'Italian', 'Mexican', 'Asian', 'Chinese', 'Japanese', 'Thai',
  'Indian', 'Mediterranean', 'French', 'American', 'Korean',
  'Vietnamese', 'Greek', 'Middle Eastern', 'Spanish', 'Caribbean',
  'African', 'German', 'British', 'Fusion', 'Other',
] as const;

export type CuisineType = typeof CUISINE_TYPES[number];
