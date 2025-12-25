import React from 'react';
import { Card } from '../../types';
import { Box, Zap, Coins } from 'lucide-react';

interface CardCarouselProps {
    availableCards: Card[];
    selectedCardId: string | null;
    onCardClick: (e: React.MouseEvent, card: Card) => void;
    onCancelSelection: () => void;
    isProcessingAI: boolean;
    popoverCardId?: string;
    doesCardNeedTarget: (card: Card) => boolean;
}

export const CardCarousel: React.FC<CardCarouselProps> = ({
    availableCards,
    selectedCardId,
    onCardClick,
    onCancelSelection,
    isProcessingAI,
    popoverCardId,
    doesCardNeedTarget
}) => {
    return (
        <div 
            className="flex-1 overflow-x-auto flex gap-2 items-center pb-1 custom-scrollbar"
            // Stop propagation to prevent App.tsx swipe logic
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
        >
            {availableCards.map((card, index) => {
                const isPopoverSource = popoverCardId === card.id;
                return (
                    <div 
                        key={`${card?.id}_${index}`}
                        onClick={(e) => onCardClick(e, card)}
                        className={`h-24 w-32 rounded-lg border p-1.5 flex flex-col justify-between cursor-pointer transition-all shrink-0 group overflow-hidden
                            ${selectedCardId === card?.id ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-surface-light hover:border-highlight'} 
                            ${isProcessingAI ? 'opacity-50 cursor-not-allowed' : ''}
                            ${isPopoverSource ? 'z-[65] relative ring-2 ring-primary' : 'relative'}
                        `}
                    >
                        {card?.triggerType === 'reaction' && (
                            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-endorphin border border-surface z-10" title="反应卡牌"></div>
                        )}
                        <div>
                            {/* Card Name -> Dopamine */}
                            <div className="text-[10px] font-bold text-dopamine leading-tight truncate">{card?.name}</div>
                            <div className="text-[9px] text-muted leading-tight mt-1 line-clamp-3 h-[36px] overflow-hidden break-words whitespace-pre-wrap">{card?.description}</div>
                        </div>
                        
                        <div className="flex justify-between items-center mt-auto text-[8px] pt-1 border-t border-border/50">
                            <span className="text-muted font-mono">{card?.itemType === 'skill' ? '技能' : '物品'}</span>
                            {card?.cost ? <span className="text-warning-fg font-mono flex items-center gap-0.5"><div className="w-1 h-1 bg-warning-base rounded-full"></div>{card.cost}</span> : <span className="text-muted">-</span>}
                        </div>
                        
                        {doesCardNeedTarget(card) && (
                            <div className="absolute top-1 right-1 text-[8px] text-endorphin-fg bg-endorphin/90 px-1 rounded backdrop-blur-sm pointer-events-none font-bold">
                                需目标
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};