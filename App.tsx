
import React, { useState, useEffect } from 'react';
import { useGame } from './hooks/useGame';
import { useEngine } from './hooks/useEngine';
import { TopBar } from './components/Layout/TopBar';
import { LeftPanel } from './components/Layout/LeftPanel';
import { StoryLog } from './components/Layout/StoryLog';
import { PlayerControls } from './components/Layout/PlayerControls';
import { RightPanel } from './components/Layout/RightPanel';
import { WindowManager } from './components/Layout/WindowManager';
import { SlidingLayout } from './components/Layout/SlidingLayout';
import { Button } from './components/ui/Button';
import { GameState } from './types';
import { applyThemeToRoot } from './services/themeService';
import { Window } from './components/ui/Window';

// Native Imports
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

// Modals
import { PasswordChallengeModal } from './components/Modals/PasswordChallengeModal';
import { ManualOrderModal } from './components/Modals/ManualOrderModal';
import { SaveLoadModal } from './components/Modals/SaveLoadModal';

export default function App() {
  const game = useGame();
  const engine = useEngine({
    state: game.state,
    stateRef: game.stateRef,
    updateState: game.updateState,
    addLog: game.addLog,
    addDebugLog: game.addDebugLog,
    requestPlayerReaction: game.requestPlayerReaction,
    cancelReactionRequest: game.cancelReactionRequest 
  });

  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [mobileView, setMobileView] = useState<'story' | 'map' | 'char'>('story');

  // --- THEME APPLICATION EFFECT ---
  // Apply theme whenever state.appSettings.themeConfig changes OR Light Mode Toggled
  useEffect(() => {
      const config = game.state.appSettings.themeConfig;
      if (config) {
          applyThemeToRoot(config, game.state.appSettings.storyLogLightMode);
          
          // Native Status Bar Handling (Safe Guarded for Windows/Web Compatibility)
          if (Capacitor.isNativePlatform()) {
              try {
                  const style = game.state.appSettings.storyLogLightMode ? Style.Light : Style.Dark;
                  StatusBar.setStyle({ style }).catch(() => {
                      // Silently fail if plugin not implemented/mocked
                  });
              } catch (e) {
                  // Ignore errors on non-native platforms
              }
          }
      }
  }, [game.state.appSettings.themeConfig, game.state.appSettings.storyLogLightMode]);

  // Listen for RightPanel Toggle & Shop Open
  useEffect(() => {
      const manualHandler = (e: any) => {
          game.updateState(s => ({ ...s, round: { ...s.round, useManualTurnOrder: e.detail } }));
      };
      
      const shopHandler = (e: any) => {
          // e.detail contains charId
          if (e.detail && e.detail.charId) {
              engine.setSelectedCharId(e.detail.charId);
              game.openWindow('shop');
          }
      };

      window.addEventListener('update_manual_order', manualHandler);
      window.addEventListener('open_shop_window', shopHandler);
      return () => {
          window.removeEventListener('update_manual_order', manualHandler);
          window.removeEventListener('open_shop_window', shopHandler);
      };
  }, []);

  const restartGame = () => {
      setConfirmModal({
          title: "重置游戏 (Factory Reset)",
          message: "警告：这将完全清空当前游戏的所有进度，删除自动存档，并恢复到【系统初始设置】。所有的自定义设置和 **API Key** 都将丢失。此操作不可撤销。",
          onConfirm: () => {
              game.resetGame();
          }
      });
  };

  const handleTogglePause = () => {
      game.updateState((s: GameState) => ({...s, round: {...s.round, isPaused: !s.round.isPaused}}));
  };

  const cancelManualOrder = () => {
      game.updateState((s: GameState) => ({
          ...s,
          round: {
              ...s.round,
              isWaitingForManualOrder: false,
              isPaused: true
          }
      }));
  };

  const confirmManualOrder = (order: string[]) => {
      game.updateState((s: GameState) => ({
          ...s,
          round: {
              ...s.round,
              currentOrder: order,
              defaultOrder: order, // Update default too for consistency
              isWaitingForManualOrder: false,
              phase: 'turn_start',
              turnIndex: 0
          }
      }));
  };

  // Determine if swiping should be disabled (any modal/window open)
  // OPTIMIZATION: Removed reactionRequest from disabled list to allow users to swipe back to respond
  const isSwipeDisabled = 
      game.windows.length > 0 || 
      game.saveLoadModal.isOpen || 
      !!game.passwordChallenge || 
      !!confirmModal || 
      !!game.state.round.isWaitingForManualOrder;

  return (
    <div className="w-full h-screen flex flex-col bg-app text-body relative font-sans select-none overflow-hidden transition-colors duration-500">
      
      {/* Confirmation Modal */}
      {confirmModal && (
          <Window
              title={confirmModal.title}
              onClose={() => setConfirmModal(null)}
              maxWidth="max-w-sm"
              height="h-auto"
              zIndex={100}
              noPadding={true}
              footer={
                  <div className="flex justify-end gap-3">
                      <Button variant="secondary" onClick={() => setConfirmModal(null)}>取消</Button>
                      <Button variant="danger" onClick={() => {
                          confirmModal.onConfirm();
                          setConfirmModal(null);
                      }}>确定</Button>
                  </div>
              }
          >
              <div className="p-6">
                  <p className="text-muted text-sm leading-relaxed">{confirmModal.message}</p>
              </div>
          </Window>
      )}

      {/* Password Challenge Modal */}
      {game.passwordChallenge && (
          <PasswordChallengeModal 
              message={game.passwordChallenge.message}
              expectedPassword={game.passwordChallenge.expectedPassword}
              onConfirm={(pwd) => game.respondToPasswordChallenge(pwd)}
              onCancel={() => game.respondToPasswordChallenge(null)}
          />
      )}

      {/* Manual Order Modal */}
      <ManualOrderModal 
          isOpen={!!game.state.round.isWaitingForManualOrder}
          state={game.state}
          onConfirm={confirmManualOrder}
          onCancel={cancelManualOrder}
          addLog={game.addLog}
      />

      {/* Save/Load Modal */}
      <SaveLoadModal 
          config={game.saveLoadModal}
          state={game.state}
          onClose={() => game.setSaveLoadModal({ ...game.saveLoadModal, isOpen: false })}
          onSave={game.executeSave}
          onLoad={game.executeLoad}
          onImport={game.importCharacters}
          onUpdateConfig={game.setSaveLoadModal}
          parseAndValidateSave={game.parseAndValidateSave}
      />

      <TopBar 
        state={game.state}
        updateState={game.updateState}
        openWindow={game.openWindow}
        restartGame={restartGame}
        onSaveClick={game.onSaveClick}
        onLoadClick={game.onLoadClick}
        fileInputRef={game.fileInputRef}
        setSelectedCharId={engine.setSelectedCharId}
        onTogglePause={handleTogglePause}
        mobileView={mobileView}
        setMobileView={setMobileView}
        onConfirm={(title, msg, action) => setConfirmModal({ title, message: msg, onConfirm: action })}
      />

      {/* Main Content Area - Mobile Sliding Logic */}
      <SlidingLayout currentView={mobileView} onChangeView={setMobileView} disabled={isSwipeDisabled}>
          {/* Left Panel (Map) */}
          <LeftPanel 
             state={game.state} 
             updateState={game.updateState} 
             openWindow={game.openWindow}
             addLog={game.addLog}
             onResetLocation={engine.resetLocation}
             onExploreLocation={engine.exploreLocation}
          />

          {/* Center Panel (Story) */}
          <div className="flex flex-col h-full relative">
             <StoryLog 
                state={game.state}
                updateState={game.updateState}
                onConfirm={(title, msg, action) => setConfirmModal({ title, message: msg, onConfirm: action })}
                onRollback={game.rollbackToLog}
                onRegenerate={game.regenerateFromLog}
                onStopExecution={engine.stopExecution}
                onUnveil={engine.performUnveil}
                openWindow={game.openWindow}
             />
             <PlayerControls 
                state={game.state}
                activeCharId={game.state.round.currentOrder[game.state.round.turnIndex] || ""}
                playerInput={engine.playerInput}
                setPlayerInput={engine.setPlayerInput}
                selectedCardId={engine.selectedCardId}
                setSelectedCardId={engine.setSelectedCardId}
                selectedTargetId={engine.selectedTargetId}
                setSelectedTargetId={engine.setSelectedTargetId}
                submitPlayerTurn={engine.submitPlayerTurn}
                isProcessingAI={engine.isProcessingAI}
                pendingActions={engine.pendingActions}
                setPendingActions={engine.setPendingActions}
                onOpenShop={() => {
                    const charId = game.state.round.currentOrder[game.state.round.turnIndex];
                    if (charId) {
                        engine.setSelectedCharId(charId);
                        game.openWindow('shop');
                    }
                }}
                reactionRequest={game.reactionRequest}
                onRespondToReaction={game.respondToReactionRequest}
                onAddLog={game.addLog}
                addDebugLog={game.addDebugLog}
             />
          </div>

          {/* Right Panel (Char) */}
          <RightPanel 
              selectedCharId={engine.selectedCharId}
              state={game.state}
              updateState={game.updateState}
              openWindow={game.openWindow}
              setSelectedCharId={engine.setSelectedCharId}
          />
      </SlidingLayout>

      <WindowManager 
          windows={game.windows}
          closeWindow={game.closeWindow}
          state={game.state}
          updateState={game.updateState}
          openWindow={game.openWindow}
          addLog={game.addLog}
          selectedCharId={engine.selectedCharId}
          addDebugLog={game.addDebugLog} 
      />
    </div>
  );
}
