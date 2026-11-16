import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { initialState, type FormState } from "../core/drafts";
import { emptyPage, toPageDraft } from "../core/page-draft";
import { emptyPost, toPostDraft } from "../core/post-draft";
import site from "gitms-site-config";

vi.mock("./actions/auth", () => ({ login: vi.fn(), logout: vi.fn() }));
vi.mock("./actions/posts", () => ({ savePost: vi.fn(), deletePost: vi.fn() }));
vi.mock("./actions/pages", () => ({ savePage: vi.fn(), deletePage: vi.fn() }));
vi.mock("./actions/uploads", () => ({ uploadImage: vi.fn() }));

const { PostForm } = await import("./PostForm");
const { PageForm } = await import("./PageForm");
const { LoginForm } = await import("./LoginForm");
const { NotConfigured } = await import("./NotConfigured");

const fc = { fields: site.posts!.fields, timeZone: site.timeZone };
const postConfig = { ...fc, route: site.posts!.route, uploadMaxBytes: 5_000_000 };
const pageConfig = { route: site.pages!.route, nav: true, uploadMaxBytes: null };

function withErrors<D>(state: FormState<D>, errors: Record<string, string>): FormState<D> {
  return { ...state, errors, formError: "Fix the fields below. Nothing was saved." };
}

/** Every visible control has an accessible name from a <label>. */
function expectAllLabelled(container: HTMLElement) {
  const controls = container.querySelectorAll<HTMLElement>("input:not([type=hidden]), select, textarea");
  expect(controls.length).toBeGreaterThan(0);
  for (const el of controls) {
    expect(container.querySelector(`label[for="${el.id}"]`), `label for ${el.getAttribute("name")}`).not.toBeNull();
  }
}

const post = { slug: "hello", title: "Hello", at: "2026-10-08T21:14:00-04:00", category: "notes", mood: "calm", body: "Some **bold** text" };

describe("admin forms are labelled and wire errors with aria-describedby", () => {
  it("post form: labelled, errors described, the summary links to the field, custom fields shown", () => {
    const state = withErrors(initialState(emptyPost(fc), ""), { title: "Required", at: "Pick a date and time", category: "Use lowercase letters, digits or dashes" });
    const { container } = render(<PostForm initial={state} config={postConfig} orig="" suggestions={{ category: ["travel"] }} action={vi.fn()} />);
    expectAllLabelled(container);
    expect(screen.getByLabelText("Title")).toHaveAccessibleDescription(/Required/);
    expect(screen.getByLabelText("Date and time")).toHaveAccessibleDescription(/Pick a date and time/);
    expect(screen.getByLabelText("Category")).toHaveAccessibleDescription(/lowercase letters/);
    expect(screen.getByLabelText("Category")).toHaveValue("notes");
    expect(screen.getByLabelText("Mood")).toHaveValue("calm");
    expect(within(screen.getByRole("alert")).getByRole("link", { name: /Title: Required/ })).toHaveAttribute("href", "#f-title");
    expect(screen.getByRole("button", { name: "Save draft" })).toHaveAttribute("type", "submit");
    expect(container.querySelector('datalist#post-category-list option[value="travel"]')).not.toBeNull();
  });

  it("post form: preview renders the markdown body; the URL follows the title", () => {
    const { container } = render(<PostForm initial={initialState(toPostDraft(post, fc), "v1")} config={postConfig} orig="hello" suggestions={{}} action={vi.fn()} />);
    expect(screen.getByLabelText("Date and time")).toHaveValue("2026-10-08T21:14");
    expect(container.querySelector('input[name="orig"]')).toHaveValue("hello");
    expect(container.querySelector('input[name="ver"]')).toHaveValue("v1");
    expect(screen.getByLabelText("Published")).toBeChecked();
    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByLabelText("Preview").querySelector("strong")).toHaveTextContent("bold");
    // The textarea stays in the form while previewing, so a save still sends the body.
    expect(container.querySelector('textarea[name="body"]')).toHaveValue("Some **bold** text");
    expect(screen.getByText("/blog/hello")).toBeInTheDocument();
    fireEvent.input(screen.getByLabelText("Slug"), { target: { value: "" } });
    fireEvent.input(screen.getByLabelText("Title"), { target: { value: "New Title!" } });
    expect(screen.getByText("/blog/new-title")).toBeInTheDocument();
    expect(screen.getByTestId("unsaved")).toBeInTheDocument();
  });

  it("post form: the date hint names the site's time zone", () => {
    render(<PostForm initial={initialState(emptyPost(fc), "")} config={postConfig} orig="" suggestions={{}} action={vi.fn()} />);
    expect(screen.getByLabelText("Date and time")).toHaveAccessibleDescription(/America\/New York/);
  });

  it("login form has a labelled password field", () => {
    render(<LoginForm action={vi.fn()} />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("not configured page", () => {
    render(<NotConfigured missing={["GITMS_ADMIN_SESSION_SECRET"]} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Admin not configured");
    expect(screen.getByRole("main")).toHaveTextContent("GITMS_ADMIN_SESSION_SECRET");
  });
});

describe("the save button says whether a save publishes", () => {
  it("a new page starts as a draft, and choosing Published makes the button publish", () => {
    render(<PageForm initial={initialState(emptyPage(), "")} config={pageConfig} orig="" action={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
    expect(screen.getByText(/stay off the site until you choose Published/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Published"));
    expect(screen.getByRole("button", { name: "Publish page" })).toBeInTheDocument();
  });

  it("a published page saves as itself; switching it to Draft says so", () => {
    const page = toPageDraft({ slug: "about", title: "About", body: "Hi" });
    render(<PageForm initial={initialState(page, "v1")} config={pageConfig} orig="about" liveUrl="/about" action={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Save page" })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Draft (hidden from the site)"));
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
  });

  it("the nav box is left out when the config turns it off", () => {
    render(<PageForm initial={initialState(emptyPage(), "")} config={{ ...pageConfig, nav: false }} orig="" action={vi.fn()} />);
    expect(screen.queryByLabelText("Show in the site navigation")).toBeNull();
  });

  it("a draft post being published says Publish post", () => {
    render(<PostForm initial={initialState(toPostDraft({ ...post, draft: true }, fc), "v1")} config={postConfig} orig="hello" suggestions={{}} action={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Published"));
    expect(screen.getByRole("button", { name: "Publish post" })).toBeInTheDocument();
  });
});

describe("pasting front matter into the body", () => {
  const paste = (el: HTMLElement, text: string) =>
    fireEvent.paste(el, { clipboardData: { getData: (t: string) => (t === "text/plain" ? text : "") } });

  it("post: strips the block and fills the settings, custom fields included", () => {
    render(<PostForm initial={initialState(emptyPost(fc), "")} config={postConfig} orig="" suggestions={{}} action={vi.fn()} />);
    const body = screen.getByLabelText("Body (markdown)") as HTMLTextAreaElement;
    paste(body, '---\ntitle: "Hello There"\nslug: hello\ncategory: travel\nmood: busy\nat: 2026-11-20T08:15\ndraft: false\ndescription: Short\nshareImage: /uploads/x.png\nweird: 1\n---\n\nThe body.');
    expect(body.value).toBe("The body.");
    expect(screen.getByLabelText("Title")).toHaveValue("Hello There");
    expect(screen.getByLabelText("Slug")).toHaveValue("hello");
    expect(screen.getByLabelText("Category")).toHaveValue("travel");
    expect(screen.getByLabelText("Mood")).toHaveValue("busy");
    expect(screen.getByLabelText("Date and time")).toHaveValue("2026-11-20T08:15");
    expect(screen.getByLabelText("Published")).toBeChecked();
    expect(screen.getByLabelText("Description (optional)")).toHaveValue("Short");
    expect(screen.getByLabelText("Share image (optional)")).toHaveValue("/uploads/x.png");
    expect(screen.getByRole("button", { name: "Publish post" })).toBeInTheDocument();
    expect(screen.getByText("URL:").textContent).toContain("/blog/hello");
    expect(screen.getByTestId("front-matter-notice")).toHaveTextContent(/category and mood from the front matter/);
    expect(screen.getByTestId("unsaved")).toBeInTheDocument();
  });

  it("post: a paste without front matter is left to the browser", () => {
    render(<PostForm initial={initialState(emptyPost(fc), "")} config={postConfig} orig="" suggestions={{}} action={vi.fn()} />);
    const body = screen.getByLabelText("Body (markdown)");
    expect(paste(body, "just text\n---\nnot: front matter")).toBe(true); // not prevented
    expect(screen.getByTestId("front-matter-notice")).toHaveTextContent("");
  });

  it("page: fills title, slug and nav, ignoring post keys", () => {
    render(<PageForm initial={initialState(emptyPage(), "")} config={pageConfig} orig="" action={vi.fn()} />);
    const body = screen.getByLabelText("Body (markdown)") as HTMLTextAreaElement;
    paste(body, "---\ntitle: About\nslug: about\nnav: true\ncategory: x\ndraft: true\n---\nWho we are.");
    expect(body.value).toBe("Who we are.");
    expect(screen.getByLabelText("Title")).toHaveValue("About");
    expect(screen.getByLabelText("Show in the site navigation")).toBeChecked();
    expect(screen.getByLabelText("Draft (hidden from the site)")).toBeChecked();
    expect(screen.getByTestId("front-matter-notice")).toHaveTextContent("Filled title, visibility, navigation and slug");
  });
});
