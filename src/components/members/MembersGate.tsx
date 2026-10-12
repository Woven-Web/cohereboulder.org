import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { openSignInDialog } from "@/lib/signin";
import type { CircleStatus } from "@/hooks/useCircleAccess";

interface Props {
  status: Exclude<CircleStatus, "member">;
  onRetry?: () => void;
}

/**
 * The warm gate for everything members-only: never a list, a count or a hint of
 * what is behind it. Loading and error are told apart from "not a member".
 */
export function MembersGate({ status, onRetry }: Props) {
  const { tr } = useLanguage();
  if (status === "loading") return <p className="small" role="status" style={{ padding: "3rem 0" }}>{tr("members.loading")}</p>;
  if (status === "error") {
    return (
      <div className="gate" data-testid="members-error">
        <p className="lede">{tr("members.loadError")}</p>
        {onRetry && <button type="button" className="btn btn--line btn--sm" onClick={onRetry}>{tr("members.retry")}</button>}
      </div>
    );
  }
  if (status === "off") {
    return (
      <div className="gate" data-testid="members-gate" data-gate="off">
        <h2 className="h3">{tr("members.gate.soonTitle")}</h2>
        <p className="lede">{tr("members.gate.soonBody")}</p>
        <div className="gate__acts"><Link className="btn btn--primary" to="/register">{tr("members.gate.join")}</Link></div>
      </div>
    );
  }
  const signedOut = status === "signed-out";
  return (
    <div className="gate" data-testid="members-gate" data-gate={status}>
      <h2 className="h3">{tr(signedOut ? "members.gate.signedOutTitle" : "members.gate.notMemberTitle")}</h2>
      <p className="lede">{tr(signedOut ? "members.gate.signedOutBody" : "members.gate.notMemberBody")}</p>
      <ul>
        <li>{tr("members.gate.point1")}</li>
        <li>{tr("members.gate.point2")}</li>
      </ul>
      <div className="gate__acts">
        {signedOut && <button type="button" className="btn btn--primary" onClick={openSignInDialog}>{tr("members.gate.signIn")}</button>}
        <Link className={`btn ${signedOut ? "btn--line" : "btn--primary"}`} to="/register">{tr("members.gate.join")}</Link>
      </div>
    </div>
  );
}
