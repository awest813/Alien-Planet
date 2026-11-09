import { RESEARCH, ResearchDef } from './defs';

export interface ResearchState {
  current: string | null;
  // Points put into each project so far.
  progress: Record<string, number>;
  done: string[];
  // Rounds of further study finished (older saves: none).
  further?: number;
}

// Each round of a repeatable project costs half as much again as the first.
export const researchCost = (state: ResearchState, project: ResearchDef): number =>
  project.repeatable ? Math.round(project.cost * (1 + 0.5 * (state.further ?? 0))) : project.cost;

export const freshResearch = (): ResearchState => ({ current: null, progress: {}, done: [] });

export function isResearched(state: ResearchState, key: string | undefined): boolean {
  return key === undefined || state.done.includes(key);
}

// Not yet finished, and every prerequisite is.
export function isAvailable(state: ResearchState, project: ResearchDef): boolean {
  return (
    (project.repeatable || !state.done.includes(project.key)) && project.requires.every((r) => state.done.includes(r))
  );
}

export function availableProjects(state: ResearchState): ResearchDef[] {
  return RESEARCH.filter((p) => isAvailable(state, p));
}
