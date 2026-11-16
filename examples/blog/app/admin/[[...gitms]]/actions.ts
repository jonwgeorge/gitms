"use server";

import { saveWholeFile, type FormState } from "gitms/server";
import type { SiteSettings } from "@/lib/site-schema";
import { siteEditor } from "./site-editor";

export async function saveSite(prev: FormState<SiteSettings>, fd: FormData): Promise<FormState<SiteSettings>> {
  return saveWholeFile(siteEditor, prev, fd);
}
