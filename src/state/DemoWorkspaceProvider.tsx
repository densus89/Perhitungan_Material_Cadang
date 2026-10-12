"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { mappingSuggestions, sourceFiles } from "../demo/fixtures";
import { applyApproval } from "../domain/rfq-approval";
import type { ApprovalDecision, ApprovalScope, MappingSuggestion } from "../domain/types";

export interface LocalFileMetadata { name: string; size: number; type: string }
export type ImportStage = 0 | 1 | 2 | 3;

function useWorkspaceState() {
  const [mappingRows, setMappingRows] = useState<MappingSuggestion[]>(() => mappingSuggestions.map((row) => ({ ...row })));
  const [localFileMetadata, setLocalFileMetadata] = useState<LocalFileMetadata | null>(null);
  const [demoSourcesSelected, setDemoSourcesSelected] = useState(false);
  const [importStage, setImportStage] = useState<ImportStage>(0);

  function selectFileMetadata(metadata: LocalFileMetadata | null) {
    setLocalFileMetadata(metadata);
    setDemoSourcesSelected(false);
    setImportStage(0);
  }

  function useDemoSources() {
    setLocalFileMetadata(null);
    setDemoSourcesSelected(true);
    setImportStage(0);
  }

  function resetDemo() {
    setMappingRows(mappingSuggestions.map((row) => ({ ...row })));
    setLocalFileMetadata(null);
    setDemoSourcesSelected(false);
    setImportStage(0);
  }

  function decide(method: ApprovalScope["method"], selectedIds: readonly string[], filteredIds: readonly string[], decision: ApprovalDecision) {
    setMappingRows((rows) => applyApproval({ rows, method, selectedIds, filteredIds }, decision));
  }

  return { mappingRows, sourceFiles, localFileMetadata, demoSourcesSelected, importStage, setImportStage, selectFileMetadata, useDemoSources, resetDemo, decide };
}

const DemoWorkspaceContext = createContext<ReturnType<typeof useWorkspaceState> | null>(null);

export function DemoWorkspaceProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspaceState();
  return <DemoWorkspaceContext.Provider value={workspace}>{children}</DemoWorkspaceContext.Provider>;
}

export function useDemoWorkspace() {
  const workspace = useContext(DemoWorkspaceContext);
  if (!workspace) throw new Error("DemoWorkspaceProvider is required for workspace flows");
  return workspace;
}
