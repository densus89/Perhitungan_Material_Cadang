import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SummaryPage from "../../app/(workspace)/ringkasan/page";
import { AuthenticatedDemoWorkspace } from "../fixtures/AuthenticatedDemoWorkspace";

describe("authenticated landing workspace", () => {
  it("identifies the planning workspace and demonstration data", () => {
    render(<AuthenticatedDemoWorkspace><SummaryPage /></AuthenticatedDemoWorkspace>);

    expect(
      screen.getByRole("heading", { name: "Perencanaan Material Cadang" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Data Demo")).toBeVisible();
  });
});
