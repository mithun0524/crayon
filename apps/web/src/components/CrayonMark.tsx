// A little crayon, tilted — the wordmark glyph. Body takes the live accent so
// it recolors with the palette; paper wrapper stays warm ivory.
export default function CrayonMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <g transform="rotate(-38 16 16)">
        {/* barrel */}
        <rect x="11" y="7.5" width="10" height="15" rx="2.2" fill="var(--accent)" />
        {/* label band */}
        <rect x="11" y="12.5" width="10" height="4.5" fill="rgba(8,8,10,0.28)" />
        {/* tip */}
        <path d="M11 22.5 L16 28 L21 22.5 Z" fill="#f4f1ea" />
        <path d="M13.6 24.9 L16 27.6 L18.4 24.9 Z" fill="var(--accent)" />
        {/* top cap */}
        <rect x="11" y="7.5" width="10" height="2.4" rx="1.2" fill="#f4f1ea" opacity="0.9" />
      </g>
    </svg>
  );
}
