
export interface LibraryImage {
    id: string;
    category: 'fantasy' | 'scifi' | 'abstract' | 'icon';
    url: string;
    label: string;
}

// Helper to create simple SVG data URIs for "local" storage feel
const createSvg = (color: string, shape: 'circle' | 'rect' | 'diamond', text: string) => {
    const shapes = {
        circle: '<circle cx="32" cy="32" r="30" fill="' + color + '" />',
        rect: '<rect x="4" y="4" width="56" height="56" rx="8" fill="' + color + '" />',
        diamond: '<polygon points="32,2 62,32 32,62 2,32" fill="' + color + '" />'
    };
    
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        ${shapes[shape] || shapes.rect}
        <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="24" fill="rgba(255,255,255,0.8)">${text}</text>
    </svg>
    `.trim();

    return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const normalizeHue = (h: number) => (h % 360 + 360) % 360;
const hsl = (h: number, s: number, l: number) => `hsl(${normalizeHue(h)}, ${Math.max(0, Math.min(100, s))}%, ${Math.max(0, Math.min(100, l))}%)`;

/**
 * Generates a 3-stripe avatar using random color harmony strategies.
 * Includes High Contrast and Low Contrast algorithms to suggest different personality archetypes.
 * @param isLocation If true, applies a strong Gaussian blur for abstract location backgrounds.
 */
export const generateRandomFlagAvatar = (isLocation: boolean = false): string => {
    // Base Seed (Core Personality)
    const seedH = Math.floor(Math.random() * 360);
    const seedS = Math.floor(50 + Math.random() * 30); // 50-80%
    const seedL = Math.floor(40 + Math.random() * 20); // 40-60%

    const strategies = [
        {
            name: "Triadic (Personality/Balanced)",
            description: "Classic Ego/Id/Superego contrast.",
            getColors: () => [
                hsl(seedH + 120, Math.max(0, seedS - 30), Math.min(95, seedL + 35)), // Top: Superego (Light/Rational)
                hsl(seedH, seedS, seedL), // Mid: Ego (Base)
                hsl(seedH + 240, Math.min(100, seedS + 20), Math.max(10, seedL - 25)) // Bot: Id (Dark/Instinct)
            ]
        },
        {
            name: "Analogous (Harmonious/Low Contrast)",
            description: "Colors next to each other. Suggests calmness, consistency, or simplicity.",
            getColors: () => [
                hsl(seedH - 30, seedS, Math.min(90, seedL + 10)), // Top
                hsl(seedH, seedS, seedL), // Mid
                hsl(seedH + 30, seedS, Math.max(20, seedL - 10)) // Bot
            ]
        },
        {
            name: "Complementary (Dynamic/High Contrast)",
            description: "Opposite colors. Suggests conflict, dynamism, or strong duality.",
            getColors: () => [
                hsl(seedH + 180, seedS, Math.min(90, seedL + 20)), // Top: Opposite
                hsl(seedH, seedS, seedL), // Mid
                hsl(seedH + 180, seedS, Math.max(20, seedL - 20)) // Bot: Opposite Darker
            ]
        },
        {
            name: "Monochromatic (Focused/Low Contrast)",
            description: "Same hue, different shades. Suggests obsession, purity, or rigidity.",
            getColors: () => [
                hsl(seedH, Math.max(0, seedS - 20), Math.min(95, seedL + 30)), // Top: Lighter
                hsl(seedH, seedS, seedL), // Mid
                hsl(seedH, Math.min(100, seedS + 20), Math.max(10, seedL - 30)) // Bot: Darker
            ]
        },
        {
            name: "Split Complementary (Vibrant/High Contrast)",
            description: "Base plus two opposites. Suggests complexity and creativity.",
            getColors: () => [
                hsl(seedH + 150, seedS, seedL + 10), // Top
                hsl(seedH, seedS, seedL), // Mid
                hsl(seedH + 210, seedS, seedL - 10) // Bot
            ]
        },
        {
            name: "Neon Dark (Edgy/High Contrast)",
            description: "Dark core with neon accents. Suggests mystery, cyberpunk, or danger.",
            getColors: () => [
                hsl(seedH + 180, 100, 60), // Top: Neon
                hsl(seedH, 20, 20), // Mid: Dark Greyish
                hsl(seedH + 60, 100, 60) // Bot: Neon
            ]
        },
        {
            name: "Pastel (Soft/Low Contrast)",
            description: "High lightness, low saturation. Suggests innocence, dreaminess, or weakness.",
            getColors: () => {
                const s = 60;
                const l = 85;
                return [
                    hsl(seedH + 60, s, l),
                    hsl(seedH, s, l),
                    hsl(seedH - 60, s, l)
                ];
            }
        }
    ];

    // Randomly select a strategy
    const strategy = strategies[Math.floor(Math.random() * strategies.length)];
    const [topColor, midColor, botColor] = strategy.getColors();

    // SVG Construction with optional Blur Filter
    const defs = isLocation 
        ? `<defs><filter id="blur"><feGaussianBlur in="SourceGraphic" stdDeviation="8" /></filter></defs>`
        : '';
    
    const groupStart = isLocation ? `<g filter="url(#blur)">` : `<g>`;
    const groupEnd = `</g>`;

    // Golden Ratio Layout: 1 : 1.618 : 1
    // Total H = 64. 
    // Top ~ 18, Mid ~ 28, Bot ~ 18.
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        ${defs}
        ${groupStart}
            <rect x="-4" y="-4" width="72" height="22" fill="${topColor}" />
            <rect x="-4" y="18" width="72" height="28" fill="${midColor}" />
            <rect x="-4" y="46" width="72" height="22" fill="${botColor}" />
        ${groupEnd}
    </svg>
    `.trim();

    return `data:image/svg+xml;base64,${btoa(svg)}`;
};

export const BUILT_IN_IMAGES: LibraryImage[] = [
    // Characters (Folder 1)
    { id: 'def_warrior', category: 'fantasy', label: '战士', url: createSvg('#ef4444', 'rect', 'WAR') },
    { id: 'def_mage', category: 'fantasy', label: '法师', url: createSvg('#3b82f6', 'rect', 'MAG') },
    { id: 'def_rogue', category: 'fantasy', label: '游侠', url: createSvg('#22c55e', 'rect', 'RNG') },
    { id: 'def_cleric', category: 'fantasy', label: '牧师', url: createSvg('#eab308', 'rect', 'CLR') },
    
    // Items/Cards (Folder 2)
    { id: 'def_sword', category: 'icon', label: '武器', url: createSvg('#64748b', 'diamond', 'ATK') },
    { id: 'def_shield', category: 'icon', label: '防具', url: createSvg('#78716c', 'diamond', 'DEF') },
    { id: 'def_potion', category: 'icon', label: '药水', url: createSvg('#ec4899', 'circle', 'HP') },
    { id: 'def_scroll', category: 'icon', label: '卷轴', url: createSvg('#8b5cf6', 'circle', 'INT') },
];
