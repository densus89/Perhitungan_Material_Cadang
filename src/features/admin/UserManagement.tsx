"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AppRole } from "../../domain/access";
import { appRoles, type ManagedUser, type ManagedUnit } from "../../domain/user-admin";

type MutationResult = { ok: boolean; message?: string };
type Mutate = (path: string, body: unknown, method: "POST" | "PATCH") => Promise<MutationResult>;
async function requestMutation(path: string, body: unknown, method: "POST" | "PATCH"): Promise<MutationResult> {
  const response = await fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  return { ok: response.ok, message: typeof result.message === "string" ? result.message : undefined };
}
function UnitChoices({ units, selected, onChange, prefix }: { units: ManagedUnit[]; selected: string[]; onChange: (ids: string[]) => void; prefix: string }) {
  return <fieldset><legend>Unit Induk</legend>{units.map((unit) => <label key={unit.id} htmlFor={`${prefix}-${unit.id}`}><input id={`${prefix}-${unit.id}`} type="checkbox" checked={selected.includes(unit.id)} onChange={(event) => onChange(event.target.checked ? [...selected, unit.id] : selected.filter((id) => id !== unit.id))} />{unit.name}</label>)}</fieldset>;
}
export function UserManagement({ role, users, units, currentUserId, mutate = requestMutation }: { role: AppRole; users: ManagedUser[]; units: ManagedUnit[]; currentUserId?: string; mutate?: Mutate }) {
  const router = useRouter();
  const [pending, setPending] = useState(false); const [notice, setNotice] = useState<MutationResult | null>(null);
  const [inviteRole, setInviteRole] = useState<AppRole>("VIEWER"); const [inviteUnits, setInviteUnits] = useState<string[]>([]);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const canManage = role === "RST_ADMIN";
  async function submit(path: string, body: unknown, method: "POST" | "PATCH") {
    if (pending) return;
    setPending(true); setNotice(null);
    try {
      const result = await mutate(path, body, method); setNotice({ ...result, message: result.message ?? (result.ok ? "Perubahan berhasil disimpan." : "Tidak dapat menyimpan akses.") });
      if (result.ok) { setEditing(null); router.refresh(); }
    } catch { setNotice({ ok: false, message: "Tidak dapat menyimpan akses. Silakan coba lagi." }); }
    finally { setPending(false); }
  }
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void submit("/api/admin/users/invite/", { email: form.get("email"), displayName: form.get("displayName"), role: inviteRole, unitIndukIds: inviteUnits }, "POST");
  }
  function update(user: ManagedUser, status = user.status) {
    void submit(`/api/admin/users/${encodeURIComponent(user.userId)}/`, { role: user.role, unitIndukIds: user.unitIndukIds, status }, "PATCH");
  }
  return <>
    <header className="page-heading"><div><p className="eyebrow">DIV RST</p><h1>Pengguna & akses</h1><p className="page-description">Kelola undangan, role, dan penugasan Unit Induk.</p></div></header>
    {pending && <p role="status">Memproses perubahan…</p>}
    {!pending && notice && <p role={notice.ok ? "status" : "alert"}>{notice.message}</p>}
    {canManage && <section className="panel feature-panel"><h2>Undang pengguna</h2><form onSubmit={invite}><fieldset disabled={pending} className="feature-stack"><legend>Undangan email PLN</legend>
      <label htmlFor="invite-email">Email PLN</label><input className="field-control" id="invite-email" name="email" type="email" autoComplete="email" required maxLength={254} />
      <label htmlFor="invite-name">Nama tampilan</label><input className="field-control" id="invite-name" name="displayName" required maxLength={150} />
      <label htmlFor="invite-role">Role undangan</label><select className="field-control" id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as AppRole)}>{appRoles.map((value) => <option key={value}>{value}</option>)}</select>
      <UnitChoices prefix="invite-unit" units={units} selected={inviteUnits} onChange={setInviteUnits} />
      <p className="section-note">UNIT_OPERATOR memerlukan setidaknya satu Unit Induk.</p><button className="button button--primary" type="submit">Undang pengguna</button>
    </fieldset></form></section>}
    <section className="panel feature-panel"><div className="table-scroll"><table className="data-table"><caption>Daftar pengguna aplikasi</caption><thead><tr>{["Email", "Nama", "Role", "Unit Induk", "Status", "Pembaruan terakhir", ...(canManage ? ["Tindakan"] : [])].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>
      {users.map((user) => <tr key={user.userId}><td>{user.email}</td><td>{user.displayName || "—"}</td><td>{user.role ?? "Belum ditetapkan"}</td><td>{user.unitIndukIds.map((id) => units.find((unit) => unit.id === id)?.name ?? id).join(", ") || "—"}</td><td>{user.status}</td><td><time dateTime={user.updatedAt}>{new Date(user.updatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</time></td>
        {canManage && <td>{user.userId !== currentUserId && <><button className="button" disabled={pending} onClick={() => setEditing({ ...user, role: user.role ?? "VIEWER" })} aria-label={`Ubah akses ${user.email}`}>Ubah akses</button>{user.status !== "DISABLED" && <button className="button" disabled={pending || !user.role} onClick={() => update(user, "DISABLED")} aria-label={`Nonaktifkan ${user.email}`}>Nonaktifkan</button>}</>}</td>}
      </tr>)}
      {!users.length && <tr><td colSpan={canManage ? 7 : 6}>Belum ada pengguna.</td></tr>}
    </tbody></table></div></section>
    {canManage && editing && <section className="panel feature-panel" aria-labelledby="edit-access-title"><h2 id="edit-access-title">Ubah akses {editing.email}</h2><form onSubmit={(event) => { event.preventDefault(); update(editing); }}><fieldset disabled={pending} className="feature-stack"><legend>Akses pengguna</legend>
      <label htmlFor="edit-role">Role pengguna</label><select id="edit-role" className="field-control" value={editing.role ?? "VIEWER"} onChange={(event) => setEditing({ ...editing, role: event.target.value as AppRole })}>{appRoles.map((value) => <option key={value}>{value}</option>)}</select>
      <UnitChoices prefix="edit-unit" units={units} selected={editing.unitIndukIds} onChange={(unitIndukIds) => setEditing({ ...editing, unitIndukIds })} />
      <label htmlFor="edit-status">Status pengguna</label><select id="edit-status" className="field-control" value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value as ManagedUser["status"] })}>{(editing.status === "INVITED" ? ["INVITED", "DISABLED"] : ["ACTIVE", "DISABLED"]).map((status) => <option key={status}>{status}</option>)}</select>
      <button className="button button--primary" type="submit">Simpan akses</button><button className="button" type="button" onClick={() => setEditing(null)}>Batal</button>
    </fieldset></form></section>}
  </>;
}
