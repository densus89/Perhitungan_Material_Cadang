// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { completeInvite, requestPasswordReset, signIn, signOut, type AuthGateway } from "../../../src/server/auth/service";

vi.mock("server-only", () => ({}));

function gateway() {
  return {
    auth: {
      signInWithPassword: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      getUser: vi.fn(async () => ({ data: { user: { email: "operator@pln.co.id" } }, error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    rpc: vi.fn(async () => ({ error: null })),
  } satisfies AuthGateway;
}

const passwords = { password: "a-valid-password-123", confirmPassword: "a-valid-password-123" };

describe("PLN authentication service", () => {
  it.each(["user@evilpln.co.id", "user@pln.co.id.evil", "user@sub.pln.co.id", "", "user@@pln.co.id"])("rejects %s before a sign-in or reset gateway call", async (email) => {
    const client = gateway();
    expect(await signIn({ email, password: passwords.password }, client)).toMatchObject({ status: "error", fieldErrors: { email: expect.any(String) } });
    expect(await requestPasswordReset({ email, siteUrl: "http://localhost:3000" }, client)).toMatchObject({ status: "error", fieldErrors: { email: expect.any(String) } });
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(client.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("normalizes PLN email but preserves password bytes", async () => {
    const client = gateway();
    expect(await signIn({ email: " Operator@PLN.CO.ID ", password: "  private password  " }, client)).toMatchObject({ status: "success" });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: "operator@pln.co.id", password: "  private password  " });
  });

  it("allows and normalizes the approved Gmail guest for sign-in and recovery", async () => {
    const client = gateway();
    const email = "  Sitompul89@GMAIL.COM  ";
    expect(await signIn({ email, password: passwords.password }, client)).toMatchObject({ status: "success" });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: "sitompul89@gmail.com", password: passwords.password });
    expect(await requestPasswordReset({ email, siteUrl: "http://localhost:3000" }, client)).toMatchObject({ status: "success" });
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith("sitompul89@gmail.com", { redirectTo: "http://localhost:3000/auth/callback?next=/auth/set-password" });
  });

  it("rejects missing passwords without calling Auth", async () => {
    const client = gateway();
    expect(await signIn({ email: "user@pln.co.id", password: "" }, client)).toMatchObject({ status: "error", fieldErrors: { password: expect.any(String) } });
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("uses the same generic credential response for absent accounts, wrong passwords and thrown errors", async () => {
    const results = [];
    for (const failure of ["User not found secret", "Invalid credentials secret", "network secret"]) {
      const client = gateway();
      client.auth.signInWithPassword.mockRejectedValueOnce(new Error(failure));
      results.push(await signIn({ email: "user@pln.co.id", password: passwords.password }, client));
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(results[0]).toMatchObject({ status: "error", message: "Email atau kata sandi tidak valid. Silakan coba lagi." });
    expect(JSON.stringify(results)).not.toContain("secret");
    const client = gateway();
    client.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: "secret" } } as never);
    expect(await signIn({ email: "user@pln.co.id", password: passwords.password }, client)).toEqual(results[0]);
  });

  it("requests the exact recovery callback and gives identical status for every account outcome", async () => {
    const client = gateway();
    const input = { email: " Operator@PLN.CO.ID ", siteUrl: "http://localhost:3000" };
    const success = await requestPasswordReset(input, client);
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith("operator@pln.co.id", { redirectTo: "http://localhost:3000/auth/callback?next=/auth/set-password" });
    client.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: { message: "account missing secret" } } as never);
    expect(await requestPasswordReset(input, client)).toEqual(success);
    client.auth.resetPasswordForEmail.mockRejectedValueOnce(new Error("secret"));
    expect(await requestPasswordReset(input, client)).toEqual(success);
    expect(success).toMatchObject({ status: "success", message: "Jika akun memenuhi syarat, tautan pemulihan akan dikirim ke email PLN tersebut." });
  });

  it.each([
    { password: "short", confirmPassword: "short" },
    { password: passwords.password, confirmPassword: "different-password" },
  ])("rejects invalid password setup before any gateway call: %j", async (input) => {
    const client = gateway();
    expect(await completeInvite(input, client)).toMatchObject({ status: "error", fieldErrors: expect.any(Object) });
    expect(client.auth.getUser).not.toHaveBeenCalled();
    expect(client.auth.updateUser).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("accepts exactly twelve characters and updates before activating the profile", async () => {
    const client = gateway();
    expect(await completeInvite({ password: "123456789012", confirmPassword: "123456789012" }, client)).toMatchObject({ status: "success" });
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: "123456789012" });
    expect(client.rpc).toHaveBeenCalledWith("activate_my_profile");
    expect(client.auth.getUser.mock.invocationCallOrder[0]).toBeLessThan(client.auth.updateUser.mock.invocationCallOrder[0]);
    expect(client.auth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(client.rpc.mock.invocationCallOrder[0]);
  });

  it.each([null, { email: "user@evil.example" }, {}])("refuses password mutation for invalid sessions: %j", async (user) => {
    const client = gateway();
    client.auth.getUser.mockResolvedValueOnce({ data: { user }, error: null } as never);
    expect(await completeInvite(passwords, client)).toMatchObject({ status: "error" });
    expect(client.auth.updateUser).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when session verification errors", async () => {
    const client = gateway();
    client.auth.getUser.mockRejectedValueOnce(new Error("secret"));
    expect(await completeInvite(passwords, client)).toMatchObject({ status: "error" });
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it("does not activate after a failed password update or expose backend details", async () => {
    const client = gateway();
    client.auth.updateUser.mockResolvedValueOnce({ error: { message: "secret" } } as never);
    const result = await completeInvite(passwords, client);
    expect(result).toMatchObject({ status: "error" });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("clears the local session after activation fails without claiming success or rolling back the password", async () => {
    const client = gateway();
    client.rpc.mockRejectedValueOnce(new Error("secret"));
    const result = await completeInvite(passwords, client);
    expect(result).toMatchObject({ status: "error", message: expect.stringMatching(/kata sandi telah disimpan/i) });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(client.auth.updateUser).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("logs out locally and returns a safe error if logout fails", async () => {
    const client = gateway();
    expect(await signOut(client)).toMatchObject({ status: "success" });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    client.auth.signOut.mockRejectedValueOnce(new Error("secret"));
    const result = await signOut(client);
    expect(result).toMatchObject({ status: "error" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
