import type { Metadata } from "next";
import type { ReactNode } from "react";
import { site } from "@/lib/content";
import "./site.css";

export const metadata: Metadata = { title: { default: site.title, template: `%s · ${site.title}` }, description: site.tagline };

// The public pages get their header from app/(site)/layout.tsx, so the admin has the window to itself.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
