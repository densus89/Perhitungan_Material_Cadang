import type { Actor } from "../../src/domain/access";

export const workspaceActor: Actor = {
  userId: "workspace-user", email: "operator@pln.co.id", displayName: "Operator Perencanaan",
  role: "UNIT_OPERATOR", status: "ACTIVE", unitIndukIds: ["unit-jbb", "unit-jbt"],
};

export const workspaceUnits = [
  { id: "unit-jbb", name: "UIT Jawa Bagian Barat" },
  { id: "unit-jbt", name: "UIT Jawa Bagian Tengah" },
];
