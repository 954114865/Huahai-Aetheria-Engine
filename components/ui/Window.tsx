
import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface WindowProps {
    title?: React.ReactNode;
    icon?: React.ReactNode;
    onClose?: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    headerActions?: React.ReactNode;
    
    // Layout Props
    maxWidth?: string; // e.g. "max-w-2xl"
    height?: string;   // e.g. "max-h-[90vh]" or "h-[500px]"
    zIndex?: number;   // default 50
    isOverlay?: boolean; // default true. If false, renders without fixed mask (inline).
    
    // Content Props
    noPadding?: boolean;
    disableContentScroll?: boolean; // If true, the content area won't auto-scroll (useful for internal layouts like Shop/Pools)
    className?: string; // Override outer container class
}

export const Window: React.FC<WindowProps> = ({
    title,
    icon,
    onClose,
    children,
    footer,
    headerActions,
    maxWidth = "max-w-2xl",
    height = "max-h-[90vh]",
    zIndex = 50,
    isOverlay = true,
    noPadding = false,
    disableContentScroll = false,
    className = ""
}) => {
    const isMouseDownOnOverlay = useRef(false);
    
    // Stop propagation of touch events to prevent SlidingLayout from capturing swipes
    const handleStopPropagation = (e: React.TouchEvent | React.MouseEvent) => {
        e.stopPropagation();
    };

    // Removed 'shadow-2xl' to rely on '.glass-panel' global shadow
    const panelContent = (
        <div 
            className={`glass-panel flex flex-col w-full ${maxWidth} ${height} ${className} overflow-hidden`}
            // Important: Stop swipe propagation on the window content itself
            onTouchStart={handleStopPropagation}
            onTouchMove={handleStopPropagation}
            onTouchEnd={handleStopPropagation}
        >
            {/* Header */}
            {(title || onClose || headerActions) && (
                <div className="p-3 md:p-4 border-b border-border flex justify-between items-center bg-surface-highlight shrink-0">
                    <div className="flex items-center gap-3 overflow-hidden min-w-0">
                        {icon && <div className="shrink-0 text-primary">{icon}</div>}
                        <div className="font-bold text-base md:text-lg text-highlight truncate flex items-center gap-2">
                            {title}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                        {headerActions}
                        {onClose && (
                            <button 
                                onClick={onClose} 
                                className="text-muted hover:text-highlight transition-colors p-1 rounded hover:bg-surface-light"
                                title="关闭"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Content */}
            <div className={`flex-1 min-h-0 relative flex flex-col bg-surface/50 ${disableContentScroll ? 'overflow-hidden' : 'overflow-y-auto custom-scrollbar'} ${noPadding ? '' : 'p-4 md:p-6'}`}>
                {children}
            </div>

            {/* Footer */}
            {footer && (
                <div className="p-3 md:p-4 border-t border-border bg-surface-highlight flex justify-end gap-2 shrink-0">
                    {footer}
                </div>
            )}
        </div>
    );

    if (!isOverlay) {
        return panelContent;
    }

    return createPortal(
        <div 
            className="fixed inset-0 bg-overlay flex items-center justify-center p-4 animate-in fade-in duration-200" 
            style={{ zIndex }}
            onTouchStart={handleStopPropagation}
            onTouchMove={handleStopPropagation}
            onTouchEnd={handleStopPropagation}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                    isMouseDownOnOverlay.current = true;
                } else {
                    isMouseDownOnOverlay.current = false;
                }
            }}
            onMouseUp={(e) => {
                if (e.target === e.currentTarget && isMouseDownOnOverlay.current && onClose) {
                    onClose();
                }
                isMouseDownOnOverlay.current = false;
            }}
        >
            {panelContent}
        </div>,
        document.body
    );
};
