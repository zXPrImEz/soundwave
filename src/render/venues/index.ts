import type { VenueId } from './catalog';
import type { Venue, VenueContext } from './types';

/** Builds a venue; each one's code is loaded only when it is first built. */
export async function buildVenue(id: VenueId, ctx: VenueContext): Promise<Venue> {
  switch (id) {
    case 'moonrise':
      return (await import('./moonrise')).buildMoonrise(ctx);
    default:
      return (await import('./moonrise')).buildMoonrise(ctx);
  }
}
