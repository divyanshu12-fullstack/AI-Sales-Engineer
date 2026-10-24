export const Brand = ({ compact = false }: { compact?: boolean }) => (
  <a
    className={`brand ${compact ? 'brand--compact' : ''}`}
    href="/"
    aria-label="AsterByte Solutions home"
  >
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M6 24 15.8 6 26 24M10 18h12M6 27h20"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="square"
      />
    </svg>
    <span>
      AsterByte <span className="brand-suffix">Solutions</span>
    </span>
  </a>
);
