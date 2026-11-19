import type { VenueId } from './catalog';
import type { Venue, VenueContext } from './types';

/** Builds a venue; each one's code is loaded only when it is first built. */
export async function buildVenue(id: VenueId, ctx: VenueContext): Promise<Venue> {
  switch (id) {
    case 'moonrise':
      return (await import('./moonrise')).buildMoonrise(ctx);
    case 'mainstage':
      return (await import('./mainstage')).buildMainstage(ctx);
    case 'monolith':
      return (await import('./monolith')).buildMonolith(ctx);
    case 'warehouse':
      return (await import('./warehouse')).buildWarehouse(ctx);
    case 'arena':
      return (await import('./arena')).buildArena(ctx);
    case 'basement':
      return (await import('./basement')).buildBasement(ctx);
  }
}
