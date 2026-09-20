// Retired Sept 2026 (Orders round) — this route (./page.tsx) is now a
// redirect stub into the new ../../orders/new journey, which has its own
// Server Actions (../../orders/actions.ts:createStockOrder). The old
// addStockOrder implementation that used to live here is superseded, not
// preserved — see ./page.tsx's comment for why this one file doesn't get
// the usual "hide, don't remove" treatment. No exports left here on
// purpose; nothing imports this file any more. Safe to delete this file
// outright next time you're tidying up the repo.
export {}
