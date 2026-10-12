import { useLanguage } from "@/contexts/LanguageContext";
import type { DirectoryEntry } from "@/lib/people";

/** Which profile this is: solid hex = written for COhere, outlined = public scenius.social fallback. */
export function SourceMark({ source }: { source: DirectoryEntry["profileSource"] }) {
  const { tr } = useLanguage();
  const isPublic = source === "publicFallback";
  return <span className="src" data-src={isPublic ? "public" : "cohere"}>{tr(isPublic ? "members.people.srcPublic" : "members.people.srcCohere")}</span>;
}
