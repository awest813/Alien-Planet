import { RESEARCH, ResearchDef } from './defs';

export interface ResearchState {
  current: string | null;
  // Points put into each project so far.
  progress: Record<string, number>;
  done: string[];
}

export const freshResearch = (): ResearchState => ({ current: null, progress: {}, done: [] });

export function isResearched(state: ResearchState, key: string | undefined): boolean {
  return key === undefined || state.done.includes(key);
}

// Not yet finished, and every prerequisite is.
export function isAvailable(state: ResearchState, project: ResearchDef): boolean {
  return !state.done.includes(project.key) && project.requires.every((r) => state.done.includes(r));
}

export function availableProjects(state: ResearchState): ResearchDef[] {
  return RESEARCH.filter((p) => isAvailable(state, p));
}
