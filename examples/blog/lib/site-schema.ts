import { z } from "zod";

/** content/site.json: the site's name and tagline, edited under Site in the admin. */
export const siteSchema = z.strictObject({
  site: z.strictObject({
    title: z.string().trim().min(1, "Required").max(60, "At most 60 characters"),
    tagline: z.string().trim().max(160, "At most 160 characters"),
  }),
});

export type SiteSettings = z.infer<typeof siteSchema>["site"];
