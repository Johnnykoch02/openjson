import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const GraphIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="5" cy="12" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M7.3 10.8 15.7 7M7.3 13.2l8.4 3.8" />
  </svg>
);

export const SchemaIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <rect x="3" y="10" width="18" height="4" rx="1" />
    <rect x="3" y="16" width="18" height="4" rx="1" />
  </svg>
);

export const QueryIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const CompareIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v18" />
    <path d="M5 7 8 4 5 1M8 4H4a2 2 0 0 0-2 2v3" transform="translate(0 2)" />
    <path d="M19 13l-3 3 3 3M16 16h4a2 2 0 0 0 2-2v-3" transform="translate(0 -2)" />
  </svg>
);

export const FileIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
);

export const PlusIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const SwapIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 4 4 7l3 3" />
    <path d="M4 7h12a4 4 0 0 1 0 8h-1" />
    <path d="m17 20 3-3-3-3" />
    <path d="M20 17H8a4 4 0 0 1 0-8h1" transform="translate(0 0)" />
  </svg>
);

export const ChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const ShieldIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const BoltIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </svg>
);

export const TreeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="9" width="7" height="5" rx="1" />
    <rect x="14" y="16" width="7" height="5" rx="1" />
    <path d="M6.5 8v7a2 2 0 0 0 2 2H14M14 11.5h-2.5a2 2 0 0 1-2-2" />
  </svg>
);

export const CopyIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

export const ExternalIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
  </svg>
);

export const CoffeeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 9h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" />
    <path d="M17 10h2.5a2.5 2.5 0 0 1 0 5H17" />
    <path d="M7 4v2M11 4v2M15 4v2" />
  </svg>
);

export const Logo = (p: IconProps) => (
  <svg width={26} height={26} viewBox="0 0 32 32" fill="none" {...p}>
    <rect width="32" height="32" rx="8" fill="url(#oj-grad)" />
    <path
      d="M10 11c-1.5 0-2 .8-2 2.2v1.4c0 1-.4 1.4-1.4 1.4v1.6c1 0 1.4.4 1.4 1.4v1.4c0 1.4.5 2.2 2 2.2"
      stroke="#fff"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M22 11c1.5 0 2 .8 2 2.2v1.4c0 1 .4 1.4 1.4 1.4v1.6c-1 0-1.4.4-1.4 1.4v1.4c0 1.4-.5 2.2-2 2.2"
      stroke="#fff"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="16" cy="16" r="1.6" fill="#fff" />
    <defs>
      <linearGradient id="oj-grad" x1="0" y1="0" x2="32" y2="32">
        <stop stopColor="#6e7bff" />
        <stop offset="1" stopColor="#9d6bff" />
      </linearGradient>
    </defs>
  </svg>
);
