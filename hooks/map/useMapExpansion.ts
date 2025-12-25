
import { MutableRefObject } from 'react';
import { GameState, MapChunk } from '../../types';
import { checkMapExpansion } from '../../services/mapUtils';

interface UseMapExpansionProps {
    stateRef: MutableRefObject<GameState>;
    updateState: (updater: (current: GameState) => GameState) => void;
}

export const useMapExpansion = ({ stateRef, updateState }: UseMapExpansionProps) => {
    const checkAndExpand = () => {
        const map = stateRef.current.map;
        if (!map.activeLocationId) return;

        const targetLoc = map.locations[map.activeLocationId];
        // If location doesn't exist yet (edge case?), use 0,0 or player coords?
        // Usually activeLocationId implies it exists in `locations`.
        const targetX = targetLoc?.coordinates.x || 0;
        const targetY = targetLoc?.coordinates.y || 0;
        
        const seed = (Object.values(map.chunks) as MapChunk[])[0]?.seed || Math.random();
        
        const newMapState = checkMapExpansion(targetX, targetY, map, seed);
        
        if (newMapState !== map) {
            updateState(prev => ({ ...prev, map: newMapState }));
        }
    };

    return { checkAndExpand };
};
