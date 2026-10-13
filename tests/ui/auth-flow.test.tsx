import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginForm } from "../../src/features/auth/LoginForm";
import { ForgotPasswordForm } from "../../src/features/auth/ForgotPasswordForm";
import { SetPasswordForm } from "../../src/features/auth/SetPasswordForm";
import { LogoutButton } from "../../src/features/auth/LogoutButton";
import type { AuthFormState } from "../../src/features/auth/types";

const credentialError: AuthFormState = { status: "error", message: "Email atau kata sandi tidak valid. Silakan coba lagi." };
const resetStatus: AuthFormState = { status: "success", message: "Jika akun memenuhi syarat, tautan pemulihan akan dikirim ke email PLN tersebut." };

describe("accessible Indonesian authentication flows", () => {
  it("labels credentials, supplies autocomplete and links to recovery with no public registration", () => {
    render(<LoginForm action={async () => credentialError} />);
    expect(screen.getByLabelText("Email PLN")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Kata sandi")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("link", { name: "Lupa kata sandi?" })).toHaveAttribute("href", "/auth/forgot-password/");
    expect(screen.queryByRole("link", { name: /daftar/i })).not.toBeInTheDocument();
  });

  it("disables login while pending then announces the generic credential error without retaining passwords in state", async () => {
    let finish!: (state: AuthFormState) => void;
    let received: FormData | undefined;
    render(<LoginForm action={async (_state, data) => { received = data; return new Promise((resolve) => { finish = resolve; }); }} />);
    fireEvent.change(screen.getByLabelText("Email PLN"), { target: { value: "user@pln.co.id" } });
    fireEvent.change(screen.getByLabelText("Kata sandi"), { target: { value: "private-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /memproses/i })).toBeDisabled());
    expect(screen.getByLabelText("Email PLN")).toBeDisabled();
    expect(received?.get("password")).toBe("private-password");
    await act(async () => finish(credentialError));
    expect(screen.getByRole("alert")).toHaveTextContent(credentialError.message!);
    expect(screen.getByRole("button", { name: "Masuk" })).toBeEnabled();
    expect(screen.queryByText("private-password")).not.toBeInTheDocument();
  });

  it("announces server field errors and connects them to the email input", async () => {
    render(<LoginForm action={async () => ({ status: "error", fieldErrors: { email: "Gunakan email dengan domain @pln.co.id." } })} />);
    fireEvent.change(screen.getByLabelText("Email PLN"), { target: { value: "user@other.example" } });
    fireEvent.change(screen.getByLabelText("Kata sandi"), { target: { value: "private-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
    await waitFor(() => expect(screen.getByLabelText("Email PLN")).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByLabelText("Email PLN")).toHaveAccessibleDescription("Gunakan email dengan domain @pln.co.id.");
    expect(screen.getByRole("alert")).toHaveTextContent("@pln.co.id");
  });

  it("requires password confirmation and uses new-password autocomplete with a twelve-character minimum", () => {
    render(<SetPasswordForm action={async () => ({ status: "idle" })} />);
    for (const label of ["Kata sandi baru", "Konfirmasi kata sandi"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("autocomplete", "new-password");
      expect(screen.getByLabelText(label)).toHaveAttribute("minlength", "12");
      expect(screen.getByLabelText(label)).toBeRequired();
    }
  });

  it("shows setup errors and prevents duplicate submissions while setting a password", async () => {
    let finish!: (state: AuthFormState) => void;
    render(<SetPasswordForm action={async () => new Promise((resolve) => { finish = resolve; })} />);
    fireEvent.change(screen.getByLabelText("Kata sandi baru"), { target: { value: "private-password" } });
    fireEvent.change(screen.getByLabelText("Konfirmasi kata sandi"), { target: { value: "private-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan kata sandi" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /memproses/i })).toBeDisabled());
    await act(async () => finish({ status: "error", fieldErrors: { confirmPassword: "Konfirmasi kata sandi harus sama." } }));
    expect(screen.getByRole("alert")).toHaveTextContent("Konfirmasi kata sandi harus sama.");
    expect(screen.getByLabelText("Konfirmasi kata sandi")).toHaveAttribute("aria-invalid", "true");
  });

  it.each(["unknown@pln.co.id", "existing@pln.co.id"])("announces the same recovery status for %s", async (email) => {
    render(<ForgotPasswordForm action={async () => resetStatus} />);
    expect(screen.getByLabelText("Email PLN")).toHaveAttribute("autocomplete", "email");
    fireEvent.change(screen.getByLabelText("Email PLN"), { target: { value: email } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim tautan pemulihan" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(resetStatus.message!));
    expect(screen.queryByText(/akun tidak ditemukan|email tidak terdaftar/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kembali ke login" })).toHaveAttribute("href", "/login/");
  });

  it("disables logout while pending and announces failures", async () => {
    let finish!: (state: AuthFormState) => void;
    render(<LogoutButton action={async () => new Promise((resolve) => { finish = resolve; })} />);
    fireEvent.click(screen.getByRole("button", { name: "Keluar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /memproses/i })).toBeDisabled());
    await act(async () => finish({ status: "error", message: "Tidak dapat keluar. Silakan coba lagi." }));
    expect(screen.getByRole("alert")).toHaveTextContent("Tidak dapat keluar.");
  });
});
