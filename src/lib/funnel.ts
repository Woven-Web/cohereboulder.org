/** A question counts as reached once this much of it is on screen. */
export const REACHED_RATIO = 0.6;

/**
 * IntersectionObserver delivers an initial entry for every target, and
 * `threshold` does not filter it: a question peeking in at 10% arrives with
 * isIntersecting true. Check the ratio ourselves.
 */
export function countsAsReached(entry: { isIntersecting: boolean; intersectionRatio: number }): boolean {
  return entry.isIntersecting && entry.intersectionRatio >= REACHED_RATIO;
}
