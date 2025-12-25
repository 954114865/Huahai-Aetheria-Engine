
import { useState, useRef, useEffect, useCallback } from 'react';
import { CameraState } from './visualUtils';
import { GameState, MapLocation } from '../../../types';
import { getTerrainHeight } from '../../../services/mapUtils';
import { MAP_CONSTANTS } from '../../../constants';

export const useMapCamera = (state: GameState, isLocked: boolean) => {
    const [camera, setCamera] = useState<CameraState>({
        yaw: Math.PI / 4,
        pitch: Math.PI / 2.5,
        scale: 0.8,
        pan: { x: 0, y: 0, z: 0 }
    });

    const cameraRef = useRef(camera);

    useEffect(() => {
        cameraRef.current = camera;
    }, [camera]);

    const getZ = useCallback((x: number, y: number) => {
        const cx = Math.floor(x / MAP_CONSTANTS.CHUNK_SIZE);
        const cy = Math.floor(y / MAP_CONSTANTS.CHUNK_SIZE);
        const chunk = state.map.chunks[`${cx}_${cy}`];
        return chunk ? getTerrainHeight(x, y, chunk.seed) : 0;
    }, [state.map.chunks]);

    const resetView = useCallback(() => {
        if (isLocked) return;
        let targetX = 0;
        let targetY = 0;
        let targetZ = 0;

        if (state.map.activeLocationId && state.map.locations[state.map.activeLocationId]) {
            const loc = state.map.locations[state.map.activeLocationId];
            targetX = loc.coordinates.x;
            targetY = loc.coordinates.y;
            targetZ = loc.coordinates.z;
        } else {
            targetZ = getZ(0, 0);
        }

        setCamera({
            yaw: Math.PI / 4,
            pitch: Math.PI / 2.5,
            scale: 0.8,
            pan: { x: targetX, y: targetY, z: targetZ }
        });
    }, [isLocked, state.map.activeLocationId, state.map.locations, getZ]);

    // Initial reset on mount or location change
    useEffect(() => {
        if (state.map.activeLocationId && camera.pan.x === 0 && camera.pan.y === 0) {
            // Check lock in a way that doesn't depend on stale closure if possible, 
            // but here we trust the prop passed
            if (!isLocked) resetView();
        }
    }, [state.map.activeLocationId]);

    const updateCamera = (updater: (prev: CameraState) => CameraState) => {
        setCamera(prev => updater(prev));
    };

    return {
        camera,
        cameraRef,
        setCamera,
        updateCamera,
        resetView,
        getZ
    };
};
