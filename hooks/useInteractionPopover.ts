
import React, { useState } from 'react';

export interface PopoverState {
    isOpen: boolean;
    rect: DOMRect;
    type: 'target' | 'move';
    cardId?: string;
}

export const useInteractionPopover = () => {
    const [popoverState, setPopoverState] = useState<PopoverState | null>(null);

    const openPopover = (e: React.MouseEvent, type: 'target' | 'move', cardId?: string) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPopoverState({
            isOpen: true,
            rect,
            type,
            cardId
        });
    };

    const closePopover = () => {
        setPopoverState(null);
    };

    return {
        popoverState,
        openPopover,
        closePopover,
        setPopoverState
    };
};
