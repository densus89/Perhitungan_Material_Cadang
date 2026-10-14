import { inviteUserSchema } from "../../../../../src/domain/user-admin";
import { adminMutation } from "../../../../../src/server/admin/http";
import { inviteUser } from "../../../../../src/server/admin/user-service";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return adminMutation(request, inviteUserSchema, inviteUser);
}
