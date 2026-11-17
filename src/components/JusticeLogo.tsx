interface Props { size?: number; className?: string }
export function JusticeLogo({ size = 68, className = '' }: Props) {
  return (
    <svg aria-label="Símbolo da Justiça" role="img" className={className} width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sied-metal" x1="10" y1="0" x2="90" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" /><stop offset=".32" stopColor="#c5d0e0" />
          <stop offset=".65" stopColor="#71819b" /><stop offset="1" stopColor="#eaf1fa" />
        </linearGradient>
      </defs>
      <g stroke="url(#sied-metal)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M50 18V80M25 83h50M34 76h32M16 36h68M50 23L16 36M50 23l34 13" />
        <path d="m16 36-11 26h22L16 36ZM84 36 73 62h22L84 36Z"/>
        <path d="M5 62c2.4 9 19.6 9 22 0M73 62c2.4 9 19.6 9 22 0" />
        <circle cx="50" cy="17" r="5" fill="#dce5f0" />
      </g>
      <path d="M20 90h60" stroke="#9ba8ba" strokeWidth="1.5" strokeLinecap="round" opacity=".6" />
    </svg>
  );
}
