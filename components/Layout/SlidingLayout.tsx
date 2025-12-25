
import React, { useRef, useState, useEffect } from 'react';

interface SlidingLayoutProps {
    currentView: 'story' | 'map' | 'char';
    onChangeView: (view: 'story' | 'map' | 'char') => void;
    children: React.ReactNode[]; // Expected to be exactly 3 elements [Map, Story, Char]
    disabled?: boolean; // New prop to disable gestures
}

export const SlidingLayout: React.FC<SlidingLayoutProps> = ({ currentView, onChangeView, children, disabled = false }) => {
    // View Index mapping
    const viewOrder = ['map', 'story', 'char'];
    const currentViewIndex = viewOrder.indexOf(currentView);

    // Responsive State: Use matchMedia to track if we are on a large screen
    // This ensures React re-renders immediately when orientation changes or fold state changes
    const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(min-width: 1024px)');
        
        const handleResize = (e: MediaQueryListEvent) => {
            setIsDesktop(e.matches);
        };

        // Ensure state is synced on mount
        setIsDesktop(mediaQuery.matches);

        // Add listener
        mediaQuery.addEventListener('change', handleResize);
        
        return () => {
            mediaQuery.removeEventListener('change', handleResize);
        };
    }, []);

    // Swipe Gesture State
    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);
    const [dragX, setDragX] = useState(0); 
    const [isDragging, setIsDragging] = useState(false);
    const isMapInteraction = useRef(false);

    // Swipe Handler Functions
    const handleTouchStart = (e: React.TouchEvent) => {
        if (disabled) return; // Disable if modal open

        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        setIsDragging(true);
        setDragX(0);

        // Check if touching map canvas - if so, DISABLE global swipe to allow map panning
        // Canvas is inside the map panel (index 0)
        if (currentView === 'map') {
            const target = e.target as HTMLElement;
            if (target.tagName.toLowerCase() === 'canvas') {
                isMapInteraction.current = true;
            } else {
                isMapInteraction.current = false;
            }
        } else {
            isMapInteraction.current = false;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (disabled) return;
        if (touchStartX.current === null || touchStartY.current === null) return;
        if (isMapInteraction.current) return;

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = currentX - touchStartX.current;
        const deltaY = currentY - touchStartY.current;

        // Stricter Threshold: Horizontal movement must be dominant
        if (Math.abs(deltaY) * 1.2 > Math.abs(deltaX)) {
            return; 
        }
        
        setDragX(deltaX);
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (disabled) return;
        setIsDragging(false);
        
        if (touchStartX.current === null || touchStartY.current === null) {
            setDragX(0);
            return;
        }
        
        if (isMapInteraction.current) {
            isMapInteraction.current = false;
            setDragX(0);
            return;
        }

        const touchEndX = e.changedTouches[0].clientX;
        const finalDeltaX = touchEndX - touchStartX.current;
        
        // Reset refs
        touchStartX.current = null;
        touchStartY.current = null;

        const threshold = 100; // Pixel threshold to switch page

        if (finalDeltaX < -threshold) {
            // Swipe Left -> Go Next (Story -> Char)
            const nextIndex = Math.min(viewOrder.length - 1, currentViewIndex + 1);
            onChangeView(viewOrder[nextIndex] as any);
        } else if (finalDeltaX > threshold) {
            // Swipe Right -> Go Prev (Story -> Map)
            const prevIndex = Math.max(0, currentViewIndex - 1);
            onChangeView(viewOrder[prevIndex] as any);
        }
        
        // Reset drag visual
        setDragX(0);
    };

    return (
        <div 
            className="flex-1 flex flex-row relative overflow-hidden w-full lg:w-auto"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* 
               DESKTOP: Normal Flex Layout (All 3 visible)
               MOBILE: Sliding Container 300vw width
            */}
            <div 
                className={`
                    flex-1 flex flex-row h-full transition-transform duration-300 ease-out lg:transform-none lg:w-full
                `}
                style={{
                    // Logic fixed: Use state-tracked 'isDesktop' instead of raw window.innerWidth
                    // This ensures the style updates immediately when orientation changes
                    width: isDesktop ? '100%' : '300vw',
                    transform: isDesktop 
                        ? 'none' 
                        : `translateX(calc(-${currentViewIndex * 100}vw + ${isDragging ? dragX : 0}px))`
                }}
            >
                {/* Left Panel (Map) - Index 0 */}
                <div className="w-[100vw] lg:w-auto lg:flex-none lg:flex flex-col z-20 h-full border-r border-border shrink-0">
                    {children[0]}
                </div>

                {/* Center Panel (Story) - Index 1 */}
                <div className="w-[100vw] lg:flex-1 flex flex-col min-w-0 relative h-full">
                    {children[1]}
                </div>

                {/* Right Panel (Char) - Index 2 */}
                <div className="w-[100vw] lg:w-auto lg:flex-none lg:flex flex-col z-20 h-full border-l border-border shrink-0">
                    {children[2]}
                </div>
            </div>
        </div>
    );
};
