
import { MutableRefObject } from 'react';
import { GameState, Trigger, DebugLog, GameImage } from '../types';
import { useMapExpansion } from './map/useMapExpansion';
import { useLocationGeneration } from './map/useLocationGeneration';
import { usePopulation } from './map/usePopulation';

interface UseMapLogicProps {
    stateRef: MutableRefObject<GameState>;
    updateState: (updater: (current: GameState) => GameState) => void;
    addLog: (text: string) => void;
    setIsProcessingAI: (val: boolean) => void;
    setProcessingLabel: (val: string) => void;
    handleAiFailure: (context: string, e: any) => void;
    addDebugLog: (log: DebugLog) => void;
    checkSession: () => number;
}

export const useMapLogic = ({ stateRef, updateState, addLog, setIsProcessingAI, setProcessingLabel, handleAiFailure, addDebugLog, checkSession }: UseMapLogicProps) => {

    const expansion = useMapExpansion({ stateRef, updateState });
    
    const generation = useLocationGeneration({
        stateRef, updateState, addLog, setIsProcessingAI, setProcessingLabel, handleAiFailure, addDebugLog, checkSession
    });

    const population = usePopulation({
        stateRef, updateState, addLog, checkSession, addDebugLog
    });

    const processLocationChange = async () => {
         // 1. Expand Map Chunks if needed
         expansion.checkAndExpand();

         // 2. Check if current location needs exploration
         const map = stateRef.current.map;
         if (!map.activeLocationId) return;
         
         const loc = map.locations[map.activeLocationId];
         if (loc && !loc.isKnown) {
             // 3. Perform Exploration (Blocking AI Generation)
             const result = await generation.performExploration(loc);
             
             // 4. If exploration succeeded AND population is requested
             if (result.success && result.shouldPopulate) {
                 population.startPopulation(loc.id);
             }
         }
    };

    const resetLocation = async (
        locationId: string, 
        keepRegion: boolean, 
        instructions: string = "", 
        cultureInstructions: string = "", 
        locImages: GameImage[] = [], 
        charImages: GameImage[] = []
    ) => {
        const loc = stateRef.current.map.locations[locationId];
        if (loc) {
            await generation.performReset(loc, keepRegion, instructions, cultureInstructions, locImages, charImages);
        }
    };

    const exploreLocation = async (
        loc: any, 
        isManual: boolean = false, 
        instructions: string = "", 
        cultureInstructions: string = "",
        locImages: GameImage[] = [],
        charImages: GameImage[] = []
    ) => {
        const result = await generation.performExploration(loc, isManual, instructions, cultureInstructions, locImages, charImages);
        if (result.success && result.shouldPopulate) {
            population.startPopulation(loc.id);
        }
        return result; // Return result for caller (LeftPanel) to handle AP deduction
    };

    return {
        processLocationChange,
        resetLocation,
        exploreLocation
    };
};
