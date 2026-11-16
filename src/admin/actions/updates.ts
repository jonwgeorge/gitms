"use server";

/**
 * gitms updates from the dashboard: check again now, and update now (start
 * the site's "Update gitms" workflow). Each checks the session itself.
 */
import { redirect } from "next/navigation";
import { adminGate } from "../../core/auth";
import { clearUpdateCache, requestUpdate, updateStatus, installedCommit, sourceToken } from "../../core/updates";
import { admin, cms } from "../../runtime";

/** Asks GitHub again instead of reusing the last check. */
export async function checkGitmsNow(): Promise<void> {
  const gate = await adminGate();
  if (gate.state !== "admin") redirect(admin("/login"));
  await updateStatus({ installed: installedCommit(), token: sourceToken(gate.config.store), userAgent: cms().userAgent, fresh: true });
  redirect(admin());
}

/** Starts the site's update workflow, so it moves to the newest gitms without waiting for its daily run. */
export async function updateGitmsNow(formData: FormData): Promise<void> {
  const gate = await adminGate();
  if (gate.state !== "admin") redirect(admin("/login"));
  const store = gate.config.store;
  if (store.kind !== "github") redirect(`${admin()}?update=local`);
  const latest = formData.get("latest");
  const result = await requestUpdate({ repo: store.repo, token: store.token, sha: typeof latest === "string" ? latest : null, userAgent: cms().userAgent });
  if (!result.ok) redirect(`${admin()}?update=${result.code}`);
  clearUpdateCache();
  redirect(`${admin()}?update=started`);
}
