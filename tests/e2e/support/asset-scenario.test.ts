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

  it("reports a visible UI failure when no process request begins", async () => {
    const page = {
      on() {},
      off() {},
      getByRole(role: string) {
        if (role === "alert") {
          const visible = {
            waitFor: async () => undefined,
            innerText: async () => "Respons terputus sebelum pemrosesan dimulai.",
          };
          return {
            waitFor: async () => undefined,
            innerText: async () => "",
            filter: () => visible,
          };
        }
        return { click: async () => undefined };
      },
    } as unknown as Page;
    const scenario = { processResponses: [], processDurationsMs: [] } as unknown as AssetScenario;

    const outcome = await Promise.race([
      continueAssetProcessing(page, scenario, { processTimeoutMs: 20 }).then(
        () => "resolved",
        error => error instanceof Error ? error.message : "unknown error",
      ),
      new Promise<string>(resolve => setTimeout(() => resolve("helper hung"), 50)),
    ]);

    expect(outcome).toBe("Synthetic processing request did not start: Respons terputus sebelum pemrosesan dimulai.");
  });

  it("uses a separate pre-process budget before the first process request", async () => {
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
      getByRole(role: string) {
        if (role === "alert") {
          return {
            filter: () => ({
              waitFor: ({ timeout }: { timeout: number }) => new Promise((_, reject) => setTimeout(() => reject(new Error("hidden")), timeout)),
              innerText: async () => "",
            }),
          };
        }
        return {
          async click() {
            setTimeout(() => {
              emit("request", request);
              setTimeout(() => emit("response", response), 1);
            }, 30);
          },
        };
      },
    } as unknown as Page;
    const scenario = { processResponses: [], processDurationsMs: [] } as unknown as AssetScenario;
    const options = { processTimeoutMs: 20, startTimeoutMs: 60 };

    await expect(continueAssetProcessing(page, scenario, options)).resolves.toMatchObject({
      stage: "READY_TO_SUBMIT",
    });
  });

  it("reports a non-success process status without waiting for its body", async () => {
    const listeners = new Map<string, Set<(value: never) => void>>();
    const request = {
      method: () => "POST",
      url: () => `http://127.0.0.1:3000/api/imports/${id}/process/`,
    } as Request;
    const response = {
      request: () => request,
      status: () => 409,
      json: () => new Promise<never>(() => undefined),
    } as unknown as Response;
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
            emit("request", request);
            emit("response", response);
          },
        };
      },
    } as unknown as Page;
    const scenario = { processResponses: [], processDurationsMs: [] } as unknown as AssetScenario;

    await expect(continueAssetProcessing(page, scenario, { processTimeoutMs: 20 })).rejects.toThrow(
      "Synthetic processing failed with HTTP 409",
    );
  });
});
