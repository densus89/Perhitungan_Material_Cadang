import { createBrowserSupabaseClient } from "../../lib/supabase/browser";
import { importResponseSchema, XLSX_MIME, type ImportResponse, type ReviewFilter, type ImportReviewSearch } from "../../domain/asset-import/schemas";
import type { AssetSheetMapping } from "../../domain/asset-import/types";

export function createAssetImportClient() {
  async function request(path: string, body?: unknown): Promise<ImportResponse> {
    const response = await fetch(`/api/imports/${path}`, { method: body === undefined ? "GET" : "POST", cache: "no-store", credentials: "same-origin", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error("Permintaan impor gagal. Periksa status tersimpan sebelum mencoba lagi.");
    return importResponseSchema.parse(await response.json());
  }
  return {
    create: (unitId: string, file: File, sha256: string) => request("", { unitId, fileName: file.name, byteSize: file.size, mimeType: XLSX_MIME, sha256 }),
    load: (id: string, filter: ReviewFilter = "ALL", offset = 0, options: ImportReviewSearch = {}) => {
      const query = new URLSearchParams();
      if (filter !== "ALL") query.set("filter", filter);
      if (offset) query.set("offset", String(offset));
      for (const [key, value] of Object.entries(options)) if (value) query.set(key, value);
      return request(id + "/" + (query.size ? "?" + query.toString() : ""));
    },
    complete: (id: string) => request(`${id}/upload-complete/`, {}),
    saveMapping: (id: string, mapping: AssetSheetMapping, evidence: { ruleVersion: string; layoutHash: string; canonicalHash: string }) => request(`${id}/mapping/`, { mapping, ...evidence }),
    process: (id: string) => request(`${id}/process/`, {}),
    submit: (id: string) => request(`${id}/submit/`, {}),
    async upload(file: File, signature: NonNullable<ImportResponse["upload"]>) {
      const { error } = await createBrowserSupabaseClient().storage.from("source-files").uploadToSignedUrl(signature.path, signature.token, file, { contentType: XLSX_MIME, upsert: false });
      if (error) throw new Error("Unggahan belum dapat dipastikan. Periksa status tersimpan.");
    },
  };
}
