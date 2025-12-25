
import React, { useState, useEffect } from 'react';

interface AIRequestItem {
    id: string;
    color: 'blue' | 'green' | 'yellow' | 'red' | 'gray';
    timestamp: number;
    terminated?: boolean; // Track if manually aborted
}

export const ModelQueueIndicator: React.FC = () => {
    const [queue, setQueue] = useState<AIRequestItem[]>([]);

    useEffect(() => {
        const handleUpdate = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail) return;
            const { id, color } = detail;

            setQueue(prev => {
                const existingIndex = prev.findIndex(item => item.id === id);
                
                if (existingIndex !== -1) {
                    // If already terminated, ignore subsequent updates (prevent zombie green state)
                    if (prev[existingIndex].terminated) {
                        return prev;
                    }

                    // Update existing item
                    const newQueue = [...prev];
                    newQueue[existingIndex] = { ...newQueue[existingIndex], color, timestamp: Date.now() };
                    return newQueue;
                } else {
                    // Add new item
                    const newItem: AIRequestItem = { id, color, timestamp: Date.now() };
                    const newQueue = [...prev, newItem];
                    // Keep max 10, discard from start (left)
                    if (newQueue.length > 10) {
                        return newQueue.slice(newQueue.length - 10);
                    }
                    return newQueue;
                }
            });
        };

        const handleAbortAll = () => {
            setQueue(prev => prev.map(item => {
                // If item is pending (blue/yellow/red), mark as gray and terminated
                if (['blue', 'yellow', 'red'].includes(item.color)) {
                    return { ...item, color: 'gray', terminated: true };
                }
                return item;
            }));
        };

        window.addEventListener('ai_request_update', handleUpdate);
        window.addEventListener('ai_abort_all', handleAbortAll);
        
        return () => {
            window.removeEventListener('ai_request_update', handleUpdate);
            window.removeEventListener('ai_abort_all', handleAbortAll);
        };
    }, []);

    if (queue.length === 0) return null;

    const getColorClass = (color: string) => {
        switch(color) {
            case 'blue': return 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse'; // Processing
            case 'green': return 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]'; // Success (Static)
            case 'yellow': return 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)] animate-pulse'; // Retry
            case 'red': return 'bg-rose-500 shadow-[0_0_6px_rgba(225,29,72,0.5)] animate-pulse'; // Retry/Error
            case 'gray': return 'bg-slate-500/80'; // Fail (Static)
            default: return 'bg-slate-600';
        }
    };

    return (
        <div className="absolute top-2 left-0 w-full flex justify-center pointer-events-none z-50">
            {/* Visual Update: 
                1. Removed outer opacity-90 to let glass effect shine.
                2. Added !rounded-full and !shadow-lg to override glass-panel defaults for this specific pill shape.
                3. glass-panel class ensures chromatic aberration and blur match system windows.
            */}
            <div className="glass-panel !rounded-full !shadow-lg flex gap-2 p-1.5 transition-all items-center overflow-visible">
                {queue.map((item) => (
                    <div 
                        key={item.id}
                        className={`w-2 h-2 rounded-full transition-all duration-300 ${getColorClass(item.color)}`}
                    />
                ))}
            </div>
        </div>
    );
};
