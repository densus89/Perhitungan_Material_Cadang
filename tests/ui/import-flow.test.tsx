import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportWorkspace } from "../../src/features/import/ImportWorkspace";
import { units, id, base, mapping, preview, FakeWorker } from "../fixtures/import-ui";
import { useAssetImport } from "../../src/features/import/useAssetImport";
const network = vi.hoisted(() => ({ fetch: vi.fn(), upload: vi.fn() }));
vi.mock("../../src/lib/supabase/browser", () => ({ createBrowserSupabaseClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: network.upload }) } }) }));
beforeEach(() => { FakeWorker.instances = []; vi.stubGlobal("Worker", FakeWorker); vi.stubGlobal("fetch", network.fetch); network.fetch.mockReset(); network.upload.mockReset().mockResolvedValue({ error: null }); });
function selectFile(file = new File(["synthetic"], "snapshot.xlsx")) { fireEvent.change(screen.getByLabelText("Berkas snapshot XLSX"), { target: { files: [file] } }); }
describe("persistent asset import", () => {
  it("continues processing sequentially until the authoritative final response", async () => {
    const processing = (completedRows: number, completedChunks: number) => ({ ...base, stage: "PROCESSING", progress: { completedRows, expectedRows: 50_000, completedChunks, expectedChunks: 25, percent: Math.floor(completedRows / 500) } });
    const summary = { rowCount: 50_000, blockingErrors: 0, warningCount: 0, conditions: {}, valueSources: {}, issueCounts: {}, totalNilaiABC: 0 };
    network.fetch.mockResolvedValueOnce(Response.json({ ...base, stage: "READY_TO_PROCESS", layout: mapping }))
      .mockResolvedValueOnce(Response.json(processing(24_000, 12), { status: 202 }))
      .mockResolvedValueOnce(Response.json(processing(48_000, 24), { status: 202 }))
      .mockResolvedValueOnce(Response.json({ ...base, stage: "READY_TO_SUBMIT", summary }));
    const { result } = renderHook(() => useAssetImport([], units));
    await act(async () => result.current.resume({ ...base, unitId: units[0].id, fileName: "stored.xlsx", createdAt: "2026-10-16T00:00:00Z", stage: "READY_TO_PROCESS", rowCount: 50_000 }));
    await act(async () => result.current.retry());
    expect(network.fetch.mock.calls.filter(([url, options]) => url.endsWith("/process/") && options.method === "POST")).toHaveLength(3);
    expect(result.current.response).toMatchObject({ stage: "READY_TO_SUBMIT", summary: { rowCount: 50_000 } });
    expect(result.current.busy).toBe(false);
  });
  it("shows persisted row progress and offers one keyboard-accessible manual continuation", async () => {
    const progress = { completedRows: 2_000, expectedRows: 6_000, completedChunks: 1, expectedChunks: 3, percent: 33 };
    let finish!: (response: Response) => void;
    network.fetch.mockResolvedValueOnce(Response.json({ ...base, stage: "PROCESSING", progress })).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<ImportWorkspace actorUnits={units} initialDrafts={[{ ...base, unitId: units[0].id, fileName: "processing.xlsx", createdAt: "2026-10-16T00:00:00Z", stage: "PROCESSING", rowCount: 6_000, progress }]} />);
    expect(screen.getByText(/2\.000 dari 6\.000 baris/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Lanjutkan processing.xlsx" }));
    const action = await screen.findByRole("button", { name: "Lanjutkan proses" });
    expect(screen.getByRole("progressbar", { name: "Progres pemrosesan aset" })).toHaveAttribute("value", "2000");
    fireEvent.click(action); expect(action).toBeDisabled();
    await act(async () => finish(Response.json({ ...base, stage: "READY_TO_SUBMIT", summary: { rowCount: 6_000, blockingErrors: 0, warningCount: 0, conditions: {}, valueSources: {}, issueCounts: {}, totalNilaiABC: 0 } })));
    await screen.findByText("Status server: READY_TO_SUBMIT");
    expect(network.fetch.mock.calls.filter(([url]) => url.endsWith("/process/"))).toHaveLength(1);
  });
  it("clears previous local mapping when resume cancels a preview and refreshes in the same render", async () => {
    network.fetch.mockResolvedValue(Response.json({ ...base, stage: "MAPPING", layout: { ...mapping, sheetName: "NEW_DRAFT" } }));
    const { result } = renderHook(() => useAssetImport([], units));
    await act(async () => result.current.selectFile(new File(["synthetic"], "previous.xlsx")));
    expect(result.current.mapping?.sheetName).toBe("DATA");
    await act(async () => result.current.resume({ ...base, unitId: units[0].id, fileName: "next.xlsx", createdAt: "2026-10-16T00:00:00Z", stage: "MAPPING", rowCount: null }));
    expect(result.current.preview).toBeNull();
    expect(result.current.mapping).toBeNull();
    expect(result.current.response?.layout?.sheetName).toBe("NEW_DRAFT");
  });
  it.each(["column edit", "sheet switch", "parse error recovery"] as const)("keeps mapping and preview evidence atomic when status refresh cancels a %s", async scenario => {
    class DeferredWorker extends FakeWorker { postMessage = vi.fn(); }
    vi.stubGlobal("Worker", DeferredWorker);
    const original = { ...mapping, columns: [...mapping.columns, { columnIndex: 30, columnLetter: "AD", header: "UPT", normalizedHeader: "upt", field: null, confidence: 1 }] };
    const alternate = { ...original, sheetName: "ALTERNATE" };
    const initial = { ...preview, layout: { ...preview.layout, selected: original, candidates: [original, alternate] } };
    const recovered = { ...initial, layout: { ...initial.layout, selected: alternate }, layoutHash: "d".repeat(64), canonicalHash: "e".repeat(64) };
    network.fetch.mockImplementation(async (url, options) => {
      if (options.method === "GET") return Response.json({ ...base, stage: "MAPPING", layout: original });
      if (url.endsWith("/mapping/")) return Response.json({ ...base, stage: "READY_TO_PROCESS", layout: scenario === "parse error recovery" ? alternate : original });
      return Response.json({ ...base, stage: "READY_TO_SUBMIT", summary: { rowCount: 5, blockingErrors: 0, warningCount: 0, conditions: {}, valueSources: {}, issueCounts: {}, totalNilaiABC: 0 } });
    });
    render(<ImportWorkspace actorUnits={units} initialDrafts={[{ ...base, unitId: units[0].id, fileName: "stored.xlsx", createdAt: "2026-10-16T00:00:00Z", stage: "MAPPING", rowCount: null }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Lanjutkan stored.xlsx" })); await screen.findByText("Status server: MAPPING");
    selectFile(); await act(async () => FakeWorker.instances[0].onmessage?.({ data: initial }));
    if (scenario === "parse error recovery") {
      fireEvent.change(screen.getByLabelText("UPT (wajib)"), { target: { value: "30" } });
      await act(async () => FakeWorker.instances.at(-1)!.onmessage?.({ data: { type: "error", message: "Synthetic parse error" } }));
      expect(screen.getByRole("alert")).toHaveTextContent("Synthetic parse error");
      fireEvent.change(screen.getByLabelText("Sheet dan baris header"), { target: { value: "ALTERNATE:1" } });
      await act(async () => FakeWorker.instances.at(-1)!.onmessage?.({ data: recovered }));
    }
    if (scenario === "sheet switch") fireEvent.change(screen.getByLabelText("Sheet dan baris header"), { target: { value: "ALTERNATE:1" } });
    else fireEvent.change(screen.getByLabelText("UPT (wajib)"), { target: { value: "30" } });
    const pending = FakeWorker.instances.at(-1)!;
    const late = pending.onmessage!;
    expect(screen.getByLabelText(/Saya mengonfirmasi pemetaan/)).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Periksa status" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Periksa status" })).toBeEnabled());
    const expected = scenario === "parse error recovery" ? recovered : initial;
    expect(screen.getByLabelText("Sheet dan baris header")).toHaveValue(expected.layout.selected.sheetName + ":1");
    expect(screen.getByLabelText("UPT (wajib)")).toHaveValue("2");
    await act(async () => late({ data: { ...recovered, layoutHash: "f".repeat(64), canonicalHash: "0".repeat(64) } }));
    fireEvent.click(screen.getByLabelText(/Saya mengonfirmasi pemetaan/));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Unggah dan proses di server" })));
    await screen.findByRole("heading", { name: /Kualitas/ });
    const payloads = network.fetch.mock.calls.filter(([url]) => url.endsWith("/mapping/")).map(([, options]) => JSON.parse(options.body));
    expect(payloads).toEqual([{ mapping: expected.layout.selected, ruleVersion: expected.ruleVersion, layoutHash: expected.layoutHash, canonicalHash: expected.canonicalHash }]);
    expect(network.upload).not.toHaveBeenCalled();
  });
  it("retains usable sheet and indexed mapping controls after a re-preview error", async () => {
    const alternate = { ...mapping, sheetName: "ALTERNATE" };
    class DeferredWorker extends FakeWorker { postMessage = vi.fn(); }
    vi.stubGlobal("Worker", DeferredWorker);
    render(<ImportWorkspace initialDrafts={[]} actorUnits={units} />); selectFile();
    await act(async () => FakeWorker.instances[0].onmessage?.({ data: { ...preview, layout: { ...preview.layout, candidates: [mapping, alternate] } } }));
    fireEvent.change(screen.getByLabelText("Sheet dan baris header"), { target: { value: "ALTERNATE:1" } });
    await act(async () => FakeWorker.instances[1].onmessage?.({ data: { type: "error", message: "Invalid alternate mapping" } }));
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid alternate mapping");
    expect(screen.getByLabelText("Sheet dan baris header")).toBeEnabled();
    expect(screen.getByLabelText("UPT (wajib)")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Unggah dan proses di server" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Sheet dan baris header"), { target: { value: "DATA:1" } });
    expect(FakeWorker.instances).toHaveLength(3);
    await act(async () => FakeWorker.instances[2].onmessage?.({ data: preview }));
    expect(screen.getByLabelText("Sheet dan baris header")).toHaveValue("DATA:1");
  });
  it("invalidates a deferred preview when persisted processing advances authoritative state", async () => {
    class DeferredWorker extends FakeWorker { postMessage = vi.fn(); }
    vi.stubGlobal("Worker", DeferredWorker);
    const summary = { rowCount: 5, blockingErrors: 0, warningCount: 0, conditions: {}, valueSources: {}, issueCounts: {}, totalNilaiABC: 0 };
    network.fetch.mockResolvedValueOnce(Response.json({ ...base, stage: "READY_TO_PROCESS", layout: mapping })).mockResolvedValueOnce(Response.json({ ...base, stage: "READY_TO_SUBMIT", summary }));
    const { result } = renderHook(() => useAssetImport([], units));
    await act(async () => result.current.resume({ ...base, unitId: units[0].id, fileName: "stored.xlsx", createdAt: "2026-10-16T00:00:00Z", stage: "READY_TO_PROCESS", rowCount: null }));
    act(() => result.current.selectFile(new File(["synthetic"], "stored.xlsx")));
    expect(result.current.reading).toBe(true);
    const late = FakeWorker.instances[0].onmessage!;
    await act(async () => result.current.retry());
    await act(async () => late({ data: preview }));
    expect(result.current.response?.stage).toBe("READY_TO_SUBMIT");
    expect(result.current.step).toBe("quality");
    expect(result.current.preview).toBeNull();
    expect(result.current.reading).toBe(false);
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
  });
  it("selects assigned units, exposes template, validates XLSX/50 MiB before Worker work", () => {
    render(<ImportWorkspace initialDrafts={[]} actorUnits={units} />);
    expect(screen.getByLabelText("Unit Induk").querySelectorAll("option")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Unduh template/ })).toHaveAttribute("href", "/api/templates/asset-snapshot/");
    selectFile(new File(["bad"], "bad.csv")); expect(screen.getByRole("alert")).toHaveTextContent(".xlsx");
    const large = new File(["large"], "large.xlsx"); Object.defineProperty(large, "size", { value: 50 * 1024 * 1024 + 1 }); selectFile(large);
    expect(screen.getByRole("alert")).toHaveTextContent("50 MiB"); expect(FakeWorker.instances).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /demo/i })).not.toBeInTheDocument();
  });
  it("previews only in Worker, gates upload on confirmation and terminates replaced Workers", async () => {
    const { unmount } = render(<ImportWorkspace initialDrafts={[]} actorUnits={units} />);
    const file = new File(["private"], "snapshot.xlsx"); const read = vi.fn(); Object.defineProperty(file, "arrayBuffer", { value: read }); selectFile(file);
    await screen.findByText(/120 kandidat/); expect(read).not.toHaveBeenCalled();
    expect(FakeWorker.instances[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({ file }));
    expect(screen.getByText(/2 ditolak/)).toBeVisible(); expect(screen.getByText("a".repeat(64))).toBeVisible();
    expect(screen.getByRole("button", { name: "Unggah dan proses di server" })).toBeDisabled();
    selectFile(); await waitFor(() => expect(FakeWorker.instances).toHaveLength(2)); expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
    unmount(); expect(FakeWorker.instances[1].terminate).toHaveBeenCalled();
  });
  it("uploads directly, saves mapping evidence only, processes once and recovers a lost response by GET", async () => {
    const responses = [{ ...base, stage: "UPLOAD", upload: { path: `unit/${units[0].id}/dataset/${id}/version/${id}/${id}.xlsx`, token: "signed" } }, { ...base, stage: "MAPPING", layout: mapping }, { ...base, stage: "READY_TO_PROCESS", layout: mapping }];
    network.fetch.mockImplementation(async (_url, options) => { if (responses.length) return Response.json(responses.shift()); if (options.method === "POST") throw new Error("connection lost"); return Response.json({ ...base, stage: "PROCESSING" }); });
    render(<ImportWorkspace initialDrafts={[]} actorUnits={units} />); selectFile(); await screen.findByText(/120 kandidat/);
    fireEvent.click(screen.getByLabelText(/Saya mengonfirmasi pemetaan/));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Unggah dan proses di server" })));
    await screen.findByText("Status server: PROCESSING");
    expect(network.upload).toHaveBeenCalledWith(expect.any(String), "signed", expect.any(File), expect.objectContaining({ contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const calls = network.fetch.mock.calls; expect(calls.filter(([url, options]) => url.endsWith("/process/") && options.method === "POST")).toHaveLength(1);
    expect(calls.at(-1)?.[1]).toMatchObject({ method: "GET", cache: "no-store" });
    const body = JSON.parse(calls.find(([url]) => url.endsWith("/mapping/"))![1].body); expect(body).toMatchObject({ mapping, canonicalHash: "c".repeat(64) }); expect(body).not.toHaveProperty("preview");
  });
  it("lists persisted file/time/stage/counts and resumes quality without local parsing", async () => {
    network.fetch.mockResolvedValue(Response.json({ ...base, stage: "READY_TO_SUBMIT", summary: { rowCount: 5, blockingErrors: 0, warningCount: 0, conditions: {}, valueSources: {}, issueCounts: {}, totalNilaiABC: 0 } }));
    render(<ImportWorkspace actorUnits={units} initialDrafts={[{ ...base, unitId: units[0].id, fileName: "stored.xlsx", createdAt: "2026-10-16T00:00:00Z", stage: "READY_TO_SUBMIT", rowCount: 5 }]} />);
    expect(screen.getByText("stored.xlsx")).toBeVisible(); expect(screen.getByText(/5 baris/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Lanjutkan stored.xlsx/ })); await screen.findByRole("heading", { name: /Kualitas/ }); expect(FakeWorker.instances).toHaveLength(0);
  });
  it("replaces local-preview status with server status on resume and clears old authority if another draft fails to load", async () => {
    const summary = { rowCount: 5, blockingErrors: 0, warningCount: 0, conditions: {}, valueSources: {}, issueCounts: {}, totalNilaiABC: 0 };
    network.fetch.mockResolvedValueOnce(Response.json({ ...base, stage: "READY_TO_SUBMIT", summary })).mockRejectedValueOnce(new Error("offline"));
    const draft = { ...base, unitId: units[0].id, fileName: "first.xlsx", createdAt: "2026-10-16T00:00:00Z", stage: "READY_TO_SUBMIT" as const, rowCount: 5 };
    render(<ImportWorkspace actorUnits={units} initialDrafts={[draft, { ...draft, importId: "20000000-0000-4000-8000-000000000002", fileName: "second.xlsx" }]} />);
    selectFile(); await screen.findByText(/Preview lokal siap/);
    fireEvent.click(screen.getByRole("button", { name: "Lanjutkan first.xlsx" })); await screen.findByRole("heading", { name: /Kualitas/ });
    expect(screen.queryByText(/Preview lokal siap/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lanjutkan second.xlsx" })); await screen.findByRole("alert");
    expect(screen.queryByText("Status server: READY_TO_SUBMIT")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tinjau perbandingan" })).not.toBeInTheDocument();
  });
  it("returns a blocked persisted draft to mapping correction without starting another run", async () => {
    network.fetch.mockResolvedValue(Response.json({ ...base, stage: "NEEDS_FIX", layout: mapping, summary: { rowCount: 5, blockingErrors: 1, warningCount: 0, conditions: {}, valueSources: {}, issueCounts: { FORMULA_ERROR: 1 }, totalNilaiABC: 0 } }));
    render(<ImportWorkspace actorUnits={units} initialDrafts={[{ ...base, unitId: units[0].id, fileName: "fix.xlsx", createdAt: "2026-10-16T00:00:00Z", stage: "NEEDS_FIX", rowCount: 5 }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Lanjutkan fix.xlsx" })); await screen.findByRole("heading", { name: /Kualitas/ });
    expect(screen.getByRole("button", { name: "Tinjau perbandingan" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Perbaiki pemetaan" }));
    expect(screen.getByLabelText("Berkas snapshot XLSX")).toBeVisible(); expect(screen.getByLabelText("UPT (wajib)")).toBeVisible();
    expect(network.fetch).toHaveBeenCalledTimes(1); expect(network.upload).not.toHaveBeenCalled();
  });
  it("deliberately verifies an upload whose response was lost without re-uploading or starting a run", async () => {
    const upload = { path: `unit/${units[0].id}/dataset/${id}/version/${id}/${id}.xlsx`, token: "signed" };
    network.fetch.mockResolvedValueOnce(Response.json({ ...base, stage: "UPLOAD", upload })).mockResolvedValueOnce(Response.json({ ...base, stage: "MAPPING", layout: mapping }));
    render(<ImportWorkspace actorUnits={units} initialDrafts={[{ ...base, unitId: units[0].id, fileName: "uploaded.xlsx", createdAt: "2026-10-16T00:00:00Z", stage: "UPLOAD", rowCount: null }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Lanjutkan uploaded.xlsx" })); await screen.findByText("Status server: UPLOAD");
    fireEvent.click(screen.getByRole("button", { name: "Verifikasi unggahan tersimpan" })); await screen.findByText("Status server: MAPPING");
    expect(network.fetch.mock.calls.map(([url]) => url)).toEqual([`/api/imports/${id}/`, `/api/imports/${id}/upload-complete/`]);
    expect(network.upload).not.toHaveBeenCalled(); expect(FakeWorker.instances).toHaveLength(0);
  });
});
