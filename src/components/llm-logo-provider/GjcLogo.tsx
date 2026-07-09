type GjcLogoProps = {
  className?: string;
};

// gjc (Gajae Code) provider mark. Deliberately a teal rounded-square "gjc" badge so
// it is unmistakable next to Claude/Codex/Cursor/OpenCode — distinct colour AND
// silhouette — instead of reusing the Claude logo (which made gjc sessions
// indistinguishable in the sidebar/session list/chat header).
const GjcLogo = ({ className = 'w-5 h-5' }: GjcLogoProps) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    role="img"
    aria-label="gjc"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#14b8a6" />
    <text
      x="12"
      y="16.5"
      textAnchor="middle"
      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      fontSize="9.5"
      fontWeight="700"
      fill="#ffffff"
    >
      gjc
    </text>
  </svg>
);

export default GjcLogo;
