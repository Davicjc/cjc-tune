/**
 * Line icons in the spirit of SF Symbols: 1.6 px strokes on a 20 px grid,
 * round caps, `currentColor`, so they follow the theme and the accent.
 */

const base = {
    width: 18,
    height: 18,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
};

export const IconEq = () => (
    <svg {...base}>
        <path d="M5 3v14M10 3v14M15 3v14" opacity=".35" />
        <path d="M3 12.5h4M8 6.5h4M13 10.5h4" />
    </svg>
);

export const IconSparkles = () => (
    <svg {...base}>
        <path d="M9 3.5l1.3 3.7L14 8.5l-3.7 1.3L9 13.5l-1.3-3.7L4 8.5l3.7-1.3z" />
        <path d="M15 12.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
    </svg>
);

export const IconSpeaker = () => (
    <svg {...base}>
        <path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3z" />
        <path d="M13.5 7.2a3.6 3.6 0 010 5.6M15.6 5.2a6.5 6.5 0 010 9.6" />
    </svg>
);

export const IconGear = () => (
    <svg {...base}>
        <circle cx="10" cy="10" r="2.6" />
        <path d="M10 2.8v2M10 15.2v2M2.8 10h2M15.2 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4" />
    </svg>
);

export const IconRestart = () => (
    <svg {...base} width="15" height="15">
        <path d="M15.5 10a5.5 5.5 0 11-1.6-3.9" />
        <path d="M14.3 3v3.4h-3.4" />
    </svg>
);

export const IconCheck = () => (
    <svg {...base} width="15" height="15" strokeWidth="2">
        <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
);

// Effect icons
export const IconFidelity = () => (
    <svg {...base}>
        <path d="M2.5 13c2-6 4-6 5 0s3 6 5 0 3.5-6 5 0" />
    </svg>
);
export const IconAmbience = () => (
    <svg {...base}>
        <path d="M4 15.5V8.2L10 4l6 4.2v7.3" />
        <path d="M8 15.5v-4h4v4" />
    </svg>
);
export const IconDynamic = () => (
    <svg {...base}>
        <path d="M3 10h2.5l1.5-4 2.5 9 2-7 1.5 4H17" />
    </svg>
);
export const IconSurround = () => (
    <svg {...base}>
        <circle cx="10" cy="10" r="1.6" />
        <path d="M6.6 6.6a4.8 4.8 0 000 6.8M13.4 6.6a4.8 4.8 0 010 6.8M4.1 4.1a8.3 8.3 0 000 11.8M15.9 4.1a8.3 8.3 0 010 11.8" />
    </svg>
);
export const IconBass = () => (
    <svg {...base}>
        <circle cx="10" cy="10" r="6.5" />
        <circle cx="10" cy="10" r="3" />
        <circle cx="10" cy="10" r=".6" fill="currentColor" />
    </svg>
);
