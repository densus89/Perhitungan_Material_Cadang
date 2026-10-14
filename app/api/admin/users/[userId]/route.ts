import { updateUserAccessSchema } from "../../../../../src/domain/user-admin";
import { adminMutation } from "../../../../../src/server/admin/http";
import { updateUserAccess } from "../../../../../src/server/admin/user-service";

export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  return adminMutation(request, updateUserAccessSchema, updateUserAccess, await context.params);
}
