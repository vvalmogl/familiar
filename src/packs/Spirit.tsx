import type { Mood } from "./types";

/** The built-in companion: a little floating spirit, drawn in SVG and tinted by the theme. */
export default function Spirit({ mood }: { mood: Mood }) {
  const happy = mood === "happy" || mood === "intro";
  return (
    <svg className={`spirit mood-${mood}`} viewBox="0 0 200 200" width="100%" height="100%">
      <defs>
        <radialGradient id="sp-body" cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="55%" stopColor="var(--accent2)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--frame)" stopOpacity="0.85" />
        </radialGradient>
        <filter id="sp-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="sp-float">
        <path
          filter="url(#sp-glow)"
          fill="url(#sp-body)"
          d="M100 28c36 0 58 27 58 62v54c0 8-9 12-15 6-6-6-13-6-19 0-6 6-13 6-19 0s-13-6-19 0-13 6-19 0-13-6-19 0c-6 6-15 2-15-6V90c0-35 22-62 58-62z"
        />
        {/* eyes */}
        {happy ? (
          <g stroke="#2a2233" strokeWidth="5" strokeLinecap="round" fill="none">
            <path d="M68 92q10-12 20 0" />
            <path d="M112 92q10-12 20 0" />
          </g>
        ) : (
          <g className="sp-eyes" fill="#2a2233">
            <ellipse cx="78" cy="92" rx="9" ry="12" />
            <ellipse cx="122" cy="92" rx="9" ry="12" />
            <circle cx="81" cy="87" r="3.5" fill="#fff" />
            <circle cx="125" cy="87" r="3.5" fill="#fff" />
          </g>
        )}
        {/* blush */}
        <ellipse cx="62" cy="110" rx="9" ry="5" fill="var(--accent)" opacity="0.35" />
        <ellipse cx="138" cy="110" rx="9" ry="5" fill="var(--accent)" opacity="0.35" />
        {/* mouth */}
        {mood === "talking" ? (
          <ellipse className="sp-mouth-talk" cx="100" cy="116" rx="8" ry="6" fill="#2a2233" />
        ) : (
          <path d="M92 113q8 8 16 0" stroke="#2a2233" strokeWidth="4" strokeLinecap="round" fill="none" />
        )}
      </g>

      {mood === "thinking" && (
        <g className="sp-dots" fill="var(--accent2)">
          <circle cx="150" cy="30" r="6" />
          <circle cx="168" cy="30" r="6" />
          <circle cx="186" cy="30" r="6" />
        </g>
      )}
    </svg>
  );
}
