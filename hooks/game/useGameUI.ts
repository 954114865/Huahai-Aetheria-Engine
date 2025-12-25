
import { useState } from 'react';
import { WindowState } from '../../types';

export const useGameUI = () => {
  const [windows, setWindows] = useState<WindowState[]>([]);
  
  const [saveLoadModal, setSaveLoadModal] = useState<{
      type: 'save' | 'load';
      dataToLoad?: any; 
      fileToLoad?: File; 
      isOpen: boolean;
      error?: string; 
  }>({ type: 'save', isOpen: false });

  const [passwordChallenge, setPasswordChallenge] = useState<{
      isOpen: boolean;
      message: string;
      expectedPassword?: string; // New: For UI-side validation
      resolve: (pwd: string | null) => void;
  } | null>(null);

  const [reactionRequest, setReactionRequest] = useState<{
      isOpen: boolean;
      message: string;
      title: string;
      charId: string;
      resolve: (response: string | null) => void;
  } | null>(null);

  const openWindow = (type: WindowState['type'], data?: any) => {
    setWindows(prev => [...prev, { type, data, id: Date.now() }]);
  };

  const closeWindow = (id: number) => {
    setWindows(prev => prev.filter(w => w.id !== id));
  };

  const respondToPasswordChallenge = (pwd: string | null) => {
      if (passwordChallenge && passwordChallenge.resolve) {
          passwordChallenge.resolve(pwd);
          setPasswordChallenge(null);
      }
  };

  const requestPlayerReaction = (charId: string, title: string, message: string): Promise<string | null> => {
      return new Promise((resolve) => {
          setReactionRequest({
              isOpen: true,
              title,
              message,
              charId,
              resolve: (response) => {
                  setReactionRequest(null);
                  resolve(response);
              }
          });
      });
  };

  const respondToReactionRequest = (response: string | null) => {
      if (reactionRequest && reactionRequest.resolve) {
          reactionRequest.resolve(response);
      }
  };

  // Helper to force clear any pending reaction logic (e.g. on reset/load)
  const forceClearReactionRequest = () => {
      if (reactionRequest && reactionRequest.resolve) {
          // Resolve with null to unblock any pending async awaiters
          reactionRequest.resolve(null);
          setReactionRequest(null);
      }
  };

  return {
      windows,
      openWindow,
      closeWindow,
      saveLoadModal,
      setSaveLoadModal,
      passwordChallenge,
      setPasswordChallenge,
      respondToPasswordChallenge,
      reactionRequest,
      requestPlayerReaction,
      respondToReactionRequest,
      forceClearReactionRequest
  };
};
