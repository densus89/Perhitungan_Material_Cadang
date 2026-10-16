import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ImportMappingStep } from "../../src/features/import/ImportMappingStep";
import { mapping } from "../fixtures/import-ui";
it("labels duplicate headers by index/letter, forbids reusing a source, and requires all required targets", () => {
  const changed = vi.fn(); const duplicate = { ...mapping, columns: mapping.columns.map((c, i) => i < 2 ? { ...c, header: "Unit" } : c) };
  const { rerender } = render(<ImportMappingStep mapping={duplicate} candidates={[duplicate]} confirmed={false} onChange={changed} onConfirm={vi.fn()} disabled={false} />);
  expect(screen.getAllByRole("option", { name: /A · 1 · Unit$/ }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("option", { name: /B · 2 · Unit$/ }).length).toBeGreaterThan(0);
  const upt = screen.getByLabelText("UPT (wajib)"); expect(upt.querySelector('option[value="1"]')).toBeDisabled();
  const incomplete = { ...duplicate, columns: duplicate.columns.map(c => c.field === "upt" ? { ...c, field: null } : c) };
  rerender(<ImportMappingStep mapping={incomplete} candidates={[incomplete]} confirmed={false} onChange={changed} onConfirm={vi.fn()} disabled={false} />);
  expect(screen.getByLabelText(/Saya mengonfirmasi pemetaan/)).toBeDisabled();
  fireEvent.change(screen.getByLabelText("UPT (wajib)"), { target: { value: "2" } }); expect(changed).toHaveBeenCalledWith(expect.objectContaining({ columns: expect.arrayContaining([expect.objectContaining({ columnIndex: 2, field: "upt" })]) }));
});
