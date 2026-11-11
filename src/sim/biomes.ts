import type { Season } from './seasons';
import type { WeatherKind } from './weather';

// Where the colony lands: the climate it lives with, the land it's given, and the animals about.
export type Biome = 'temperate' | 'tundra' | 'desert' | 'forest';
// The lie of the land: an open valley, a river through it, or an island in a lake.
export type MapKind = 'valley' | 'river' | 'island';

export interface BiomeDef {
  key: Biome;
  label: string;
  description: string;
  // Climate: the year's mean temperature (on top of the temperate 12.5°C), how far the seasons
  // swing it either way, and the day-night swing.
  mean: number;
  swing: number;
  daily: number;
  // Weather chances by season, in place of the temperate ones (seasons left out keep those).
  weather?: Partial<Record<Season, Partial<Record<WeatherKind, number>>>>;
  // The land, as cut-offs on the generator's noise (shares of the map, 0..1).
  land: {
    // Deep water, shallow water and beach sand by elevation.
    deep: number;
    shallow: number;
    beach: number;
    // Bare granite and rock to mine by rockiness.
    stone: number;
    rock: number;
    // Ground: rich soil above this moisture, and (dry lands) sand below this one.
    soil: number;
    sand: number;
    // Trees grow where moisture is above `treeFrom`, thicker the wetter it gets.
    treeFrom: number;
    treeRate: number;
    // A berry bush on a tile above this roll.
    bushAbove: number;
  };
  // How common each kind of wild animal is here, against the temperate mix (1).
  animals: Record<string, number>;
}

export const BIOMES: Record<Biome, BiomeDef> = {
  temperate: {
    key: 'temperate',
    label: 'Temperate',
    description: 'Mild seasons, good soil, timber and game. The usual start.',
    mean: 0,
    swing: 10,
    daily: 8,
    land: {
      deep: 0.06,
      shallow: 0.11,
      beach: 0.16,
      stone: 0.76,
      rock: 0.8,
      soil: 0.7,
      sand: 0,
      treeFrom: 0.35,
      treeRate: 0.55,
      bushAbove: 0.982,
    },
    animals: {},
  },
  tundra: {
    key: 'tundra',
    label: 'Tundra',
    description: 'Long hard winters and a short growing season. Plenty of stone, few trees; muskoxen and wolves.',
    // Cool summers (about 6–22°C) and bitter winters (about −14–2°C), with little between day and night.
    mean: -8,
    swing: 10,
    daily: 5,
    weather: {
      Autumn: { clear: 0.42, rain: 0.2, snow: 0.15, fog: 0.23 },
      Winter: { clear: 0.45, snow: 0.45, fog: 0.1 },
    },
    land: {
      deep: 0.05,
      shallow: 0.09,
      beach: 0.12,
      stone: 0.7,
      rock: 0.75,
      soil: 0.85,
      sand: 0,
      treeFrom: 0.45,
      treeRate: 0.4,
      bushAbove: 0.988,
    },
    animals: { deer: 0.4, boar: 0, muskox: 3, wolf: 1.4, fox: 1.3, grouse: 1.2 },
  },
  desert: {
    key: 'desert',
    label: 'Desert',
    description: 'Hot summers, cold nights, little water or wood. Crops grow slowly in the sand.',
    mean: 2,
    swing: 9,
    daily: 10,
    weather: {
      Spring: { clear: 0.75, rain: 0.1, storm: 0.05, fog: 0.1 },
      Summer: { clear: 0.62, rain: 0.04, storm: 0.06, drought: 0.28 },
      Autumn: { clear: 0.7, rain: 0.15, storm: 0.05, fog: 0.1 },
      Winter: { clear: 0.75, rain: 0.15, fog: 0.1 },
    },
    land: {
      deep: 0.02,
      shallow: 0.04,
      beach: 0.07,
      stone: 0.75,
      rock: 0.8,
      soil: 0.97,
      sand: 0.72,
      treeFrom: 0.75,
      treeRate: 0.45,
      bushAbove: 0.993,
    },
    animals: { deer: 0.3, muskox: 0, hare: 1.6, fox: 1.6, wolf: 0.6, grouse: 0.6, boar: 1.2 },
  },
  forest: {
    key: 'forest',
    label: 'Forest',
    description: 'Thick woods all round: timber and berries aplenty, but little open ground to farm.',
    mean: -0.5,
    swing: 9,
    daily: 6,
    weather: {
      Spring: { clear: 0.42, rain: 0.36, storm: 0.08, fog: 0.14 },
      Summer: { clear: 0.52, rain: 0.22, storm: 0.12, fog: 0.08, drought: 0.06 },
      Autumn: { clear: 0.36, rain: 0.34, storm: 0.06, fog: 0.24 },
    },
    land: {
      deep: 0.06,
      shallow: 0.11,
      beach: 0.14,
      stone: 0.78,
      rock: 0.82,
      soil: 0.6,
      sand: 0,
      treeFrom: 0.1,
      treeRate: 0.75,
      bushAbove: 0.968,
    },
    animals: { deer: 1.5, boar: 1.5, muskox: 0.2, wolf: 1.2 },
  },
};

export const BIOME_LIST: BiomeDef[] = Object.values(BIOMES);

export const MAP_KINDS: { key: MapKind; label: string; description: string }[] = [
  { key: 'valley', label: 'Valley', description: 'Open country all round.' },
  {
    key: 'river',
    label: 'River',
    description: 'A deep river runs through the valley, crossed at a few fords. Bridges help.',
  },
  {
    key: 'island',
    label: 'Island',
    description:
      'Land on an island in a lake, joined to the shore by shallow fords. Little room to farm, but a week of rations and a fishing spot by the landing.',
  },
];

export const biomeDef = (biome: Biome | undefined): BiomeDef => BIOMES[biome ?? 'temperate'] ?? BIOMES.temperate;

// How common a kind of wild animal is in this biome.
export const animalWeight = (biome: Biome | undefined, kind: string, weight: number): number =>
  weight * (biomeDef(biome).animals[kind] ?? 1);
