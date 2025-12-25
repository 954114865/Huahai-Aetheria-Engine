
import { TerrainType } from '../../../types';
import { MAP_CONSTANTS } from '../../../constants';

export interface ScreenPoint { x: number; y: number; depth: number; }

export interface RenderObject {
    type: 'terrain' | 'water' | 'location' | 'char' | 'region_point' | 'region_boundary' | 'building_face' | 'location_anchor';
    depth: number;
    points?: ScreenPoint[];
    groundPoint?: ScreenPoint; // Anchor point on the terrain surface
    color?: string;
    borderColor?: string;
    x?: number;
    y?: number;
    z?: number;
    size?: number;
    label?: string;
    isKnown?: boolean;
    isSelected?: boolean;
    isActive?: boolean;
    id?: string;
    charCount?: number;
}

export interface CameraState {
    yaw: number;
    pitch: number;
    scale: number;
    pan: { x: number; y: number; z: number };
}

// Pre-calculated values for projection to avoid Math.sin/cos spam
export interface ProjectionMatrix {
    cx: number;
    cy: number;
    panX: number;
    panY: number;
    panZ: number;
    scale: number;
    cosYaw: number;
    sinYaw: number;
    scaleCosPitch: number;
    scaleSinPitch: number;
}

export const COLOR_STOPS = [
    { h: -300, r: 5, g: 10, b: 40 },    // Abyss
    { h: -50, r: 10, g: 30, b: 90 },    // Deep Water
    { h: 0, r: 30, g: 80, b: 160 },     // Water Surface
    { h: 2, r: 210, g: 190, b: 140 },   // Beach Start
    { h: 12, r: 210, g: 190, b: 140 },  // Beach End
    { h: 15, r: 50, g: 140, b: 60 },    // Grass Start
    { h: 150, r: 40, g: 120, b: 50 },   // Grass End
    { h: 160, r: 100, g: 90, b: 80 },   // Rock/Highland Start
    { h: 240, r: 90, g: 85, b: 85 },    // Rock/Highland End
    { h: 250, r: 200, g: 210, b: 220 }, // Snow Transition Start
    { h: 350, r: 255, g: 255, b: 255 }  // Pure Snow
];

export const getTerrainColor = (z: number, type: TerrainType = TerrainType.LAND): string => {
    if (type === TerrainType.CITY) return `rgb(100, 116, 139)`;
    if (type === TerrainType.TOWN) return `rgb(105, 105, 105)`;

    if (z < MAP_CONSTANTS.SEA_LEVEL) {
        return `rgb(30, 80, 160)`; // Opaque Water
    }

    let lower = COLOR_STOPS[2];
    let upper = COLOR_STOPS[COLOR_STOPS.length - 1];

    for (let i = 2; i < COLOR_STOPS.length - 1; i++) {
        if (z >= COLOR_STOPS[i].h && z <= COLOR_STOPS[i + 1].h) {
            lower = COLOR_STOPS[i];
            upper = COLOR_STOPS[i + 1];
            break;
        }
    }

    const range = upper.h - lower.h;
    const t = range === 0 ? 0 : Math.max(0, Math.min(1, (z - lower.h) / range));

    const r = Math.round(lower.r + (upper.r - lower.r) * t);
    const g = Math.round(lower.g + (upper.g - lower.g) * t);
    const b = Math.round(lower.b + (upper.b - lower.b) * t);
    return `rgb(${r},${g},${b})`;
};

export const darkenColor = (rgbStr: string, amount: number = 0.8): string => {
    const match = rgbStr.match(/\d+/g);
    if (!match) return rgbStr;
    const [r, g, b] = match.map(Number);
    return `rgb(${Math.round(r * amount)},${Math.round(g * amount)},${Math.round(b * amount)})`;
};

export const pseudoRandom = (x: number, y: number): number => {
    return Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
};

// Optimized projection using pre-calc matrix
export const project = (x: number, y: number, z: number, m: ProjectionMatrix): ScreenPoint => {
    const wx = (x - m.panX);
    const wy = (y - m.panY);

    const rx = wx * m.cosYaw - wy * m.sinYaw;
    const ry = wx * m.sinYaw + wy * m.cosYaw;

    const relativeZ = z - m.panZ;
    const screenX = m.cx + rx * m.scale;
    
    // Original: const screenY = cy - ry * camera.scale * Math.cos(camera.pitch) - relativeZ * camera.scale * Math.sin(camera.pitch);
    const screenY = m.cy - ry * m.scaleCosPitch - relativeZ * m.scaleSinPitch;

    return { x: screenX, y: screenY, depth: ry };
};
