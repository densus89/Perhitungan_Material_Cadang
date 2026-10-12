import type { MappingSuggestion } from "../../domain/types";

/** Authored material totals can cover several source rows; any pending peer keeps that demo group draft. */
export function hasPendingRfqPeer(mappings: readonly MappingSuggestion[], mappingId: string | undefined) {
  const anchor = mappings.find((row) => row.id === mappingId);
  return !!anchor && mappings.some((row) => row.normalizedSpecification === anchor.normalizedSpecification && row.status === "MENUNGGU_APPROVAL");
}
