
import { GameState, MapChunk, MapLocation, MapRegion, TerrainType, CharPosition } from '../../../types';
import { MAP_CONSTANTS } from '../../../constants';
import { getTerrainTypeAt, isPointInPolygon } from '../../../services/mapUtils';
import { CameraState, RenderObject, ScreenPoint, darkenColor, getTerrainColor, project, pseudoRandom, ProjectionMatrix } from './visualUtils';

interface VisualGridPoint {
    wx: number; wy: number;
    centerX: number; centerY: number;
    step: number;
    z00: number; z10: number; z11: number; z01: number;
    avgZ: number;
    type: TerrainType;
    isCity: boolean;
    isTown: boolean;
    hasBuilding: boolean;
    bHeight: number;
    bPrn: number;
}

export class MapRenderer {
    private visualGrid: VisualGridPoint[] = [];
    private lastChunks: Record<string, MapChunk> = {};
    private lastSettlementsHash: string = "";

    cacheGrid(state: GameState) {
        const currentChunks = state.map.chunks;
        const currentSettlementsHash = JSON.stringify(Object.keys(state.map.settlements || {}));
        
        if (currentChunks === this.lastChunks && currentSettlementsHash === this.lastSettlementsHash && this.visualGrid.length > 0) {
            return;
        }

        this.lastChunks = currentChunks;
        this.lastSettlementsHash = currentSettlementsHash;
        this.visualGrid = [];

        const chunks = Object.values(state.map.chunks) as MapChunk[];
        const settlements = state.map.settlements || {};

        chunks.forEach(chunk => {
            const dataLen = chunk.heightMap.length;
            // Ensure resolution matches constant if changed
            const visualRes = Math.sqrt(dataLen) - 1;
            const step = chunk.size / visualRes;
            const startX = chunk.xIndex * chunk.size;
            const startY = chunk.yIndex * chunk.size;

            for (let i = 0; i < visualRes; i++) {
                for (let j = 0; j < visualRes; j++) {
                    const wx = startX + i * step;
                    const wy = startY + j * step;
                    const centerX = wx + step / 2;
                    const centerY = wy + step / 2;

                    const idx00 = i * (visualRes + 1) + j;
                    const idx10 = (i + 1) * (visualRes + 1) + j;
                    const idx11 = (i + 1) * (visualRes + 1) + j + 1;
                    const idx01 = i * (visualRes + 1) + j + 1;

                    const z00 = chunk.heightMap[idx00] ?? 0;
                    const z10 = chunk.heightMap[idx10] ?? 0;
                    const z11 = chunk.heightMap[idx11] ?? 0;
                    const z01 = chunk.heightMap[idx01] ?? 0;
                    const avgZ = (z00 + z10 + z11 + z01) / 4;

                    const tData = getTerrainTypeAt(centerX, centerY, chunk.seed, { [`${chunk.xIndex}_${chunk.yIndex}`]: chunk }, settlements);
                    const type = tData.type;
                    const isCity = type === TerrainType.CITY;
                    const isTown = type === TerrainType.TOWN;

                    let hasBuilding = false;
                    let bHeight = 0;
                    let bPrn = 0;

                    if (isCity || isTown) {
                        bPrn = pseudoRandom(centerX, centerY);
                        const density = isCity ? 0.6 : 0.4;
                        if (bPrn > (1 - density)) {
                            hasBuilding = true;
                            bHeight = isCity ? (20 + bPrn * 80) : (8 + bPrn * 15);
                        }
                    }

                    this.visualGrid.push({
                        wx, wy, centerX, centerY, step,
                        z00, z10, z11, z01, avgZ,
                        type, isCity, isTown,
                        hasBuilding, bHeight, bPrn
                    });
                }
            }
        });
    }

    render(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        camera: CameraState,
        state: GameState,
        viewingLocationId?: string | null,
        getZ?: (x: number, y: number) => number
    ) {
        const { yaw, scale, pitch } = camera;
        
        // 1. Pre-calculate Projection Matrix to save CPU cycles
        const m: ProjectionMatrix = {
            cx: width / 2,
            cy: height / 2,
            panX: camera.pan.x,
            panY: camera.pan.y,
            panZ: camera.pan.z,
            scale: scale,
            cosYaw: Math.cos(yaw),
            sinYaw: Math.sin(yaw),
            scaleCosPitch: scale * Math.cos(pitch),
            scaleSinPitch: scale * Math.sin(pitch)
        };

        // 2. Clear Screen
        ctx.clearRect(0, 0, width, height);
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(1, '#1e293b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        const worldQueue: RenderObject[] = [];
        const overlayQueue: RenderObject[] = [];
        const regions = Object.values(state.map.regions || {}) as MapRegion[];
        
        // Culling bounds
        const cullXMin = -200;
        const cullXMax = width + 200;
        const cullYMin = -200;
        const cullYMax = height + 200;

        const faceNormalsX = [m.sinYaw, m.cosYaw, -m.sinYaw, -m.cosYaw];
        const SEA_LEVEL = MAP_CONSTANTS.SEA_LEVEL;

        // 3. Terrain & Buildings Loop
        const gridLen = this.visualGrid.length;
        for (let i = 0; i < gridLen; i++) {
            const pt = this.visualGrid[i];
            
            // Fast culling check using center point ground projection
            const p00 = project(pt.wx, pt.wy, 0, m);
            if (p00.x < cullXMin || p00.x > cullXMax || p00.y < cullYMin || p00.y > cullYMax) {
                // Allow some depth margin for tall objects, but otherwise skip
                if (p00.depth < -2000) continue; 
            }
            
            const centerP = project(pt.centerX, pt.centerY, pt.avgZ, m);
            
            const minZ = Math.min(pt.z00, pt.z10, pt.z11, pt.z01);
            const maxZ = Math.max(pt.z00, pt.z10, pt.z11, pt.z01);

            // --- A. Water Plane Rendering ---
            // Render water if it's explicitly a water tile, OR if any part of the land is below sea level (to fill gaps)
            if (pt.type === TerrainType.WATER || minZ < SEA_LEVEL) {
                const w00 = project(pt.wx, pt.wy, SEA_LEVEL, m);
                const w10 = project(pt.wx + pt.step, pt.wy, SEA_LEVEL, m);
                const w11 = project(pt.wx + pt.step, pt.wy + pt.step, SEA_LEVEL, m);
                const w01 = project(pt.wx, pt.wy + pt.step, SEA_LEVEL, m);
                
                // Use opaque color for water to occlude underwater artifacts
                worldQueue.push({ 
                    type: 'water', 
                    depth: centerP.depth, // Use same depth as terrain to allow natural Z-sorting
                    points: [w00, w10, w11, w01], 
                    color: '#1e50a0' // Opaque Blue
                });
            }

            // --- B. Land/Terrain Rendering ---
            // If it is Water type, we only draw the flat plane above.
            // If it is River type, we draw it as terrain but with water color.
            // If it is Land type, we apply the Z-axis culling rule.
            if (pt.type !== TerrainType.WATER) {
                
                // Rule 2: If ALL vertices are below sea level, DO NOT render the land mesh.
                // This culling prevents underwater terrain from interfering with the water plane visually
                // and saves performance.
                if (maxZ < SEA_LEVEL) {
                    // Do nothing for terrain mesh
                } else {
                    // Rule 1: If at least one vertex is above sea level (maxZ >= SEA_LEVEL), render the full tile.
                    const pp00 = project(pt.wx, pt.wy, pt.z00, m);
                    const pp10 = project(pt.wx + pt.step, pt.wy, pt.z10, m);
                    const pp11 = project(pt.wx + pt.step, pt.wy + pt.step, pt.z11, m);
                    const pp01 = project(pt.wx, pt.wy + pt.step, pt.z01, m);

                    let color = getTerrainColor(pt.avgZ, pt.type);
                    let borderColor = darkenColor(color, 0.85);

                    if (pt.type === TerrainType.RIVER) {
                        color = 'rgb(40, 90, 160)';
                        borderColor = 'rgba(100, 150, 255, 0.3)';
                    }

                    worldQueue.push({ 
                        type: 'terrain', 
                        depth: centerP.depth, 
                        points: [pp00, pp10, pp11, pp01], 
                        color, 
                        borderColor 
                    });

                    // Buildings
                    if (pt.hasBuilding && scale > 0.15) {
                        const bWidth = pt.step * 0.6;
                        const bx = pt.centerX - bWidth / 2;
                        const by = pt.centerY - bWidth / 2;
                        const baseZ = pt.avgZ;
                        const topZ = baseZ + pt.bHeight;
                        const roofColor = 'rgb(241, 245, 249)';
                        const sideColorBase = pt.isCity ? 'rgb(203, 213, 225)' : 'rgb(168, 162, 158)';
                        
                        const getFaceDepth = (p1: ScreenPoint, p2: ScreenPoint, p3: ScreenPoint, p4: ScreenPoint) => (p1.depth + p2.depth + p3.depth + p4.depth) / 4;
                        const getFaceColor = (idx: number) => { const nx = faceNormalsX[idx]; if (nx < 0) return sideColorBase; return darkenColor(sideColorBase, 0.7); };
                        
                        const bb0 = project(bx, by, baseZ, m); const bb1 = project(bx + bWidth, by, baseZ, m); const bb2 = project(bx + bWidth, by + bWidth, baseZ, m); const bb3 = project(bx, by + bWidth, baseZ, m);
                        const bt0 = project(bx, by, topZ, m); const bt1 = project(bx + bWidth, by, topZ, m); const bt2 = project(bx + bWidth, by + bWidth, topZ, m); const bt3 = project(bx, by + bWidth, topZ, m);
                        
                        worldQueue.push({ type: 'building_face', depth: getFaceDepth(bb0, bb1, bt1, bt0), points: [bb0, bb1, bt1, bt0], color: getFaceColor(0), borderColor: darkenColor(getFaceColor(0), 0.8) });
                        worldQueue.push({ type: 'building_face', depth: getFaceDepth(bb1, bb2, bt2, bt1), points: [bb1, bb2, bt2, bt1], color: getFaceColor(1), borderColor: darkenColor(getFaceColor(1), 0.8) });
                        worldQueue.push({ type: 'building_face', depth: getFaceDepth(bb2, bb3, bt3, bt2), points: [bb2, bb3, bt3, bt2], color: getFaceColor(2), borderColor: darkenColor(getFaceColor(2), 0.8) });
                        worldQueue.push({ type: 'building_face', depth: getFaceDepth(bb3, bb0, bt0, bt3), points: [bb3, bb0, bt0, bt3], color: getFaceColor(3), borderColor: darkenColor(getFaceColor(3), 0.8) });
                        worldQueue.push({ type: 'building_face', depth: getFaceDepth(bt0, bt1, bt2, bt3), points: [bt0, bt1, bt2, bt3], color: roofColor, borderColor: '#cbd5e1' });
                    }
                }
            }

            // Region Points (Approximate)
            if (i % 3 === 0) { // Check fewer points for region overlap to save perf
                for (const region of regions) {
                    if (isPointInPolygon({ x: pt.centerX, y: pt.centerY }, region.vertices)) {
                        const drawZ = Math.max(pt.avgZ, MAP_CONSTANTS.SEA_LEVEL) + 2;
                        const pReg = project(pt.centerX, pt.centerY, drawZ, m);
                        overlayQueue.push({ type: 'region_point', depth: pReg.depth - 0.2, x: pReg.x, y: pReg.y, size: 1.5, color: region.color ? region.color.replace(/[\d.]+\)$/, '0.6)') : 'rgba(255,255,255,0.4)' });
                        break;
                    }
                }
            }
        }

        // 4. Region Boundaries
        regions.forEach(region => {
            const projectedVerts = region.vertices.map(v => { 
                const z = getZ ? getZ(v.x, v.y) + 50 : 50; 
                return project(v.x, v.y, z, m); 
            });
            // Optimization: check bounds of projected verts before pushing
            if (projectedVerts.every(p => p.x < cullXMin || p.x > cullXMax || p.y < cullYMin || p.y > cullYMax)) return;

            const avgDepth = projectedVerts.reduce((s, p) => s + p.depth, 0) / projectedVerts.length;
            overlayQueue.push({ type: 'region_boundary', depth: avgDepth, points: projectedVerts, color: region.color ? region.color.replace(/[\d.]+\)$/, '1.0)') : 'white', label: region.name });
        });

        // 4.5. Pre-calculate Character Counts (Real-time based on existing characters)
        // Fix: Do not rely solely on map.charPositions count, but verify character existence
        const charCountsByLoc: Record<string, number> = {};
        Object.keys(state.characters).forEach(charId => {
            const pos = state.map.charPositions[charId];
            if (pos && pos.locationId) {
                charCountsByLoc[pos.locationId] = (charCountsByLoc[pos.locationId] || 0) + 1;
            }
        });

        // 5. Locations
        (Object.values(state.map.locations) as MapLocation[]).forEach(loc => {
            const terrainZ = getZ ? getZ(loc.coordinates.x, loc.coordinates.y) : loc.coordinates.z;
            const baseZ = Math.max(terrainZ, MAP_CONSTANTS.SEA_LEVEL);
            const displayZ = baseZ + 120;
            
            const screen = project(loc.coordinates.x, loc.coordinates.y, displayZ, m);
            
            if (screen.x < cullXMin || screen.x > cullXMax || screen.y < cullYMin || screen.y > cullYMax) return;

            // Project ground point for visual anchor
            const screenGround = project(loc.coordinates.x, loc.coordinates.y, baseZ, m);

            // Use the verified count
            const count = charCountsByLoc[loc.id] || 0;
            
            // Push Anchor (Line & Dot) to WORLD Queue to participate in depth sorting with terrain
            worldQueue.push({
                type: 'location_anchor',
                depth: screenGround.depth, // Use ground depth for proper sorting against terrain
                points: [screenGround, screen] // Point 0 is Ground, Point 1 is Icon
            });

            // Push Icon to Overlay Queue
            overlayQueue.push({
                type: 'location',
                depth: screen.depth,
                x: screen.x, y: screen.y, z: 0, 
                size: Math.max(8, 16 * scale),
                label: loc.name,
                isKnown: loc.isKnown,
                isSelected: loc.id === viewingLocationId,
                isActive: loc.id === state.map.activeLocationId,
                id: loc.id,
                charCount: count,
                // groundPoint removed from overlay object to avoid duplicate logic
            });
        });

        // 6. Sort and Draw
        worldQueue.sort((a, b) => b.depth - a.depth);
        overlayQueue.sort((a, b) => b.depth - a.depth);

        const draw = (obj: RenderObject) => {
            if (obj.type === 'location_anchor') {
                if (obj.points && obj.points.length >= 2) {
                    const pGround = obj.points[0];
                    const pIcon = obj.points[1];

                    // Line
                    ctx.beginPath();
                    ctx.moveTo(pGround.x, pGround.y);
                    ctx.lineTo(pIcon.x, pIcon.y);
                    ctx.strokeStyle = 'rgba(14, 165, 233, 0.6)'; // Sky-500 with opacity
                    ctx.lineWidth = 1;
                    ctx.setLineDash([2, 2]); 
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Ground Dot
                    ctx.beginPath();
                    ctx.arc(pGround.x, pGround.y, 2.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#0ea5e9'; // Sky-500
                    ctx.fill();
                    // Dot Glow
                    ctx.shadowBlur = 4;
                    ctx.shadowColor = '#0ea5e9';
                    ctx.fillStyle = '#bae6fd'; // Sky-200 center
                    ctx.beginPath();
                    ctx.arc(pGround.x, pGround.y, 1, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            } else if (obj.type === 'location') {
                // Icon Circle
                ctx.beginPath();
                ctx.arc(obj.x!, obj.y!, obj.size!, 0, Math.PI * 2);
                ctx.fillStyle = obj.isActive ? '#ef4444' : (obj.isKnown ? '#0ea5e9' : '#64748b');
                ctx.fill();
                ctx.lineWidth = obj.isSelected ? 3 : 2;
                ctx.strokeStyle = obj.isSelected ? '#fde047' : 'white';
                ctx.stroke();

                if (obj.charCount !== undefined) {
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(obj.charCount.toString(), obj.x!, obj.y!);
                }

                if (obj.isKnown || scale > 0.15 || obj.isSelected || obj.isActive) {
                    ctx.font = 'bold 12px sans-serif'; // Slightly larger
                    ctx.textAlign = 'right'; // Left of icon
                    ctx.textBaseline = 'middle';
                    
                    const textX = obj.x! - obj.size! - 8;
                    const textY = obj.y!;

                    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                    ctx.strokeText(obj.label || '', textX, textY);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(obj.label || '', textX, textY);
                }
            } else if (obj.type === 'region_point') {
                ctx.beginPath();
                ctx.arc(obj.x!, obj.y!, obj.size!, 0, Math.PI * 2);
                ctx.fillStyle = obj.color || 'rgba(255,255,255,0.5)';
                ctx.fill();
            } else if (obj.type === 'region_boundary') {
                if (obj.points && obj.points.length > 1) {
                    ctx.beginPath();
                    ctx.moveTo(obj.points[0].x, obj.points[0].y);
                    for (let i = 1; i < obj.points.length; i++) {
                        ctx.lineTo(obj.points[i].x, obj.points[i].y);
                    }
                    ctx.closePath();
                    ctx.strokeStyle = obj.color || 'white';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([4, 2]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    
                    if (obj.label) {
                        let lx = 0, ly = 0;
                        obj.points.forEach(p => { lx += p.x; ly += p.y; });
                        lx /= obj.points.length; ly /= obj.points.length;
                        ctx.font = 'italic bold 10px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                        ctx.strokeText(obj.label, lx, ly);
                        ctx.fillStyle = obj.color || 'white';
                        ctx.fillText(obj.label, lx, ly);
                    }
                }
            } else {
                // Terrain / Building Face / Water
                if (!obj.points) return;
                ctx.beginPath();
                ctx.moveTo(obj.points[0].x, obj.points[0].y);
                for (let i = 1; i < obj.points.length; i++) ctx.lineTo(obj.points[i].x, obj.points[i].y);
                ctx.closePath();
                ctx.fillStyle = obj.color!;
                ctx.fill();
                
                // Draw borders only for terrain/buildings, not water (unless needed)
                if (obj.borderColor && (obj.type === 'terrain' || obj.type === 'building_face') && scale > 0.2) {
                    ctx.strokeStyle = obj.borderColor;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        };

        worldQueue.forEach(draw);
        overlayQueue.forEach(draw);
    }
}
