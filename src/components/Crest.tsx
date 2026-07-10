/** Geometrisches TuS-1865-Wappen (SVG, themt sich über die Club-Tokens). */
export function Crest({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-label="Vereinswappen TuS Köln-Ehrenfeld 1865"
      role="img"
    >
      <path
        d="M24 2 44 8v16c0 11-8.5 18.5-20 22C12.5 42.5 4 35 4 24V8Z"
        fill="var(--club-900)"
        stroke="var(--club-acc)"
        strokeWidth="2"
      />
      <path d="M4.5 18h39v6.5h-39z" fill="var(--club-acc)" />
      <text
        x="24"
        y="16"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontWeight="800"
        fontSize="11"
        fill="var(--club-on)"
      >
        TuS
      </text>
      <text
        x="24"
        y="37"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontWeight="800"
        fontSize="10"
        fill="var(--club-on)"
      >
        1865
      </text>
    </svg>
  )
}
