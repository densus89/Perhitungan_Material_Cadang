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
export const importResponseSchema = z.strictObject({
  importId: uuidSchema, datasetId: uuidSchema, versionId: uuidSchema, stage: stageSchema,
  upload: z.strictObject({ path: z.string().regex(/^unit\/[0-9a-f-]+\/dataset\/[0-9a-f-]+\/version\/[0-9a-f-]+\/[0-9a-f-]+\.xlsx$/), token: z.string().min(1) }).optional(),
  layout: sheetMappingSchema.nullable().optional(),
  suggestedProfile: z.strictObject({ id: uuidSchema, name: z.string(), ruleVersion: z.string() }).nullable().optional(),
  summary: importSummarySchema.optional(), failureCode: z.enum(["PROCESS_FAILED", "COMPARISON_FAILED"]).optional(),
});
export type ImportResponse = z.infer<typeof importResponseSchema>;
