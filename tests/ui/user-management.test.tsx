import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UserManagement } from "../../src/features/admin/UserManagement";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const users = [{ userId: "30000000-0000-4000-8000-000000000002", email: "operator@pln.co.id", displayName: "Operator A", role: "UNIT_OPERATOR" as const, unitIndukIds: ["31000000-0000-4000-8000-000000000001"], status: "ACTIVE" as const, updatedAt: "2026-10-14T00:00:00Z" }];
const units = [{ id: "31000000-0000-4000-8000-000000000001", code: "A", name: "Unit A" }];
describe("user management", () => {
  it("shows account details in a labeled table", () => {
    render(<UserManagement role="VIEWER" users={users} units={units} />);
    for (const heading of ["Email", "Nama", "Role", "Unit Induk", "Status", "Pembaruan terakhir"]) expect(screen.getByRole("columnheader", { name: heading })).toBeInTheDocument();
    for (const value of ["operator@pln.co.id", "Operator A", "UNIT_OPERATOR", "Unit A", "ACTIVE"]) expect(screen.getByRole("cell", { name: value })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /14/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /undang|nonaktifkan/i })).not.toBeInTheDocument();
  });
  it("assigns role and units and refreshes after a successful invitation", async () => {
    let received: unknown;
    render(<UserManagement role="RST_ADMIN" users={users} units={units} mutate={async (_path, body) => { received = body; return { ok: true }; }} />);
    fireEvent.change(screen.getByLabelText("Email PLN"), { target: { value: "new@pln.co.id" } }); fireEvent.change(screen.getByLabelText("Nama tampilan"), { target: { value: "New" } });
    fireEvent.change(screen.getByLabelText("Role undangan"), { target: { value: "UNIT_OPERATOR" } }); fireEvent.click(screen.getByLabelText("Unit A")); fireEvent.click(screen.getByRole("button", { name: "Undang pengguna" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/berhasil/i));
    expect(received).toEqual({ email: "new@pln.co.id", displayName: "New", role: "UNIT_OPERATOR", unitIndukIds: [units[0].id] }); expect(refresh).toHaveBeenCalled();
  });
  it("announces pending and safe errors accessibly", async () => {
    let finish!: (result: { ok: boolean; message?: string }) => void;
    render(<UserManagement role="RST_ADMIN" users={users} units={units} mutate={async () => new Promise((resolve) => { finish = resolve; })} />);
    fireEvent.click(screen.getByRole("button", { name: /nonaktifkan/i })); await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/memproses/i));
    expect(screen.getByRole("button", { name: /nonaktifkan/i })).toBeDisabled();
    await act(async () => finish({ ok: false, message: "Tidak dapat menyimpan akses." })); expect(screen.getByRole("alert")).toHaveTextContent("Tidak dapat menyimpan akses.");
  });
});
