import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

const ITEMS = [
  { id: "board", to: "/board", key: "members.nav.board" },
  { id: "people", to: "/people", key: "members.nav.people" },
  { id: "me", to: "/profile", key: "members.nav.me" },
] as const;

/** Board · People · My profile — the members area's own small nav, under the app tabs. */
export function MembersNav({ current }: { current: (typeof ITEMS)[number]["id"] }) {
  const { tr } = useLanguage();
  return (
    <nav aria-label={tr("members.nav.label")} className="hscroll" style={{ marginTop: ".4rem" }}>
      {ITEMS.map((item) => (
        <Link key={item.id} to={item.to} className="chip" aria-current={current === item.id ? "page" : undefined}>
          {tr(item.key)}
        </Link>
      ))}
    </nav>
  );
}
