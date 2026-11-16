import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UpdateStatus } from "../core/updates";

vi.mock("./actions/updates", () => ({ checkGitmsNow: vi.fn(), updateGitmsNow: vi.fn() }));
const { UpdateNotice, GitmsVersion } = await import("./UpdateNotice");

const A = "a".repeat(40);
const B = "b".repeat(40);
const checkedAt = "2026-11-16T12:00:00.000Z";
const available: UpdateStatus = {
  state: "available",
  installed: A,
  latest: B,
  behind: 7,
  changes: [{ sha: B, message: "Add update notices", url: `https://github.com/jonwgeorge/gitms/commit/${B}` }],
  checkedAt,
};

describe("UpdateNotice", () => {
  it("offers the update with the new changes when the site is behind", () => {
    render(<UpdateNotice status={available} actionsUrl="https://github.com/me/site/actions" />);
    expect(screen.getByRole("heading", { name: "A new version of gitms is available" })).toBeInTheDocument();
    expect(screen.getByText("Add update notices")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "and 6 more" })).toHaveAttribute("href", `https://github.com/jonwgeorge/gitms/compare/${A}...${B}`);
    const button = screen.getByRole("button", { name: "Update now" });
    expect(button.closest("form")?.querySelector<HTMLInputElement>("input[name=latest]")?.value).toBe(B);
    expect(screen.getByText(/daily run/)).toBeInTheDocument();
  });

  it("shows nothing when up to date, and only known outcomes", () => {
    const { container } = render(<UpdateNotice status={{ state: "current", installed: A, latest: A, behind: 0, changes: [], checkedAt }} outcome="<script>" actionsUrl={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("confirms a started update with a link to the site's Actions", () => {
    render(<UpdateNotice status={available} outcome="started" actionsUrl="https://github.com/me/site/actions" />);
    expect(screen.getByRole("status")).toHaveTextContent("Update started");
    expect(screen.getByRole("link", { name: "Follow it on GitHub" })).toHaveAttribute("href", "https://github.com/me/site/actions");
  });

  it("explains a refused update", () => {
    render(<UpdateNotice status={available} outcome="denied" actionsUrl={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Contents: read and write/);
  });
});

describe("GitmsVersion", () => {
  it("says which gitms runs and how it compares", () => {
    const { rerender, container } = render(<GitmsVersion status={available} />);
    expect(container).toHaveTextContent("aaaaaaa, 7 changes behind");
    // The notice above already has the button.
    expect(screen.queryByRole("button", { name: "Check again" })).toBeNull();
    rerender(<GitmsVersion status={{ state: "unknown", installed: null, latest: B, checkedAt }} />);
    expect(container).toHaveTextContent("not recorded in this build (newest is bbbbbbb)");
    rerender(<GitmsVersion status={{ state: "error", message: "Couldn't reach GitHub to check for updates.", checkedAt }} />);
    expect(container).toHaveTextContent("Couldn't reach GitHub");
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  });
});
