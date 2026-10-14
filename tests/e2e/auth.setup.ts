import { parseE2eEnvironment, safeE2eFailure } from "./support/environment";
import {
  cleanupSyntheticE2EUsers,
  createE2EAdminClient,
  provisionSyntheticE2EUsers,
} from "./support/users";

export default async function globalSetup(): Promise<void> {
  const environment = parseE2eEnvironment(process.env);
  const client = createE2EAdminClient(environment);
  try {
    await provisionSyntheticE2EUsers(client, environment.password);
  } catch (error) {
    try {
      await cleanupSyntheticE2EUsers(client);
    } catch {
      throw new Error("Synthetic E2E setup failed and cleanup could not be verified");
    }
    throw new Error(`${safeE2eFailure(error, "Synthetic E2E setup failed")}; exact test users were removed`);
  }
}
