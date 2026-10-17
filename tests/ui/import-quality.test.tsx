import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ImportQualityStep } from "../../src/features/import/ImportQualityStep";
import { ImportComparisonStep } from "../../src/features/import/ImportComparisonStep";
import { base } from "../fixtures/import-ui";
const summary = { rowCount: 3, blockingErrors: 1, warningCount: 1, conditions: {}, valueSources: {}, issueCounts: { AGE_IMPUTED: 1 }, totalNilaiABC: 100 };
it("explains the downstream five-class contract and keeps nilaiABC separate from new acquisition price", () => {
  render(<ImportQualityStep summary={summary} filter="ALL" onFilter={vi.fn()} acknowledged={false} onAcknowledge={vi.fn()} onNext={vi.fn()} onPage={vi.fn()} disabled={false} />);
  expect(screen.getByText(/nilaiABC adalah nilai buku/)).toHaveTextContent(/Harga pengadaan.*terpisah.*Optimum Spare.*A2.*B1/);
  expect(screen.getByText(/A1, A2, B1, B2, dan C/)).toHaveTextContent(/C.*tanpa alokasi/);
});
const review = { totalRows: 3, offset: 0, hasMore: false, rows: [{ rowNumber: 2, equipment: "Actual zero", errors: [], warnings: [], value: 0, valueSource: "SAP_BOOK_VALUE", ageImputed: false, evidence: { donorCount: 0 } }, { rowNumber: 3, equipment: "Estimated", errors: [], warnings: ["AGE_IMPUTED"], value: 100, valueSource: "ESTIMATED_SAME_GI", ageImputed: true, evidence: { donorCount: 3, tier: "SAME_GI", referencePrice: 200 } }, { rowNumber: 4, equipment: "Bad formula", errors: ["FORMULA_ERROR"], warnings: [], value: null, valueSource: "UNRESOLVED", ageImputed: false, evidence: { donorCount: 0 } }] };
it("filters authoritative errors/warnings, preserves actual zero and presents sanitized donor evidence", () => {
  const change = vi.fn(); render(<ImportQualityStep summary={summary} review={review} filter="ALL" onFilter={change} acknowledged={false} onAcknowledge={vi.fn()} onNext={vi.fn()} onPage={vi.fn()} disabled={false} />);
  expect(within(screen.getByRole("row", { name: /Actual zero/ })).getByText("0")).toBeVisible();
  expect(screen.getByText(/3 donor/)).toBeVisible(); expect(screen.getByText("FORMULA_ERROR")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Filter kualitas"), { target: { value: "ERROR" } }); expect(change).toHaveBeenCalledWith("ERROR");
  expect(screen.getByRole("button", { name: "Tinjau perbandingan" })).toBeDisabled(); expect(screen.getByLabelText(/Saya memahami usia/)).toBeVisible();
});
it("shows full-snapshot comparison and requests DIV RST approval only after age acknowledgement", () => {
  const response = { ...base, stage: "READY_TO_SUBMIT" as const, summary: { ...summary, blockingErrors: 0 }, comparison: { counts: { ADDED: 2, REMOVED: 1, CHANGED: 3 }, sourceShifts: { SAP_BOOK_VALUE: -1, ESTIMATED_SAME_GI: 2 }, hasActiveVersion: true } };
  const { rerender } = render(<ImportComparisonStep response={response} acknowledged={false} onSubmit={vi.fn()} disabled={false} />);
  expect(screen.getByText(/snapshot lengkap/i)).toBeVisible(); expect(screen.getByText(/Dihapus: 1/)).toBeVisible(); expect(screen.getByText(/Ditambah: 2/)).toBeVisible(); expect(screen.getByText(/Berubah: 3/)).toBeVisible(); expect(screen.getByText(/SAP_BOOK_VALUE/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Ajukan persetujuan DIV RST" })).toBeDisabled();
  rerender(<ImportComparisonStep response={response} acknowledged={true} onSubmit={vi.fn()} disabled={false} />); expect(screen.getByRole("button", { name: "Ajukan persetujuan DIV RST" })).toBeEnabled();
});
it("exposes issue, source, condition and explicit equipment search as server query filters", () => {
  const options = vi.fn();
  render(<ImportQualityStep summary={{ ...summary, valueSources: { SAP_BOOK_VALUE: 2 }, conditions: { P2: 3 } }} review={review} filter="ALL" onFilter={vi.fn()} options={{}} onOptions={options} acknowledged={false} onAcknowledge={vi.fn()} onNext={vi.fn()} onPage={vi.fn()} disabled={false} />);
  fireEvent.change(screen.getByLabelText("Kode temuan"), { target: { value: "AGE_IMPUTED" } }); expect(options).toHaveBeenCalledWith({ issue: "AGE_IMPUTED" });
  fireEvent.change(screen.getByLabelText("Sumber nilai"), { target: { value: "SAP_BOOK_VALUE" } }); expect(options).toHaveBeenCalledWith({ source: "SAP_BOOK_VALUE" });
  fireEvent.change(screen.getByLabelText("Kondisi aset"), { target: { value: "P2" } }); expect(options).toHaveBeenCalledWith({ condition: "P2" });
  fireEvent.change(screen.getByLabelText("Cari peralatan"), { target: { value: "TRAFO%_" } });
  fireEvent.submit(screen.getByRole("form", { name: "Pencarian peralatan" })); expect(options).toHaveBeenCalledWith({ search: "TRAFO%_" });
});
