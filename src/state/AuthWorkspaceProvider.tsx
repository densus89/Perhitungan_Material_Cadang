"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Actor } from "../domain/access";

export interface AssignedUnit { id: string; name: string }

const AuthWorkspaceContext = createContext<{ actor: Actor; units: readonly AssignedUnit[] } | null>(null);

/** Display context only. Every server operation must establish its own Actor. */
export function AuthWorkspaceProvider({ actor, units = [], children }: {
  actor: Actor; units?: readonly AssignedUnit[]; children: ReactNode;
}) {
  const assignedUnits = actor.unitIndukIds.flatMap((id) => {
    const unit = units.find((candidate) => candidate.id === id);
    return unit ? [unit] : [];
  });
  return <AuthWorkspaceContext.Provider value={{ actor, units: assignedUnits }}>{children}</AuthWorkspaceContext.Provider>;
}

function useAuthWorkspace() {
  const workspace = useContext(AuthWorkspaceContext);
  if (!workspace) throw new Error("AuthWorkspaceProvider is required for the authenticated workspace");
  return workspace;
}

export function useActor() { return useAuthWorkspace().actor; }
export function useAssignedUnits() { return useAuthWorkspace().units; }
