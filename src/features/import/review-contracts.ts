import { z } from "zod";
import { importReviewQuerySchema } from "../../domain/asset-import/schemas";
import type { Json, Database } from "../../lib/supabase/database.types";
export const reviewFiltersSchema = importReviewQuerySchema.extend({ offset: z.coerce.number().int().min(0).max(10000000).default(0), filter: importReviewQuerySchema.shape.filter.default("ALL"), unitId: z.uuid().optional(), status: z.enum(["PENDING_RST", "ACTIVE", "HISTORICAL", "NEEDS_FIX", "TRASH", "ALL"]).default("PENDING_RST") }).strict();
export type ReviewFilters = z.infer<typeof reviewFiltersSchema>;
export const expectedReviewSchema = z.object({ runId: z.uuid(), mappingRevision: z.uuid(), layoutHash: z.string().regex(/^[0-9a-f]{64}$/), baseVersionId: z.uuid().nullable(), comparisonId: z.uuid().nullable() }).strict();
export const reviewActionSchema = z.object({ versionId: z.uuid(), expected: expectedReviewSchema, notes: z.string().trim().min(1).max(4000), confirmed: z.literal(true), mode: z.enum(["ACTIVATE", "ACKNOWLEDGE"]).default("ACTIVATE"), promoteMapping: z.boolean().default(false), rowIds: z.array(z.uuid()).max(100).default([]), filters: importReviewQuerySchema.default({ offset: 0, filter: "ALL" }) }).strict();
export type ReviewAction = z.infer<typeof reviewActionSchema>;
export type ReviewExpected = z.infer<typeof expectedReviewSchema>;
export interface ReviewQueueItem { versionId: string; versionNumber: number; unitId: string; unitName: string; status: string; fileName: string; createdAt: string }
export interface ReviewQueue { versions: ReviewQueueItem[]; total: number; offset: number }
type Row = Database["public"]["Tables"]["asset_snapshot_rows"]["Row"];
type Value = Database["public"]["Tables"]["asset_valuations"]["Row"];
export interface ReviewRow { row: Row; value: Value; change: { kind: string; fields: string[]; evidence: Json } | null }
export interface ReviewDetail extends ReviewQueueItem { expected: ReviewExpected; source: { byteSize: number; mimeType: string; sha256: string }; mapping: { layoutHash: string; ruleVersion: string; revision: string; provenance: Json; columns: Json }; summary: Json; comparison: Json; approvals: { action: string; notes: string | null; actor_id: string; created_at: string }[]; audit: { action: string; details: Json; created_at: string }[]; rows: ReviewRow[]; totalRows: number; offset: number; hasMore: boolean }
export interface ReviewResult { versionId: string; status: string; previousVersionId: string | null; mappingProfileId?: string | null }
