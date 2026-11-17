import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GalleryShowcase } from "./gallery";

export const metadata: Metadata = { title: "Component gallery" };

/**
 * The gallery is a development-only surface. In a production build the page is
 * prerendered as a 404 so the component inventory never ships to users.
 */
export default function GalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GalleryShowcase />;
}
