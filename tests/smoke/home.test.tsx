import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import SummaryPage from "../../app/(workspace)/ringkasan/page";
import { AuthenticatedDemoWorkspace } from "../fixtures/AuthenticatedDemoWorkspace";

describe("authenticated landing workspace", () => {
  it("identifies the planning workspace and demonstration data", () => {
    render(<PathnameContext.Provider value="/ringkasan/"><AuthenticatedDemoWorkspace><SummaryPage /></AuthenticatedDemoWorkspace></PathnameContext.Provider>);

    expect(
      screen.getByRole("heading", { name: "Perencanaan Material Cadang" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Data Demo")).toBeVisible();
  });
});
