/**
 * The redirect a rename leaves behind: when a live page or post changes slug,
 * its old URL is pointed at the new one (see withRename). Server-only.
 */
import { cms } from "../runtime";
import { schemasFor, validateWith, type Redirect } from "./schema";
import { withRename } from "./redirects";
import { looseList, mutate } from "./save";

/** Adds `from → to` to the redirects file; true when it was saved. */
export async function redirectRename(from: string, to: string): Promise<boolean> {
  if (from === to || !cms().redirects) return from === to;
  const schema = schemasFor(cms()).redirects;
  const outcome = await mutate(
    "redirects",
    `redirects: ${from.slice(0, 80)} → ${to.slice(0, 80)}`,
    (file) => ({ data: { ...file, redirects: withRename(looseList(file.redirects) as unknown as Redirect[], from, to) } }),
    (data) => validateWith(schema, data),
  );
  return outcome.ok;
}
