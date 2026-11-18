/**
 * Seconds that must pass between two strobe flashes. Flashing light more often than three times a
 * second can set off seizures in people with photosensitive epilepsy (the limit WCAG 2.3.1 sets),
 * so however fast the music goes, the strobes never go faster than this.
 */
export const MIN_FLASH_GAP = 0.34;

/** Lets a venue's strobe flash on the music, but never more than three times a second. */
export class StrobeGate {
  private last = -Infinity;

  /** Whether a flash asked for at `time` (seconds) may go off; one that may counts as fired. */
  fire(time: number): boolean {
    if (time - this.last < MIN_FLASH_GAP) return false;
    this.last = time;
    return true;
  }
}
