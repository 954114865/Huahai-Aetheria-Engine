
import React from 'react';
import { createPortal } from 'react-dom';
import { X, User } from 'lucide-react';

export interface SelectionItem {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    isSelf?: boolean;
}

interface SelectionPopoverProps {
    title: string;
    items: SelectionItem[];
    anchorRect: DOMRect;
    onSelect: (id: string) => void;
    onClose: () => void;
    onSourceClick?: () => void;
}

export const SelectionPopover: React.FC<SelectionPopoverProps> = ({ title, items, anchorRect, onSelect, onClose, onSourceClick }) => {
    const popoverWidth = 240; // Slightly wider for better text fit
    
    // Height Calculation: 
    // Header = 40px
    // Item = ~56px (including padding/borders/gap)
    // Add buffer
    const itemHeight = 56;
    const headerHeight = 40;
    const buffer = 10;
    
    // Limit max height to around 400px or roughly 6 items to keep it manageable
    const calculatedHeight = items.length * itemHeight + headerHeight + buffer;
    const popoverHeight = Math.min(400, calculatedHeight);
    
    // Ensure height is at least enough for header + 1 item or "No items" message
    const finalHeight = Math.max(100, popoverHeight);

    let left = anchorRect.left + (anchorRect.width / 2) - (popoverWidth / 2);
    // Keep within screen bounds horizontal
    left = Math.max(10, Math.min(window.innerWidth - popoverWidth - 10, left));
    
    // Position above anchor
    const top = anchorRect.top - finalHeight - 10;

    // Stop propagation to prevent SlidingLayout swipe
    const handleStopPropagation = (e: React.TouchEvent | React.MouseEvent) => {
        e.stopPropagation();
    };

    return createPortal(
        <>
            <div className="fixed inset-0 z-[60] bg-transparent" onClick={onClose} onTouchStart={handleStopPropagation} />
            
            {onSourceClick && (
                <div 
                    className="fixed z-[65] cursor-pointer"
                    style={{
                        top: anchorRect.top,
                        left: anchorRect.left,
                        width: anchorRect.width,
                        height: anchorRect.height
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSourceClick();
                    }}
                    title="点击查看详情"
                />
            )}

            <div 
                className="fixed z-[70] glass-panel flex flex-col overflow-hidden animate-in slide-in-from-bottom-2 fade-in zoom-in-95 duration-200 text-body"
                style={{ 
                    top: `${top}px`, 
                    left: `${left}px`,
                    width: `${popoverWidth}px`,
                    height: `${finalHeight}px`
                }}
                onTouchStart={handleStopPropagation}
                onTouchMove={handleStopPropagation}
                onTouchEnd={handleStopPropagation}
            >
                <div className="bg-surface-highlight p-2 border-b border-border text-xs font-bold text-muted flex justify-between items-center shrink-0 h-[40px]">
                    <span>{title}</span>
                    <button onClick={onClose} className="hover:text-highlight"><X size={14}/></button>
                </div>
                <div className="overflow-y-auto p-1 custom-scrollbar bg-surface/30 flex-1">
                    {items.length === 0 && <div className="text-center text-muted text-xs py-4">无可用选项</div>}
                    {items.map(item => (
                        <button
                            key={item.id}
                            onClick={() => onSelect(item.id)}
                            className="w-full flex items-center gap-2 p-2 hover:bg-surface-highlight rounded text-left transition-colors group min-h-[48px]"
                        >
                            <div className="w-8 h-8 rounded bg-surface-light border border-border overflow-hidden shrink-0 group-hover:border-highlight flex items-center justify-center">
                                {item.icon ? (
                                    <img src={item.icon} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
                                ) : (
                                    <User size={16} className="text-muted"/>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-body truncate flex items-center gap-1">
                                    {item.name}
                                    {item.isSelf && <span className="text-[9px] bg-primary/20 text-primary px-1 rounded">我</span>}
                                </div>
                                {item.description && <div className="text-[9px] text-muted truncate">{item.description}</div>}
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </>,
        document.body
    );
};
