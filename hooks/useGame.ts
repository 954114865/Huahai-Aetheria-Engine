
import { useState, useRef, useEffect } from 'react';
import { GameState, LogEntry } from '../types';
import { createInitialGameState } from '../services/gameFactory';
import { advanceWorldTime } from '../services/timeUtils';
import { useGameUI } from './game/useGameUI';
import { useGameHistory } from './game/useGameHistory';
import { useGamePersistence, AUTOSAVE_KEY } from './game/useGamePersistence';
import { App } from '@capacitor/app';

export const useGame = () => {
  const [state, setState] = useState<GameState>(() => {
      try {
          const saved = localStorage.getItem(AUTOSAVE_KEY);
          if (saved) {
              const parsed = JSON.parse(saved);
              if (parsed && parsed.world && parsed.map && parsed.characters) {
                  // Snapshot current parsed state for the resume log
                  const resumeSnapshot = parsed.round ? JSON.parse(JSON.stringify(parsed.round)) : undefined;
                  
                  const resumeLog: LogEntry = {
                      id: `log_resume_${Date.now()}`,
                      round: parsed.round?.roundNumber || 1,
                      turnIndex: parsed.round?.turnIndex || 0,
                      content: "系统: 检测到自动存档，已恢复上次的游戏进度。",
                      timestamp: Date.now(),
                      type: 'system',
                      snapshot: resumeSnapshot
                  };
                  if (!parsed.world.history) parsed.world.history = [];
                  parsed.world.history.push(resumeLog);
                  
                  // Migrations...
                  if (!parsed.prizePools) parsed.prizePools = createInitialGameState().prizePools;
                  if (!parsed.triggers) parsed.triggers = {};
                  if (!parsed.charGenConfig) parsed.charGenConfig = parsed.judgeConfig || createInitialGameState().charGenConfig;
                  if (!parsed.charBehaviorConfig) parsed.charBehaviorConfig = parsed.judgeConfig || createInitialGameState().charBehaviorConfig;
                  if (parsed.prizePools) {
                      Object.values(parsed.prizePools).forEach((pool: any) => {
                          if (!pool.locationIds) pool.locationIds = [];
                      });
                  }
                  if (!parsed.appSettings.maxHistoryRounds) parsed.appSettings.maxHistoryRounds = 20;
                  if (!parsed.appSettings.maxCharacterMemoryRounds) parsed.appSettings.maxCharacterMemoryRounds = 20;
                  if (!parsed.appSettings.maxShortHistoryRounds) parsed.appSettings.maxShortHistoryRounds = 5;
                  if (!parsed.appSettings.globalVariables) parsed.appSettings.globalVariables = [];
                  if (parsed.appSettings.storyLogLightMode === undefined) parsed.appSettings.storyLogLightMode = false;
                  if (parsed.round.autoReaction === undefined) parsed.round.autoReaction = false; // Default to Manual
                  if (parsed.round.isWorldTimeFlowPaused === undefined) parsed.round.isWorldTimeFlowPaused = false;
                  
                  // Migration for Split Memory Dropout
                  // If old key exists, map to reaction setting
                  if (parsed.appSettings.memoryDropoutProbability !== undefined) {
                      if (parsed.appSettings.reactionMemoryDropoutProbability === undefined) {
                          parsed.appSettings.reactionMemoryDropoutProbability = parsed.appSettings.memoryDropoutProbability;
                      }
                      delete parsed.appSettings.memoryDropoutProbability;
                  }
                  // Init new keys if missing
                  if (parsed.appSettings.actionMemoryDropoutProbability === undefined) {
                      parsed.appSettings.actionMemoryDropoutProbability = 0.34;
                  }
                  if (parsed.appSettings.reactionMemoryDropoutProbability === undefined) {
                      parsed.appSettings.reactionMemoryDropoutProbability = 0.34;
                  }

                  return parsed;
              }
          }
      } catch (e) {
          console.warn("Failed to load autosave:", e);
      }
      return createInitialGameState();
  });

  const stateRef = useRef<GameState>(state);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      stateRef.current = state;
  }, [state]);

  const updateState = (updater: (current: GameState) => GameState) => {
      const next = updater(stateRef.current);
      stateRef.current = next;
      setState(next);
  };

  // --- Initialize Sub-Hooks ---
  const ui = useGameUI();
  const history = useGameHistory(stateRef, updateState, ui.forceClearReactionRequest);
  
  const persistence = useGamePersistence(
      state, 
      stateRef, 
      updateState, 
      history.addLog, 
      ui.saveLoadModal, 
      ui.setSaveLoadModal, 
      ui.setPasswordChallenge, 
      ui.forceClearReactionRequest
  );

  // --- World Time Loop (Optimized for Background Battery Saving) ---
  useEffect(() => {
      // Use a ref to track background state so the interval closure always sees current value
      const isBackgroundRef = { current: false };

      // 1. Web Page Visibility
      const handleVisibilityChange = () => {
          isBackgroundRef.current = document.hidden;
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      // 2. Native App State (Capacitor)
      let nativeListener: any = null;
      App.addListener('appStateChange', (state) => {
          isBackgroundRef.current = !state.isActive;
      }).then(handle => {
          nativeListener = handle;
      });

      // Updated: 15 seconds interval to reduce CPU load and heat
      const interval = setInterval(() => {
          // Optimization: If manually paused OR app is in background, skip calculation & render
          if (stateRef.current.round.isWorldTimeFlowPaused || isBackgroundRef.current) return;

          const timeAttr = stateRef.current.world.attributes['worldTime'];
          if (timeAttr) {
              const currentStr = timeAttr.value as string;
              const scale = stateRef.current.defaultSettings.gameplay.worldTimeScale || 1;
              // Advance by 15 seconds per tick (15 * scale) to match interval
              const newTimeStr = advanceWorldTime(currentStr, 15 * scale);
              
              if (newTimeStr !== currentStr) {
                  updateState(prev => ({
                      ...prev,
                      world: {
                          ...prev.world,
                          attributes: {
                              ...prev.world.attributes,
                              worldTime: { ...prev.world.attributes.worldTime, value: newTimeStr }
                          }
                      }
                  }));
              }
          }
      }, 15000);

      return () => {
          clearInterval(interval);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          if (nativeListener) nativeListener.remove();
      };
  }, []);

  return {
    state,
    stateRef,
    updateState,
    fileInputRef,
    // UI
    openWindow: ui.openWindow,
    closeWindow: ui.closeWindow,
    windows: ui.windows,
    saveLoadModal: ui.saveLoadModal,
    setSaveLoadModal: ui.setSaveLoadModal,
    passwordChallenge: ui.passwordChallenge,
    respondToPasswordChallenge: ui.respondToPasswordChallenge,
    reactionRequest: ui.reactionRequest,
    respondToReactionRequest: ui.respondToReactionRequest,
    requestPlayerReaction: ui.requestPlayerReaction,
    cancelReactionRequest: ui.forceClearReactionRequest,
    // History
    addLog: history.addLog,
    addDebugLog: history.addDebugLog,
    rollbackToLog: history.rollbackToLog,
    regenerateFromLog: history.regenerateFromLog,
    // Persistence
    onSaveClick: persistence.onSaveClick,
    onLoadClick: persistence.onLoadClick,
    executeSave: persistence.executeSave,
    executeLoad: persistence.executeLoad,
    parseAndValidateSave: persistence.parseAndValidateSave,
    resetGame: persistence.resetGame,
    importCharacters: persistence.importCharacters,
  };
};