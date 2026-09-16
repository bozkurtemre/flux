/**
 * Flux product mark: a thick teal frame around a black field carrying the F.
 * The same artwork ships as the app icon; see assets/logo-app.svg.
 */
export function Logo({ size = 18, radius }: { size?: number; radius?: number }) {
  const id = "fluxTeal";
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-label="Flux">
      <defs>
        <linearGradient id={id} x1="6" y1="2" x2="122" y2="126" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8CF7E2" />
          <stop offset="0.35" stopColor="#22C8B2" />
          <stop offset="0.72" stopColor="#109AA0" />
          <stop offset="1" stopColor="#0A6180" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx={radius ?? 29} fill={`url(#${id})`} />
      <rect x="14" y="14" width="100" height="100" rx="15" fill="#111214" />
      <path d="M46 40H82V52H57V58H75V69H57V87H46Z" fill="#ffffff" />
    </svg>
  );
}
