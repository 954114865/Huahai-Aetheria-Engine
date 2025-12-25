import React, { useEffect, useRef, useState } from 'react';
import { CameraState } from './visualUtils';
import { GameState, MapLocation } from '../../../types';
import { MAP_CONSTANTS } from '../../../constants';

interface UseMapInteractionProps {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    cameraRef: React.MutableRefObject<CameraState>;
    updateCamera: (updater: (prev: CameraState) => CameraState) => void;
    isMapLocked: boolean;
    state: GameState;
    getZ: (x: number, y: number) => number;
    dimensions: { width: number, height: number };
    onLocationSelect: (id: string) => void;
    onCreateLocation?: (x: number, y: number) => void;
}

export const useMapInteraction = ({
    canvasRef,
    cameraRef,
    updateCamera,
    isMapLocked,
    state,
    getZ,
    dimensions,
    onLocationSelect,
    onCreateLocation
}: UseMapInteractionProps) => {
    const [isCreatingLocation, setIsCreatingLocation] = useState(false);

    const interactionState = useRef({
        isDragging: false,
        dragButton: -1,
        hasMoved: false
    });

    const touchState = useRef({
        lastDistance: 0,
        lastMidpoint: { x: 0, y: 0 },
        lastSingle: { x: 0, y: 0 },
        isZooming: false
    });

    // --- Raycasting ---
    // Accurate raycast against terrain heightmap using binary search
    const raycastTerrain = (mx: number, my: number) => {
        const { yaw, pitch, scale, pan } = cameraRef.current;
        const cx = dimensions.width / 2;
        const cy = dimensions.height / 2;

        // Projection formulas derivation:
        // screenY = cy - ry * scale * cos(pitch) - (z - pan.z) * scale * sin(pitch)
        // Let K = (my - cy) / scale
        // K = - ry * cos(pitch) - (z - pan.z) * sin(pitch)
        // z = pan.z - (K + ry * cos(pitch)) / sin(pitch)
        
        const K = (my - cy) / scale;
        const sinP = Math.sin(pitch);
        const cosP = Math.cos(pitch);
        
        // Avoid division by zero if looking straight at horizon (unlikely with map camera constraints)
        if (Math.abs(sinP) < 0.01) return { x: pan.x, y: pan.y };

        const term1 = pan.z - K / sinP;
        const slope = cosP / sinP; // cot(pitch)

        // Function to get ray Z at given ry (distance forward in view space)
        // rayZ(ry) = term1 - ry * slope
        const getRayZ = (ry: number) => term1 - ry * slope;

        // Function to get World XY at given ry
        const cosY = Math.cos(yaw);
        const sinY = Math.sin(yaw);
        // rx is constant for the ray based on screen X
        const rx = (mx - cx) / scale;
        
        const getWxWy = (ry: number) => ({
            x: pan.x + rx * cosY + ry * sinY,
            y: pan.y - rx * sinY + ry * cosY
        });

        // Binary Search Bounds
        // We search for ry where Ray Z intersects Terrain Z.
        // Define search range based on extreme terrain heights to ensure intersection is bracketed.
        const MAX_SEARCH_Z = 2000;
        const MIN_SEARCH_Z = -1000;
        
        // Calculate ry values corresponding to these Z heights on the ray
        let ryStart = (term1 - MAX_SEARCH_Z) / slope; // ry where ray is high
        let ryEnd = (term1 - MIN_SEARCH_Z) / slope;   // ry where ray is low

        // Ensure start < end for binary search
        if (ryStart > ryEnd) [ryStart, ryEnd] = [ryEnd, ryStart];

        // Perform Binary Search
        // 16 iterations gives sufficient precision for map selection without excessive cost
        let l = ryStart, r = ryEnd;
        let finalPos = getWxWy((l + r) / 2);

        for (let i = 0; i < 16; i++) {
            const midRy = (l + r) * 0.5;
            const rayZ = getRayZ(midRy);
            const worldPos = getWxWy(midRy);
            const terrainZ = getZ(worldPos.x, worldPos.y);

            // Ray slopes down (slope > 0 since pitch < 90). 
            // If Ray Z > Terrain Z, we are "above" terrain, need to go further down/forward (increase ry).
            if (rayZ > terrainZ) {
                l = midRy;
            } else {
                r = midRy;
            }
            finalPos = worldPos;
        }

        return finalPos;
    };

    const performRaycast = (mx: number, my: number): string | null => {
        const { yaw, pitch, scale, pan } = cameraRef.current;
        const cx = dimensions.width / 2;
        const cy = dimensions.height / 2;
        let hitId = null; 
        let minDist = 30;

        (Object.values(state.map.locations) as MapLocation[]).forEach(loc => {
            const terrainZ = getZ(loc.coordinates.x, loc.coordinates.y);
            const wx = (loc.coordinates.x - pan.x);
            const wy = (loc.coordinates.y - pan.y);
            const rx = wx * Math.cos(yaw) - wy * Math.sin(yaw);
            const ry = wx * Math.sin(yaw) + wy * Math.cos(yaw);
            const relativeZ = (Math.max(terrainZ, MAP_CONSTANTS.SEA_LEVEL) + 120) - pan.z;
            const sx = cx + rx * scale;
            const sy = cy - ry * scale * Math.cos(pitch) - relativeZ * scale * Math.sin(pitch);
            const dist = Math.sqrt((sx - mx) ** 2 + (sy - my) ** 2);
            if (dist < minDist) { minDist = dist; hitId = loc.id; }
        });
        return hitId;
    };

    // --- Mouse Handlers ---
    const handleMouseDown = (e: React.MouseEvent) => {
        interactionState.current.dragButton = e.button;
        interactionState.current.hasMoved = false;
        if (isMapLocked) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.requestPointerLock();
        interactionState.current.isDragging = true;
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (document.pointerLockElement === canvasRef.current) {
            document.exitPointerLock();
        }
        if (!interactionState.current.hasMoved) {
            const canvas = canvasRef.current;
            if (canvas && interactionState.current.dragButton === 0) {
                const rect = canvas.getBoundingClientRect();
                const scaleX = dimensions.width / rect.width;
                const scaleY = dimensions.height / rect.height;
                const mx = (e.clientX - rect.left) * scaleX;
                const my = (e.clientY - rect.top) * scaleY;

                if (isCreatingLocation && onCreateLocation) {
                    const ground = raycastTerrain(mx, my);
                    if (ground) {
                        onCreateLocation(Math.round(ground.x), Math.round(ground.y));
                        setIsCreatingLocation(false);
                    }
                } else {
                    const hitId = performRaycast(mx, my);
                    if (hitId) onLocationSelect(hitId);
                }
            }
        }
        interactionState.current.isDragging = false;
    };

    // --- Wheel & Move Handlers (Effect) ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (e: WheelEvent) => {
            if (isMapLocked) return;
            e.preventDefault();
            e.stopPropagation();
            updateCamera(prev => ({ ...prev, scale: Math.max(0.02, Math.min(5.0, prev.scale - e.deltaY * 0.0005)) }));
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (isMapLocked) return;
            if (document.pointerLockElement !== canvasRef.current) return;
            const dx = e.movementX;
            const dy = e.movementY;
            if (dx !== 0 || dy !== 0) interactionState.current.hasMoved = true;
            const button = interactionState.current.dragButton;

            if (button === 2) {
                // Right Click Pan
                const { scale, pitch, yaw } = cameraRef.current;
                const cp = Math.max(0.1, Math.cos(pitch));
                const dRx = dx / scale;
                const dRy = -dy / (scale * cp);
                const cos = Math.cos(yaw);
                const sin = Math.sin(yaw);
                const dWx = dRx * cos + dRy * sin;
                const dWy = -dRx * sin + dRy * cos;

                updateCamera(prev => {
                    const nextX = prev.pan.x - dWx;
                    const nextY = prev.pan.y - dWy;
                    const nextZ = getZ(nextX, nextY);
                    return { ...prev, pan: { x: nextX, y: nextY, z: nextZ } };
                });
            } else {
                // Left Click Rotate
                updateCamera(prev => ({
                    ...prev,
                    yaw: prev.yaw + dx * 0.005,
                    pitch: Math.max(0.1, Math.min(Math.PI / 2 - 0.1, prev.pitch - dy * 0.005))
                }));
            }
        };

        const onTouchStart = (e: TouchEvent) => {
            if (isMapLocked) return;
            if (e.touches.length === 1) {
                touchState.current.lastSingle = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                touchState.current.lastDistance = Math.sqrt(dx * dx + dy * dy);
                touchState.current.lastMidpoint = {
                    x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                    y: (e.touches[0].clientY + e.touches[1].clientY) / 2
                };
                touchState.current.isZooming = true;
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (isMapLocked) return;
            if (e.cancelable) e.preventDefault();

            const { yaw, pitch, scale } = cameraRef.current;

            if (e.touches.length === 1 && !touchState.current.isZooming) {
                const dx = e.touches[0].clientX - touchState.current.lastSingle.x;
                const dy = e.touches[0].clientY - touchState.current.lastSingle.y;
                
                updateCamera(prev => ({
                    ...prev,
                    yaw: prev.yaw + dx * 0.01,
                    pitch: Math.max(0.1, Math.min(Math.PI / 2 - 0.1, prev.pitch - dy * 0.01))
                }));
                touchState.current.lastSingle = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const deltaDist = dist - touchState.current.lastDistance;
                
                updateCamera(prev => ({ ...prev, scale: Math.max(0.02, Math.min(5.0, prev.scale + deltaDist * 0.005)) }));
                touchState.current.lastDistance = dist;

                const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const panDx = mx - touchState.current.lastMidpoint.x;
                const panDy = my - touchState.current.lastMidpoint.y;
                
                const cp = Math.max(0.1, Math.cos(pitch)); 
                const dRx = panDx / scale; 
                const dRy = -panDy / (scale * cp);
                const cos = Math.cos(yaw);
                const sin = Math.sin(yaw);
                const dWx = dRx * cos + dRy * sin;
                const dWy = -dRx * sin + dRy * cos;

                updateCamera(prev => {
                    const nextX = prev.pan.x - dWx;
                    const nextY = prev.pan.y - dWy; 
                    const nextZ = getZ(nextX, nextY);
                    return { ...prev, pan: { x: nextX, y: nextY, z: nextZ } };
                });
                touchState.current.lastMidpoint = { x: mx, y: my };
            }
        };

        const onTouchEnd = (e: TouchEvent) => {
             if (e.touches.length === 0) touchState.current.isZooming = false;
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        document.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });

        return () => {
            canvas.removeEventListener('wheel', handleWheel);
            document.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        };
    }, [isMapLocked, dimensions]);

    return {
        isCreatingLocation,
        setIsCreatingLocation,
        handleMouseDown,
        handleMouseUp
    };
};