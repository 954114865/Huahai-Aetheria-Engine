
import React, { useRef } from 'react';
import { GameState, WindowState, Card, DebugLog } from '../../../types';

export interface PoolWindowProps {
    winId: number;
    state: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    closeWindow: (id: number) => void;
    openWindow: (type: WindowState['type'], data?: any) => void;
    addLog: (text: string) => void;
    selectedCharId: string | null;
    onSaveCard?: (card: Card) => void;
    data?: any;
    addDebugLog?: (log: DebugLog) => void;
}

export const HorizontalScrollContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const onWheel = (e: React.WheelEvent) => {
    if (scrollRef.current) {
      // 1. Temporarily disable snapping to allow free scroll
      scrollRef.current.style.scrollSnapType = 'none';
      
      // 2. Perform the scroll
      scrollRef.current.scrollLeft += e.deltaY;
      
      // 3. Clear previous timer
      if (timerRef.current) clearTimeout(timerRef.current);
      
      // 4. Re-enable snapping after wheel stops (debounce)
      timerRef.current = window.setTimeout(() => {
          if (scrollRef.current) {
              scrollRef.current.style.scrollSnapType = 'x mandatory';
          }
      }, 150);
    }
  };

  return (
      <div 
        ref={scrollRef}
        className="flex h-full w-full overflow-x-auto gap-4 p-6 items-stretch"
        style={{ scrollSnapType: 'x mandatory', scrollBehavior: 'auto' }}
        onWheel={onWheel}
      >
          {children}
      </div>
  );
};
