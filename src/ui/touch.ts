// A phone or tablet: no mouse to hover or right-click with, so the help says tap instead.
export const TOUCH = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
