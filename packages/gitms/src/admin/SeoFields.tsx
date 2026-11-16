import type { FieldErrors } from "../core/drafts";
import { DESCRIPTION_MAX } from "../core/schema";
import { Field } from "./Field";
import styles from "./admin.module.css";

type Props = {
  description: string;
  shareImage: string;
  errors: FieldErrors;
  /** "post" or "page", for the hints. */
  kind: string;
};

/** Optional search and link-preview fields, shared by the post and page editors. */
export function SeoFields({ description, shareImage, errors, kind }: Props) {
  return (
    <fieldset className={`${styles.section} ${styles.stack}`}>
      <legend className="gitms-label">Search and sharing</legend>
      <Field
        as="textarea"
        name="description"
        label="Description (optional)"
        value={description}
        errors={errors}
        rows={5}
        hint={`Shown by search engines and link previews, up to ${DESCRIPTION_MAX} characters. Empty uses the start of the ${kind}.`}
      />
      <Field
        name="shareImage"
        label="Share image (optional)"
        value={shareImage}
        errors={errors}
        inputMode="url"
        placeholder="/uploads/2026/11/cover.png"
        hint="The picture in link previews. Empty uses the first image in the body. To pick another, paste its /uploads/… path or an https:// link. 1200×630 works best."
      />
    </fieldset>
  );
}
