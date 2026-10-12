import type { ReactNode } from "react";

/** The small-caps day marker: "Day 3 of 11 · Sat Oct 17". */
export function Folio({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`folio ${className}`.trim()}>{children}</div>;
}

const RIDGE: [number, number][] = [[0, 78], [34, 70], [58, 52], [96, 66], [128, 38], [150, 60], [186, 46], [212, 70], [250, 58], [282, 34], [304, 56], [338, 48], [372, 66], [430, 58]];

interface RidgelineProps {
  /** Minutes since local midnight. */
  minutes: number;
  rise: number;
  set: number;
  wide: boolean;
  label: string;
}

/**
 * A printed ridgeline with the sun placed by time of day and a creek below.
 * Mirrored end to end and tiled three times on the Daylight so it fills the
 * width. Decorative detail only: the label names it for screen readers.
 */
export function Ridgeline({ minutes, rise, set, wide, label }: RidgelineProps) {
  const k = wide ? 3 : 1;
  const W = 430 * k;
  const H = 96;
  const top = 26;
  const t = Math.max(0, Math.min(1, (minutes - rise) / (set - rise)));
  const x = 34 + t * (W - 68);
  const y = H - 28 - Math.sin(t * Math.PI) * (H - 62);
  let ridge = "";
  for (let i = 0; i < k; i++) {
    const seg = i % 2 ? RIDGE.map(([px, py]) => [430 - px, py] as [number, number]).reverse() : RIDGE;
    for (const [px, py] of seg) ridge += `${ridge ? "L" : "M"}${px + 430 * i} ${py} `;
  }
  let creek = `M0 ${H - 12}`;
  for (let i = 0; i < Math.ceil(W / 60) + 1; i++) creek += i ? " t60 0" : " q30 -7 60 0";
  return (
    <div className="horizon">
      <svg viewBox={`0 ${top} ${W} ${H - top}`} preserveAspectRatio="xMidYMax slice" role="img" aria-label={label}>
        <circle cx={x.toFixed(0)} cy={y.toFixed(0)} r="13" style={{ fill: "var(--sun)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
        <path d={`${ridge}V${H} H0Z`} style={{ fill: "var(--paper)" }} />
        <path d={ridge} style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 1.8, strokeLinejoin: "round" }} />
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M0 ${84 + i * 6} H${W}`} style={{ stroke: "var(--ink)", strokeOpacity: 0.5 - i * 0.1, strokeWidth: 1 }} />
        ))}
        <path d={creek} style={{ fill: "none", stroke: "var(--water)", strokeWidth: 2.4, strokeLinecap: "round" }} />
      </svg>
    </div>
  );
}
