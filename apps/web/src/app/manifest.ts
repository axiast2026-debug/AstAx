import type { MetadataRoute } from "next";
import messages from "../../messages/it.json";

/** Phase 8 (ADR 0011): AstAx can be added to the home screen of the phone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: messages.app.name,
    short_name: messages.app.name,
    description: messages.app.tagline,
    lang: "it",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FAF8F5",
    theme_color: "#0B1B33",
    icons: [{ src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" }],
  };
}
