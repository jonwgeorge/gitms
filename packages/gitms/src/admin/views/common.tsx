import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { adminGate, type AdminGate } from "../../core/auth";
import { attempt, createStore, type ContentStore } from "../../core/store";
import { admin, cms } from "../../runtime";
import { NotConfigured } from "../NotConfigured";
import type { PageFormConfig } from "../PageForm";
import type { PostFormConfig } from "../PostForm";

export type SearchParams = Record<string, string | string[] | undefined>;

export type Session = { readonly gate: Extract<AdminGate, { state: "admin" }>; readonly store: ContentStore };

/**
 * Every admin view starts here: the page explaining what's missing when the
 * admin isn't set up, the login page when signed out, else the session and store.
 */
export async function signedIn(): Promise<{ page: ReactNode } | Session> {
  const gate = await adminGate();
  if (gate.state === "unconfigured") return { page: <NotConfigured missing={gate.missing} /> };
  if (gate.state === "anonymous") redirect(admin("/login"));
  return { gate, store: createStore(cms(), gate.config.store) };
}

/** Reads one content file's list (e.g. the posts), or the store's error message. */
export async function readList(store: ContentStore, file: string, list: string) {
  const loaded = await attempt(() => store.read(file));
  if (!loaded.ok) return loaded;
  const data = loaded.value.data as Record<string, unknown> | null;
  const items = Array.isArray(data?.[list]) ? (data[list] as unknown[]) : [];
  return { ok: true as const, data: loaded.value.data, items: items.map((x) => (typeof x === "object" && x !== null ? (x as Record<string, unknown>) : {})) };
}

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function postFormConfig(): PostFormConfig {
  const c = cms();
  return { fields: c.posts!.fields, timeZone: c.timeZone, route: c.posts!.route, uploadMaxBytes: c.uploads?.maxBytes ?? null };
}

export function pageFormConfig(): PageFormConfig {
  const c = cms();
  return { route: c.pages!.route, nav: c.pages!.nav, uploadMaxBytes: c.uploads?.maxBytes ?? null };
}

/** `s` unless the count is one. */
export const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** The custom fields and zone the post draft helpers need. */
export const postFieldsConfig = () => ({ fields: cms().posts!.fields, timeZone: cms().timeZone });
