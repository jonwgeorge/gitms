import type { ComponentType } from "react";
import type { SearchParams } from "./views/common";

/** A custom section's body. It renders inside the admin chrome, after the session check. */
export type SectionComponent = ComponentType<{ readonly searchParams: SearchParams }>;

/** The React parts of the admin that come from the site (kept out of the config so next.config can import it). */
export type AdminComponents = {
  /** One component per `sections` entry in the config, by slug. */
  readonly sections?: Readonly<Record<string, SectionComponent>>;
  /** Render a draft or scheduled post or page as the site would, for the admin's preview. */
  readonly preview?: {
    readonly post?: ComponentType<{ readonly post: Record<string, unknown> }>;
    readonly page?: ComponentType<{ readonly page: Record<string, unknown> }>;
  };
};
