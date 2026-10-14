import { parseE2eEnvironment } from "./support/environment";
import { cleanupSyntheticE2EUsers, createE2EAdminClient } from "./support/users";

export default async function globalTeardown(): Promise<void> {
  const environment = parseE2eEnvironment(process.env);
  try {
    await cleanupSyntheticE2EUsers(createE2EAdminClient(environment));
  } catch {
    throw new Error("Synthetic E2E teardown failed without deleting any unverified user");
  }
}
