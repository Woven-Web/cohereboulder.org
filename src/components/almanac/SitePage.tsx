import type { ReactNode } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useLook } from "@/lib/look";
import { AlmanacShell } from "./AlmanacShell";

/**
 * The frame for pages whose body is still written in the classic vocabulary.
 * Classic: nav, body, footer inside `classic` (the page's old outer classes).
 * ?look=almanac: the Almanac shell with the body dressed by `.skin`.
 */
export function SitePage({ classic = "min-h-screen bg-background", children }: { classic?: string; children: ReactNode }) {
  if (useLook() === "almanac") {
    return <AlmanacShell site><div className="page skin">{children}</div></AlmanacShell>;
  }
  return (
    <div className={classic}>
      <Navigation />
      {children}
      <Footer />
    </div>
  );
}
