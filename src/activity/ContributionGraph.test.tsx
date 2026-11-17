import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContributionGraph } from "./ContributionGraph";

vi.mock("../admin/actions/activity", () => ({ saveActivity: vi.fn() }));

const days = Array.from({ length: 14 }, (_, i) => {
  const date = new Date(Date.parse("2026-11-01T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
  return { date, count: i, level: (i % 5) as 0 | 1 | 2 | 3 | 4 };
});

describe("ContributionGraph", () => {
  it("is one labelled image with a cell per day and a legend", () => {
    const { container } = render(<ContributionGraph data={{ login: "octocat", total: 91, days }} footer={<a href="https://github.com/octocat">profile</a>} />);
    expect(screen.getByRole("img", { name: "91 contributions in the last year" })).toBeInTheDocument();
    const cells = container.querySelectorAll(".gitms-activity-cell[title]");
    expect(cells).toHaveLength(14);
    expect(cells[3]).toHaveAttribute("data-level", "3");
    expect(cells[3]).toHaveAttribute("title", "3 contributions on November 4, 2026");
    expect(container.textContent).toContain("Less");
    expect(screen.getByRole("link", { name: "profile" })).toBeInTheDocument();
  });

  it("takes its own label and can drop the legend", () => {
    const { container } = render(<ContributionGraph data={{ login: "o", total: 1, days }} label="one commit" legend={null} />);
    expect(screen.getByRole("img", { name: "one commit" })).toBeInTheDocument();
    expect(container.textContent).not.toContain("More");
  });
});

describe("the Activity admin form", async () => {
  const { ActivityForm } = await import("../admin/ActivityForm");
  it("is labelled and shows a field error", () => {
    const state = { draft: { show: true, github: "" }, sha: "abc", rev: 0, errors: { "activity.github": "Add a GitHub username to show the heat map" }, formError: "Fix 1 field below. Nothing was saved.", saved: null, focus: null };
    render(<ActivityForm initial={state} action={vi.fn()} />);
    expect(screen.getByLabelText("Show the heat map on the site")).toBeChecked();
    expect(screen.getByLabelText("GitHub username")).toHaveAccessibleDescription(/Add a GitHub username/);
  });
});
