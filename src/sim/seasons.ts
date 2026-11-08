// The year: four six-day seasons. Day 1 of a new colony falls in early spring.
export const DAYS_PER_SEASON = 6;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * 4;
const START_YEAR_DAY = 2;
// Warmest point of the year (mid-summer), and how far temperatures swing either way.
const PEAK_YEAR_DAY = 9;
const SEASONAL_SWING = 10;
const SEASONAL_MEAN = 0.5;

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export type Season = (typeof SEASONS)[number];

// Days into the year as a fraction, 0 ≤ x < 24.
function yearDayFraction(totalHours: number): number {
  return (totalHours / 24 + START_YEAR_DAY) % DAYS_PER_YEAR;
}

export function seasonOf(totalHours: number): Season {
  return SEASONS[Math.floor(yearDayFraction(totalHours) / DAYS_PER_SEASON)];
}

// 1-based day within the current season, and the year number.
export function seasonDay(totalHours: number): number {
  return (Math.floor(yearDayFraction(totalHours)) % DAYS_PER_SEASON) + 1;
}

export function yearOf(totalHours: number): number {
  return Math.floor((totalHours / 24 + START_YEAR_DAY) / DAYS_PER_YEAR) + 1;
}

// Days until winter starts (0 during winter).
export function daysUntilWinter(totalHours: number): number {
  const winterStart = DAYS_PER_SEASON * 3;
  const day = yearDayFraction(totalHours);
  return day >= winterStart ? 0 : winterStart - day;
}

// Added to the daily temperature cycle: about +10°C in mid-summer, -10°C in mid-winter (a colder or
// hotter biome moves the mean and widens or narrows the swing).
export function seasonalOffset(totalHours: number, mean = 0, swing = SEASONAL_SWING): number {
  const angle = ((yearDayFraction(totalHours) - PEAK_YEAR_DAY) / DAYS_PER_YEAR) * Math.PI * 2;
  return SEASONAL_MEAN + mean + swing * Math.cos(angle);
}
