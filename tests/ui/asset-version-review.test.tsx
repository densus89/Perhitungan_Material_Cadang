import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AssetVersionReview } from "../../src/features/import/AssetVersionReview";
import { workspaceActor } from "../fixtures/workspace-actor";
import { reviewDetail, reviewId } from "../fixtures/asset-version-review";
const actor = { ...workspaceActor, role: "RST_REVIEWER" as const };
it("offers all queue filters and keeps approval disabled without explicit note and confirmation", async () => { vi.stubGlobal("fetch", vi.fn(async () => Response.json({ versions: [], total: 0, offset: 0 }))); render(<AssetVersionReview actor={actor} />); for (const label of ["Unit induk", "Status versi", "Kode isu", "Sumber nilai", "Peringatan"]) expect(screen.getByLabelText(label)).toBeVisible(); await waitFor(() => expect(screen.getByText("Tidak ada versi pada filter ini.")).toBeVisible()); fireEvent.change(screen.getByLabelText("Kode isu"), { target: { value: "AGE_IMPUTED" } }); fireEvent.click(screen.getByRole("button", { name: "Terapkan filter" })); await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("issue=AGE_IMPUTED"), expect.objectContaining({ cache: "no-store" }))); });
function fixture(status = "PENDING_RST") {
  const mutations: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { if (init?.method === "POST") { mutations.push(JSON.parse(String(init.body))); return Response.json({ versionId: reviewId, status: "ACTIVE", previousVersionId: "previous" }); } return Response.json(url.includes(`/${reviewId}/`) ? { ...reviewDetail, status } : { versions: [reviewDetail], total: 1, offset: 0 }); }));
  return mutations;
}
it("shows provenance, conditions, sources, donor/age/diff and full detail; scopes compatible visible selection with explicit notes", async () => {
  const mutations = fixture(); render(<AssetVersionReview actor={actor} />); fireEvent.click(await screen.findByRole("button", { name: "Tinjau synthetic.xlsx" }));
  expect(await screen.findByText("SHA-256 sumber")).toBeVisible(); expect(screen.getByText("Distribusi kondisi P0–P4")).toBeVisible(); expect(screen.getByText("Sumber nilaiABC")).toBeVisible();
  fireEvent.click(screen.getByText("Bukti baris 2")); expect(screen.getAllByText(/"status": "AGE_IMPUTED"/)[0]).toBeVisible();
  expect(screen.getByRole("button", { name: "Setujui & aktifkan" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Pilih baris 2")); expect(screen.getByLabelText("Pilih baris 3")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Catatan keputusan"), { target: { value: "Periksa bukti sintetis" } }); fireEvent.click(screen.getByLabelText("Saya mengonfirmasi keputusan dan lingkup yang ditampilkan"));
  fireEvent.click(screen.getByRole("button", { name: "Akui baris terpilih" })); await waitFor(() => expect(mutations).toHaveLength(1));
  expect(mutations[0]).toMatchObject({ mode: "ACKNOWLEDGE", rowIds: [reviewDetail.rows[0].row.id], promoteMapping: false, notes: "Periksa bukti sintetis", filters: { offset: 0, filter: "ALL" } });
});
it("promotes mapping only through its separate checked control and requires confirmation", async () => { const mutations = fixture(); render(<AssetVersionReview actor={actor} />); fireEvent.click(await screen.findByRole("button", { name: "Tinjau synthetic.xlsx" })); await screen.findByLabelText("Catatan keputusan"); fireEvent.change(screen.getByLabelText("Catatan keputusan"), { target: { value: "Setujui snapshot" } }); fireEvent.click(screen.getByLabelText("Gunakan pemetaan untuk fingerprint identik berikutnya")); fireEvent.click(screen.getByLabelText("Saya mengonfirmasi keputusan dan lingkup yang ditampilkan")); fireEvent.click(screen.getByRole("button", { name: "Setujui & aktifkan" })); await waitFor(() => expect(mutations).toHaveLength(1)); expect(mutations[0]).toMatchObject({ promoteMapping: true, rowIds: [], mode: "ACTIVATE" }); expect(await screen.findByText(/Versi aktif:.*70000000/)).toBeVisible(); });
it("makes history read-only and hides trash from reviewers", async () => { fixture("HISTORICAL"); render(<AssetVersionReview actor={actor} />); fireEvent.click(await screen.findByRole("button", { name: "Tinjau synthetic.xlsx" })); expect(await screen.findByText("Versi riwayat hanya dapat dibaca.")).toBeVisible(); expect(screen.queryByRole("button", { name: "Setujui & aktifkan" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Pindahkan ke sampah" })).not.toBeInTheDocument(); });
it("shows independently fetched removed and changed before/after evidence with independent comparison pagination", async () => {
  const before = { ...reviewDetail.rows[0], value: { ...reviewDetail.rows[0].value, nilai_abc: 100 } }, after = { ...reviewDetail.rows[0], value: { ...reviewDetail.rows[0].value, nilai_abc: 200 } };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.includes("view=comparison") ? { changes: [{ id: "actual-change", identity: "ASSET:REMOVED", kind: "REMOVED", fields: [], before, after: null }, { id: "changed", identity: "ASSET:CHANGED", kind: "CHANGED", fields: ["nilaiABC"], before, after }], total: 102, offset: url.includes("offset=100") ? 100 : 0, hasMore: !url.includes("offset=100") } : url.includes(`/${reviewId}/`) ? reviewDetail : { versions: [reviewDetail], total: 1, offset: 0 })));
  render(<AssetVersionReview actor={actor} />); fireEvent.click(await screen.findByRole("button", { name: "Tinjau synthetic.xlsx" })); await screen.findByText("SHA-256 sumber");
  fireEvent.click(screen.getByRole("button", { name: "Muat perubahan versi" })); expect(await screen.findByText("ASSET:REMOVED")).toBeVisible(); expect(screen.getByLabelText("Sebelum ASSET:CHANGED")).toHaveTextContent("100"); expect(screen.getByLabelText("Sesudah ASSET:CHANGED")).toHaveTextContent("200");
  fireEvent.click(screen.getByRole("button", { name: "Perubahan berikutnya" })); await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(expect.stringMatching(/view=comparison.*offset=100/), expect.anything()));
  expect(screen.getByLabelText("Pilih baris 2")).toBeVisible();
});
it("pages wide mapping evidence without hiding review actions", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.includes("view=mapping") ? { columns: [{ source_column_index: 501, source_header: "WIDE_501" }], total: 16384, offset: 500, hasMore: true } : url.includes(`/${reviewId}/`) ? { ...reviewDetail, mapping: { ...reviewDetail.mapping, columns: [], total: 16384, offset: 400, hasMore: true } } : { versions: [reviewDetail], total: 1, offset: 0 })));
  render(<AssetVersionReview actor={actor} />); fireEvent.click(await screen.findByRole("button", { name: "Tinjau synthetic.xlsx" })); await screen.findByText("SHA-256 sumber");
  fireEvent.click(screen.getByRole("button", { name: "Kolom berikutnya" })); await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(expect.stringMatching(/view=mapping.*offset=500/), expect.anything()));
  fireEvent.click(screen.getByText("Provenance pemetaan & kolom")); expect(await screen.findByText(/WIDE_501/)).toBeVisible(); expect(screen.getByRole("button", { name: "Setujui & aktifkan" })).toBeVisible();
});
it("offers admin duplicate DRAFT trash with explicit notes/confirmation and no fabricated run token", async () => {
  const expected = { kind: "UNPROCESSED_DRAFT", unitId: reviewId, sourceFileId: reviewId, mappingRevision: reviewId, updatedAt: "2026-10-16T00:00:00Z" }, requests: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { if (init?.method === "POST") { requests.push(JSON.parse(String(init.body))); return Response.json({ versionId: reviewId, status: "TRASH", previousVersionId: null }); } return Response.json(url.includes(`/${reviewId}/`) ? { ...reviewDetail, status: "DRAFT", expected, eligibleDraftTrash: true, rows: [] } : { versions: [{ ...reviewDetail, status: "DRAFT" }], total: 1, offset: 0 }); }));
  render(<AssetVersionReview actor={{ ...actor, role: "RST_ADMIN" }} />); fireEvent.click(await screen.findByRole("button", { name: "Tinjau synthetic.xlsx" })); const button = await screen.findByRole("button", { name: "Pindahkan ke sampah" }); expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Catatan keputusan"), { target: { value: "Berkas duplikat terverifikasi" } }); fireEvent.click(screen.getByLabelText("Saya mengonfirmasi keputusan dan lingkup yang ditampilkan")); fireEvent.click(button);
  await waitFor(() => expect(requests).toHaveLength(1)); expect(requests[0]).toMatchObject({ expected, confirmed: true }); expect(JSON.stringify(requests[0])).not.toContain("runId");
});
