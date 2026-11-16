import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions/uploads", () => ({ uploadImage: vi.fn() }));
const { ImageUpload } = await import("./ImageUpload");

const ok = (url: string, alt = "photo") => ({ ok: true as const, url, markdown: `![${alt}](${url})`, commitUrl: null, note: "Committed abc1234." });

function setup(action: (fd: FormData) => Promise<unknown>, value = "Intro\nOutro") {
  const onInput = vi.fn();
  render(
    <>
      <textarea id="f-body" defaultValue={value} onInput={(e) => onInput(e.currentTarget.value)} />
      <ImageUpload target="f-body" action={action as never} />
    </>,
  );
  const area = document.getElementById("f-body") as HTMLTextAreaElement;
  return { area, onInput };
}

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "photo.png", { type: "image/png" });

describe("ImageUpload", () => {
  it("uploads the picked file with its alt text and inserts the markdown at the cursor, as its own paragraph", async () => {
    const action = vi.fn(async () => ok("/uploads/2026/11/photo-0123456789.png", "front"));
    const { area, onInput } = setup(action);
    area.setSelectionRange(5, 5); // after "Intro"
    fireEvent.change(screen.getByLabelText(/alt text/i), { target: { value: "front" } });
    fireEvent.change(screen.getByLabelText("Add image"), { target: { files: [png()] } });
    await waitFor(() => expect(area.value).toBe("Intro\n\n![front](/uploads/2026/11/photo-0123456789.png)\n\nOutro"));
    const fd = (action.mock.calls[0] as unknown as [FormData])[0];
    expect(fd.get("alt")).toBe("front");
    expect((fd.get("file") as File).name).toBe("photo.png");
    // The form's own input handlers see the change (preview and "Unsaved changes").
    expect(onInput).toHaveBeenLastCalledWith(area.value);
    expect(await screen.findByText("/uploads/2026/11/photo-0123456789.png")).toBeInTheDocument();
    expect(screen.getByLabelText(/alt text/i)).toHaveValue("");
  });

  it("shows the server's error and inserts nothing", async () => {
    const { area } = setup(async () => ({ ok: false, error: "That file isn't a PNG, JPEG, GIF, WebP or AVIF image." }));
    fireEvent.change(screen.getByLabelText("Add image"), { target: { files: [png()] } });
    expect(await screen.findByText(/isn't a PNG/)).toBeInTheDocument();
    expect(area.value).toBe("Intro\nOutro");
  });

  it("refuses a file over 5 MB without uploading it", async () => {
    const action = vi.fn();
    setup(action);
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Add image"), { target: { files: [big] } });
    expect(await screen.findByText(/over 5 MB/)).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("uploads an image pasted into the body", async () => {
    const action = vi.fn(async () => ok("/uploads/2026/11/image-0123456789.png"));
    const { area } = setup(action, "");
    const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    event.clipboardData = { files: [png()] };
    area.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(area.value).toBe("![photo](/uploads/2026/11/image-0123456789.png)\n"));
  });
});
