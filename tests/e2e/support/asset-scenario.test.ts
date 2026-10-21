// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Page, Request, Response } from "@playwright/test";
import { continueAssetProcessing, type AssetScenario } from "./asset-scenario";

const id = "20000000-0000-4000-8000-000000000001";

describe("asset scenario process watchdog", () => {
  it("starts the response timeout only after the process request begins", async () => {
    const listeners = new Map<string, Set<(value: never) => void>>();
    const request = {
      method: () => "POST",
      url: () => `http://127.0.0.1:3000/api/imports/${id}/process/`,
    } as Request;
    const response = {
      request: () => request,
      status: () => 200,
      json: async () => ({ importId: id, datasetId: id, versionId: id, stage: "READY_TO_SUBMIT" }),
    } as Response;
    const emit = (event: string, value: Request | Response) => {
      for (const listener of listeners.get(event) ?? []) listener(value as never);
    };
    const page = {
      on(event: string, listener: (value: never) => void) {
        const eventListeners = listeners.get(event) ?? new Set();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
      },
      off(event: string, listener: (value: never) => void) {
        listeners.get(event)?.delete(listener);
      },
      getByRole() {
        return {
          async click() {
            await new Promise(resolve => setTimeout(resolve, 30));
            emit("request", request);
            await new Promise(resolve => setTimeout(resolve, 1));
            emit("response", response);
          },
        };
      },
    } as unknown as Page;
    const scenario = { processResponses: [], processDurationsMs: [] } as unknown as AssetScenario;

    await expect(continueAssetProcessing(page, scenario, { processTimeoutMs: 20 })).resolves.toMatchObject({
      stage: "READY_TO_SUBMIT",
    });
    expect(scenario.processResponses).toHaveLength(1);
  });
});
