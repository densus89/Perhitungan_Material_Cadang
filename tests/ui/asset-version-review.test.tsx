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
  fireEvent.click(screen.getByText("Bukti baris 2")); expect(screen.getAllByText(/median/)[0]).toBeVisible();
  expect(screen.getByRole("button", { name: "Setujui & aktifkan" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Pilih baris 2")); expect(screen.getByLabelText("Pilih baris 3")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Catatan keputusan"), { target: { value: "Periksa bukti sintetis" } }); fireEvent.click(screen.getByLabelText("Saya mengonfirmasi keputusan dan lingkup yang ditampilkan"));
  fireEvent.click(screen.getByRole("button", { name: "Akui baris terpilih" })); await waitFor(() => expect(mutations).toHaveLength(1));
  expect(mutations[0]).toMatchObject({ mode: "ACKNOWLEDGE", rowIds: [reviewDetail.rows[0].row.id], promoteMapping: false, notes: "Periksa bukti sintetis", filters: { offset: 0, filter: "ALL" } });
});
it("promotes mapping only through its separate checked control and requires confirmation", async () => { const mutations = fixture(); render(<AssetVersionReview actor={actor} />); fireEvent.click(await screen.findByRole("button", { name: "Tinjau synthetic.xlsx" })); await screen.findByLabelText("Catatan keputusan"); fireEvent.change(screen.getByLabelText("Catatan keputusan"), { target: { value: "Setujui snapshot" } }); fireEvent.click(screen.getByLabelText("Gunakan pemetaan untuk fingerprint identik berikutnya")); fireEvent.click(screen.getByLabelText("Saya mengonfirmasi keputusan dan lingkup yang ditampilkan")); fireEvent.click(screen.getByRole("button", { name: "Setujui & aktifkan" })); await waitFor(() => expect(mutations).toHaveLength(1)); expect(mutations[0]).toMatchObject({ promoteMapping: true, rowIds: [], mode: "ACTIVATE" }); expect(await screen.findByText(/Versi aktif:.*70000000/)).toBeVisible(); });
it("makes history read-only and hides trash from reviewers", async () => { fixture("HISTORICAL"); render(<AssetVersionReview actor={actor} />); fireEvent.click(await screen.findByRole("button", { name: "Tinjau synthetic.xlsx" })); expect(await screen.findByText("Versi riwayat hanya dapat dibaca.")).toBeVisible(); expect(screen.queryByRole("button", { name: "Setujui & aktifkan" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Pindahkan ke sampah" })).not.toBeInTheDocument(); });
