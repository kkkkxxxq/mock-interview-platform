import React from "react";

type P = { size?: number };

function S(p: P) {
  return {
    width: p.size ?? 18,
    height: p.size ?? 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function SlidersIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </svg>
  );
}

export function ListIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

export function LogOutIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export function ArrowRightIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

export function ArrowLeftIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export function MicIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <rect x="9" y="2" width="6" height="11" rx="2" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" />
    </svg>
  );
}

export function VideoIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="M15 10l5-3v10l-5-3" />
    </svg>
  );
}

export function VolumeIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

export function ActivityIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

export function SparklesIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />
      <path d="M5 3v4M3 5h4M19 17v4M17 19h4" />
    </svg>
  );
}

export function SaveIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}

export function ChevronDownIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function ChevronUpIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

export function PlusIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MinusIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function UploadIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}

export function DownloadIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 11l-5 5-5-5M12 16V3" />
    </svg>
  );
}

export function UserIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <circle cx="12" cy="7" r="4" />
      <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
    </svg>
  );
}

export function MailIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 6l-10 7L2 6" />
    </svg>
  );
}

export function LockIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function StopIcon({ size }: P) {
  return (
    <svg {...S({ size })}>
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}