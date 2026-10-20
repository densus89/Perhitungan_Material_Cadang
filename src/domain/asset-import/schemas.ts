import { z } from "zod";
import { CANONICAL_ASSET_FIELDS } from "./fields";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MAX_WORKBOOK_BYTES = 50 * 1024 * 1024;
export const uuidSchema = z.uuid();
export const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const createImportSchema = z.strictObject({
  unitId: uuidSchema,
  fileName: z.string().min(6).max(255).regex(/^[^/\\\x00-\x1f]+\.xlsx$/i),
  mimeType: z.literal(XLSX_MIME), byteSize: z.number().int().min(1).max(MAX_WORKBOOK_BYTES), sha256: hashSchema,
});
export const importIdSchema = z.strictObject({ importId: uuidSchema });
const fieldSchema = z.enum(CANONICAL_ASSET_FIELDS.map((field) => field.key));
export const sheetMappingSchema = z.strictObject({
  sheetName: z.string().min(1).max(255), headerRow: z.number().int().min(1).max(50),
  columns: z.array(z.strictObject({ columnIndex: z.number().int().min(1).max(16384), columnLetter: z.string().regex(/^[A-Z]{1,3}$/), header: z.string().max(4096), normalizedHeader: z.string().max(4096), field: fieldSchema.nullable(), confidence: z.number().min(0).max(1) })).min(1).max(16384),
  confidence: z.number().min(0).max(1), score: z.number().finite(), missingRequiredFields: z.array(fieldSchema), ambiguousFields: z.array(fieldSchema),
}).superRefine((mapping, context) => {
  const indexes = mapping.columns.map((column) => column.columnIndex), fields = mapping.columns.flatMap((column) => column.field ? [column.field] : []);
  if (new Set(indexes).size !== indexes.length || new Set(fields).size !== fields.length) context.addIssue({ code: "custom", message: "Duplicate mapping" });
});
export const saveMappingSchema = z.strictObject({ importId: uuidSchema, mapping: sheetMappingSchema, ruleVersion: z.string().trim().min(1).max(200), layoutHash: hashSchema, canonicalHash: hashSchema });
export const stageSchema = z.enum(["UPLOAD", "MAPPING", "READY_TO_PROCESS", "PROCESSING", "FAILED", "READY_TO_SUBMIT", "NEEDS_FIX", "PENDING_RST", "ACTIVE", "HISTORICAL"]);
export const importSummarySchema = z.strictObject({ rowCount: z.number().int().nonnegative(), blockingErrors: z.number().int().nonnegative(), warningCount: z.number().int().nonnegative(), valueSources: z.record(z.string(), z.number().int().nonnegative()), conditions: z.record(z.string(), z.number().int().nonnegative()), issueCounts: z.record(z.string(), z.number().int().nonnegative()), totalNilaiABC: z.number().finite().nonnegative() });
export const importProgressSchema = z.strictObject({
  completedRows: z.number().int().nonnegative(), expectedRows: z.number().int().nonnegative(),
  completedChunks: z.number().int().nonnegative(), expectedChunks: z.number().int().nonnegative(),
  percent: z.number().int().min(0).max(100),
}).superRefine((progress, context) => {
  if (progress.completedRows > progress.expectedRows) context.addIssue({ code: "custom", message: "Completed rows exceed expected rows" });
  if (progress.completedChunks > progress.expectedChunks) context.addIssue({ code: "custom", message: "Completed chunks exceed expected chunks" });
});
export const reviewFilterSchema = z.enum(["ALL", "ERROR", "WARNING", "ESTIMATED", "AGE_IMPUTED"]);
export const importReviewQuerySchema = z.strictObject({
  offset: z.number().int().min(0).max(10000000), filter: reviewFilterSchema,
  issue: z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/).optional(),
  source: z.enum(["SAP_BOOK_VALUE", "PROVIDED_ADJUSTED_VALUE", "SYSTEM_DEPRECIATION", "ESTIMATED_SAME_GI", "ESTIMATED_SAME_UPT", "ESTIMATED_SAME_UNIT", "ESTIMATED_NEAREST_LOCATION", "ESTIMATED_NATIONAL", "UNRESOLVED"]).optional(),
  condition: z.enum(["P0", "P1", "P2", "P3", "P4", "MISSING"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export const importReviewSchema = z.strictObject({
  totalRows: z.number().int().nonnegative(), offset: z.number().int().nonnegative(), hasMore: z.boolean(),
  rows: z.array(z.strictObject({
    rowNumber: z.number().int().positive(), equipment: z.string().max(4096), errors: z.array(z.string()), warnings: z.array(z.string()),
    value: z.number().finite().nonnegative().nullable(), valueSource: z.string(), ageImputed: z.boolean(),
    evidence: z.strictObject({ donorCount: z.number().int().nonnegative(), tier: z.string().optional(), referencePrice: z.number().finite().nonnegative().nullable().optional(), ageYears: z.number().finite().nonnegative().nullable().optional(), usefulLifeYears: z.number().finite().positive().nullable().optional() }),
  })).max(100),
});
export const importResponseSchema = z.strictObject({
  importId: uuidSchema, datasetId: uuidSchema, versionId: uuidSchema, stage: stageSchema,
  upload: z.strictObject({ path: z.string().regex(/^unit\/[0-9a-f-]+\/dataset\/[0-9a-f-]+\/version\/[0-9a-f-]+\/[0-9a-f-]+\.xlsx$/), token: z.string().min(1) }).optional(),
  layout: sheetMappingSchema.nullable().optional(),
  suggestedProfile: z.strictObject({ id: uuidSchema, name: z.string(), ruleVersion: z.string() }).nullable().optional(),
  summary: importSummarySchema.optional(), failureCode: z.enum(["PROCESS_FAILED", "COMPARISON_FAILED"]).optional(),
  source: z.strictObject({ unitId: uuidSchema, fileName: z.string(), byteSize: z.number().int().positive(), sha256: hashSchema }).optional(),
  ruleVersion: z.string().optional(),
  review: importReviewSchema.optional(),
  comparison: z.strictObject({ counts: z.record(z.string(), z.number().int().nonnegative()), sourceShifts: z.record(z.string(), z.number().int()), hasActiveVersion: z.boolean() }).optional(),
  progress: importProgressSchema.optional(),
});
export type ImportResponse = z.infer<typeof importResponseSchema>;
export type ImportReview = z.infer<typeof importReviewSchema>;
export type ReviewFilter = z.infer<typeof reviewFilterSchema>;
export type ImportReviewQuery = z.infer<typeof importReviewQuerySchema>;
export type ImportReviewSearch = Omit<ImportReviewQuery, "offset" | "filter">;
export interface ImportDraft { importId: string; datasetId: string; versionId: string; unitId: string; fileName: string; createdAt: string; stage: ImportResponse["stage"]; rowCount: number | null; progress?: z.infer<typeof importProgressSchema> }
