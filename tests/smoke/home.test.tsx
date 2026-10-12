import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "../../app/page";

describe("home page", () => {
  it("identifies the planning workspace and demonstration data", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Perencanaan Material Cadang" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Data Demo")).toBeVisible();
  });
});
