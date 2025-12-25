
import { useState, useEffect, MutableRefObject, useRef } from 'react';
import { GameState, GamePhase, DebugLog, LogEntry, GameImage } from '../types';
import { useMapLogic } from './useMapLogic';
import { useActionLogic } from './useActionLogic';
import { usePhaseLogic } from './usePhaseLogic';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

interface UseEngineProps {
    state: GameState;
    stateRef: MutableRefObject<GameState>;
    updateState: (updater: (current: GameState) => GameState) => void;
    addLog: (text: string, overrides?: Partial<LogEntry>) => void;
    addDebugLog: (log: DebugLog) => void;
    requestPlayerReaction?: (charId: string, title: string, message: string) => Promise<string | null>;
    cancelReactionRequest?: () => void; // New prop
}

export interface PendingAction {
    id: string;
    type: 'use_skill' | 'move_to' | 'lottery';
    cardId?: string;
    targetId?: string;
    cardName: string;
    destinationName?: string;
    destinationId?: string;
    // Lottery fields
    poolId?: string;
    action?: 'draw' | 'deposit' | 'peek';
    amount?: number;
    cardIds?: string[];
    itemName?: string;
    isHidden?: boolean;
}

export const useEngine = ({ state, stateRef, updateState, addLog, addDebugLog, requestPlayerReaction, cancelReactionRequest }: UseEngineProps) => {
    const [isProcessingAI, setIsProcessingAI] = useState(false);
    const [processingLabel, setProcessingLabel] = useState("");
    
    // Session ID to validate async returns. 
    // If stop is clicked, we increment session ID, invalidating old in-flight requests.
    const requestSessionId = useRef(0);
    
    const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
    const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
    
    const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
    const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
    
    const [playerInput, setPlayerInput] = useState("");

    const setPhase = (phase: GamePhase) => updateState(prev => ({ ...prev, round: { ...prev.round, phase, lastErrorMessage: undefined } }));
    const setError = (msg: string) => updateState(prev => ({ ...prev, round: { ...prev.round, lastErrorMessage: msg } }));
    
    const handleAiFailure = (context: string, e: any) => {
        console.error(`${context} Failed`, e);
        addLog(`系统: AI 运算连续失败（数据无效或无响应）。当前操作已取消，流程暂停。请重试。(${e.message})`);
        setError(`${context} Failed: ${e.message}`);
        updateState(prev => ({ ...prev, round: { ...prev.round, isPaused: true } }));
        setIsProcessingAI(false);
    };

    // Wrapper for AI logic that checks Session ID
    // If the ID changed during the async operation (Stop was clicked), we simply discard the result.
    // AND handles Android Background Tasks to keep connection alive
    const wrapAiLogic = async <T>(logic: () => Promise<T>): Promise<T | undefined> => {
        const currentSession = requestSessionId.current;
        
        let taskId = -1;
        // Native Platform Background Keep-Alive
        if (Capacitor.isNativePlatform()) {
            try {
                taskId = await (App as any).registerTask(() => {
                    console.warn('Background task timed out or finished.');
                    (App as any).finish(taskId);
                });
                console.log('Background task registered:', taskId);
            } catch (e) {
                console.warn('Failed to register background task:', e);
            }
        }

        try {
            const result = await logic();
            if (currentSession !== requestSessionId.current) {
                console.log("AI Request Aborted (Session Mismatch)");
                return undefined; // Silently drop
            }
            return result;
        } catch (e) {
            if (currentSession !== requestSessionId.current) return undefined;
            throw e;
        } finally {
            // Finish Background Task
            if (taskId !== -1) {
                (App as any).finish(taskId);
                console.log('Background task finished:', taskId);
            }
        }
    };

    const { exploreLocation, processLocationChange, resetLocation } = useMapLogic({
        stateRef, updateState, addLog, setIsProcessingAI, setProcessingLabel, handleAiFailure, addDebugLog,
        checkSession: () => requestSessionId.current
    });

    const { phaseOrderDetermination, phaseTurnStart, phaseSettlement, phaseRoundEnd } = usePhaseLogic({
        stateRef, updateState, addLog, setIsProcessingAI, setProcessingLabel, handleAiFailure, setPhase, addDebugLog,
        checkSession: () => requestSessionId.current
    });

    const { performCharacterAction, submitPlayerTurn, performUnveil } = useActionLogic({
        stateRef, updateState, addLog, setIsProcessingAI, setProcessingLabel, handleAiFailure, 
        setSelectedCharId, playerInput, setPlayerInput, 
        selectedCharId,
        selectedCardId, selectedTargetId, setSelectedCardId, setSelectedTargetId, 
        pendingActions, setPendingActions,
        addDebugLog,
        requestPlayerReaction,
        checkSession: () => requestSessionId.current
    });

    // --- MAP & EXPLORATION TRIGGER ---
    useEffect(() => {
        if (state.round.phase === 'turn_start' || state.round.phase === 'char_acting') return;
        if (isProcessingAI) return;
        wrapAiLogic(async () => processLocationChange());
    }, [state.map.activeLocationId]);

    // --- CORE FSM LOOP ---
    useEffect(() => {
        if (state.round.isPaused) return;
        if (isProcessingAI) return;

        const executePhase = async () => {
            const currentPhase = state.round.phase;
            // Use current session ID for this iteration
            const mySession = requestSessionId.current;

            try {
                switch (currentPhase) {
                    case 'init':
                    case 'order':
                        await wrapAiLogic(phaseOrderDetermination);
                        break;
                    case 'turn_start':
                        phaseTurnStart();
                        break;
                    case 'char_acting':
                        await wrapAiLogic(performCharacterAction);
                        break;
                    case 'executing':
                        break;
                    case 'settlement':
                        await wrapAiLogic(phaseSettlement);
                        break;
                    case 'round_end':
                        phaseRoundEnd();
                        break;
                }
            } catch (e: any) {
                // Only log error if session is still valid
                if (mySession === requestSessionId.current) {
                    console.error(`Phase ${currentPhase} Loop Error`, e);
                    updateState(prev => ({ ...prev, round: { ...prev.round, isPaused: true, lastErrorMessage: e.message } }));
                }
            }
        };

        executePhase();
    }, [state.round.phase, state.round.isPaused, state.round.turnIndex, isProcessingAI]);

    // --- STOP ACTION ---
    const stopExecution = () => {
        // 1. Invalidate current AI session
        requestSessionId.current += 1;
        
        // 2. Dispatch global abort event for Visualizer
        const event = new CustomEvent('ai_abort_all');
        window.dispatchEvent(event);

        // 3. Cancel any pending UI requests (like Player Reaction)
        if (cancelReactionRequest) {
            cancelReactionRequest();
        }

        // 4. Pause Game state
        updateState(prev => ({
            ...prev,
            round: {
                ...prev.round,
                isPaused: true,
                autoAdvance: false, // Stop auto-advance
                autoAdvanceCount: 0
            }
        }));
        
        setIsProcessingAI(false);
        setProcessingLabel("");
        addLog("系统: 流程已强制终止 (Terminated)。当前 AI 请求被丢弃，轮次状态保留。点击[继续]可恢复。");
    };

    return {
        isProcessingAI,
        processingLabel,
        selectedCharId, setSelectedCharId,
        selectedCardId, setSelectedCardId,
        selectedTargetId, setSelectedTargetId,
        playerInput, setPlayerInput,
        pendingActions, setPendingActions,
        // FIX: Correctly pass images parameter
        submitPlayerTurn: (t: number, images?: GameImage[]) => wrapAiLogic(async () => submitPlayerTurn(t, images)),
        recalculateTurnOrder: () => wrapAiLogic(phaseOrderDetermination),
        resetLocation: (locId: string, keepRegion: boolean, instructions?: string, cultureInstructions?: string, locImages?: GameImage[], charImages?: GameImage[]) => 
            wrapAiLogic(async () => resetLocation(locId, keepRegion, instructions, cultureInstructions, locImages, charImages)),
        stopExecution, // Exported for UI
        performUnveil: (logs: string[], charIds: string[], playerIntent?: string) => wrapAiLogic(async () => performUnveil(logs, charIds, playerIntent)),
        exploreLocation: (loc: any, isManual: boolean = false, instructions: string = "", cultureInstructions: string = "", locImages: GameImage[] = [], charImages: GameImage[] = []) => 
            wrapAiLogic(async () => exploreLocation(loc, isManual, instructions, cultureInstructions, locImages, charImages))
    };
};
