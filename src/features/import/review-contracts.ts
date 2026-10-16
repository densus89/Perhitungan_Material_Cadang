import { z } from "zod";
import { importReviewQuerySchema } from "../../domain/asset-import/schemas";
import type { Json, Database } from "../../lib/supabase/database.types";
export const reviewFiltersSchema = importReviewQuerySchema.extend({ offset: z.coerce.number().int().min(0).max(10000000).default(0), filter: importReviewQuerySchema.shape.filter.default("ALL"), unitId: z.uuid().optional(), status: z.enum(["DRAFT", "PENDING_RST", "ACTIVE", "HISTORICAL", "NEEDS_FIX", "TRASH", "ALL"]).default("PENDING_RST") }).strict();
export type ReviewFilters = z.infer<typeof reviewFiltersSchema>;
export const expectedReviewSchema = z.union([z.object({ runId: z.uuid(), mappingRevision: z.uuid(), layoutHash: z.string().regex(/^[0-9a-f]{64}$/), baseVersionId: z.uuid().nullable(), comparisonId: z.uuid().nullable() }).strict(), z.object({ kind: z.literal("UNPROCESSED_DRAFT"), unitId: z.uuid(), sourceFileId: z.uuid(), mappingRevision: z.uuid(), updatedAt: z.iso.datetime({ offset: true }) }).strict()]);
export const comparisonQuerySchema = z.object({ offset: z.coerce.number().int().min(0).max(10000000).default(0), kind: z.enum(["ALL", "ADDED", "REMOVED", "CHANGED", "UNCHANGED", "AMBIGUOUS"]).default("ALL") }).strict();
export type ComparisonQuery = z.infer<typeof comparisonQuerySchema>;
export const mappingQuerySchema = z.object({ offset: z.coerce.number().int().min(0).max(16383).default(0) }).strict();
export const reviewActionSchema = z.object({ versionId: z.uuid(), expected: expectedReviewSchema, notes: z.string().trim().min(1).max(4000), confirmed: z.literal(true), mode: z.enum(["ACTIVATE", "ACKNOWLEDGE"]).default("ACTIVATE"), promoteMapping: z.boolean().default(false), rowIds: z.array(z.uuid()).max(100).default([]), filters: importReviewQuerySchema.default({ offset: 0, filter: "ALL" }) }).strict();
export type ReviewAction = z.infer<typeof reviewActionSchema>;
export type ReviewExpected = z.infer<typeof expectedReviewSchema>;
export interface ReviewQueueItem { versionId: string; versionNumber: number; unitId: string; unitName: string; status: string; fileName: string; createdAt: string }
export interface ReviewQueue { versions: ReviewQueueItem[]; total: number; offset: number }
type Row = Database["public"]["Tables"]["asset_snapshot_rows"]["Row"];
type Value = Database["public"]["Tables"]["asset_valuations"]["Row"];
export interface ReviewRow { row: Omit<Row, "provenance">; value: Omit<Value, "selected_donor_ids">; change: { kind: string; fields: string[]; evidence: Json } | null }
export interface MappingPage { columns: Json[]; total: number; offset: number; hasMore: boolean }
export interface ReviewState extends ReviewQueueItem { expected: ReviewExpected; importId: string; datasetId: string; runId: string | null; sourceFileId: string; mappingCount: number; eligibleDraftTrash: boolean; source: { byteSize: number; mimeType: string; sha256: string }; mapping: MappingPage & { layoutHash: string | null; ruleVersion: string | null; revision: string; provenance: Json }; summary: Json }
export interface ReviewDetail extends ReviewState { comparison: Json; approvals: { action: string; notes: string | null; actor_id: string; created_at: string }[]; audit: { action: string; details: Json; created_at: string }[]; rows: ReviewRow[]; totalRows: number; offset: number; hasMore: boolean }
export interface ReviewComparisonPage { changes: { id: string; identity: string; kind: string; fields: string[]; before: Omit<ReviewRow, "change"> | null; after: Omit<ReviewRow, "change"> | null }[]; total: number; offset: number; hasMore: boolean }
export interface ReviewResult { versionId: string; status: string; previousVersionId: string | null; mappingProfileId?: string | null }
