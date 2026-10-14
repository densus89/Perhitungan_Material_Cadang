import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as browser from "../../src/lib/supabase/browser";
import { MfaSetup } from "../../src/features/auth/MfaSetup";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const mfa = {
  getAuthenticatorAssuranceLevel: vi.fn(), listFactors: vi.fn(), enroll: vi.fn(),
  challengeAndVerify: vi.fn(), unenroll: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(browser, "createBrowserSupabaseClient").mockReturnValue({ auth: { mfa } } as never);
  mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
  mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [], phone: [] }, error: null });
  mfa.unenroll.mockResolvedValue({ data: {}, error: null });
});

describe("admin MFA setup", () => {
  it("challenges an existing verified TOTP factor", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "factor-1", factor_type: "totp", status: "verified" }], totp: [{ id: "factor-1", factor_type: "totp", status: "verified" }], phone: [] }, error: null });
    mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    render(<MfaSetup />);
    expect(await screen.findByRole("heading", { name: /verifikasi/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/kode autentikator/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verifikasi dan lanjutkan/i }));
    await waitFor(() => expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "factor-1", code: "123456" }));
    expect(navigation.replace).toHaveBeenCalledWith("/");
  });

  it("enrolls a fresh factor, removes only stale unverified factors, and displays its QR and secret", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "stale", factor_type: "totp", status: "unverified" }], totp: [], phone: [] }, error: null });
    mfa.enroll.mockResolvedValue({ data: { id: "new-factor", type: "totp", totp: { qr_code: "data:image/svg+xml;utf-8,fixture", secret: "SAFESECRET", uri: "otpauth://fixture" } }, error: null });
    render(<MfaSetup />);
    fireEvent.click(await screen.findByRole("button", { name: /siapkan autentikator/i }));
    expect(await screen.findByRole("img", { name: /qr/i })).toHaveAttribute("src", "data:image/svg+xml;utf-8,fixture");
    expect(screen.getByText("SAFESECRET")).toBeInTheDocument();
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "stale" });
    expect(mfa.enroll).toHaveBeenCalledWith({ factorType: "totp", friendlyName: "Material Cadang DIV RST", issuer: "PLN Material Cadang" });
  });

  it("redirects an already elevated session and reports provider failures generically", async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null });
    const view = render(<MfaSetup />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/"));
    view.unmount(); navigation.replace.mockClear();
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({ data: null, error: { message: "private provider detail" } });
    render(<MfaSetup />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Tidak dapat memeriksa keamanan akun");
    expect(document.body).not.toHaveTextContent("private provider detail");
  });
});
