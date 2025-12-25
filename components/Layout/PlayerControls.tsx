
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GameState, Card, MapLocation, LogEntry, DebugLog, Character, GameImage } from '../../types';
import { Button, TextArea } from '../ui/Button';
import { Send, Loader2, Plus, ShoppingCart, Gift, Eye, Clock, MapPin, Image as ImageIcon } from 'lucide-react';
import { PendingAction } from '../../hooks/useEngine';
import { DurationPicker } from '../ui/DurationPicker';
import { CardEditor } from '../Windows/CardEditor';
import { generateObservation } from '../../services/aiService';

// Extracted Components
import { SelectionPopover, SelectionItem } from '../ui/SelectionPopover';
import { LotteryModal } from '../Modals/LotteryModal';
import { ObservationModal } from '../Modals/ObservationModal';
import { ReactionInput } from '../PlayerControls/ReactionInput';
import { ActionQueue } from '../PlayerControls/ActionQueue';
import { CardCarousel } from '../PlayerControls/CardCarousel';
import { ImageUploadModal } from '../Modals/ImageUploadModal';
import { ImageAttachmentList } from '../ui/ImageAttachmentList';

// Extracted Hooks
import { usePlayerCards } from '../../hooks/usePlayerCards';
import { useInteractionPopover } from '../../hooks/useInteractionPopover';
import { useImageAttachments } from '../../hooks/useImageAttachments';

interface PlayerControlsProps {
    state: GameState;
    activeCharId: string;
    playerInput: string;
    setPlayerInput: (val: string) => void;
    selectedCardId: string | null;
    setSelectedCardId: (val: string | null) => void;
    selectedTargetId: string | null; // Deprecated but kept for interface compatibility
    setSelectedTargetId: (val: string | null) => void; // Deprecated but kept for interface compatibility
    submitPlayerTurn: (timePassed: number, images?: GameImage[]) => void; 
    isProcessingAI?: boolean;
    pendingActions?: PendingAction[];
    setPendingActions?: (actions: PendingAction[]) => void;
    onOpenShop?: () => void;
    reactionRequest?: {
        isOpen: boolean;
        message: string;
        title: string;
        charId: string;
        resolve: (response: string | null) => void;
    } | null;
    onRespondToReaction?: (response: string | null) => void;
    onAddLog?: (text: string, overrides?: Partial<LogEntry>) => void;
    addDebugLog?: (log: DebugLog) => void;
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
    state, activeCharId, playerInput, setPlayerInput, 
    selectedCardId, setSelectedCardId,
    submitPlayerTurn, isProcessingAI = false,
    pendingActions = [], setPendingActions,
    onOpenShop,
    reactionRequest, onRespondToReaction,
    onAddLog,
    addDebugLog
}) => {
    // Hooks
    const { activeChar, pendingCounts, availableCards, doesCardNeedTarget } = usePlayerCards(state, activeCharId, pendingActions);
    const { popoverState, openPopover, closePopover, setPopoverState } = useInteractionPopover();
    
    // Image Attachments Hook
    const { 
        images: attachedImages, 
        addImage, 
        removeImage, 
        clearImages, 
        isModalOpen, 
        openModal, 
        closeModal,
        editingImage,
        editImage
    } = useImageAttachments();

    // Local State
    const [showLottery, setShowLottery] = useState(false);
    const [showObservation, setShowObservation] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [manualTime, setManualTime] = useState({ y: 0, m: 0, d: 0, h: 0, min: 5, s: 0 });
    const [viewingCard, setViewingCard] = useState<Card | null>(null);
    
    // Refs for Focus & Interaction
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const isBurningLife = pendingActions.length > 2;

    // --- PLATFORM CHECK ---
    const isWindowsDesktop = () => {
        const ua = navigator.userAgent;
        return !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    };

    // Auto Focus Effect
    useEffect(() => {
        if (!isProcessingAI && activeChar?.isPlayer && !state.round.isPaused && isWindowsDesktop()) {
            // Slight delay to ensure render visibility
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        }
    }, [isProcessingAI, activeChar, state.round.isPaused]);

    // --- UTILS ---
    const formatDuration = (t: typeof manualTime) => {
        let str = "";
        if (t.y > 0) str += `${t.y}年`;
        if (t.m > 0) str += `${t.m}月`;
        if (t.d > 0) str += `${t.d}日`;
        if (t.h > 0) str += `${t.h}时`;
        if (t.min > 0) str += `${t.min}分`;
        if (t.s > 0) str += `${t.s}秒`;
        return str || "0秒";
    };

    const getTotalSeconds = (t: typeof manualTime) => {
        return t.y * 31536000 + t.m * 2592000 + t.d * 86400 + t.h * 3600 + t.min * 60 + t.s;
    };

    const handleSubmit = () => {
        const seconds = getTotalSeconds(manualTime);
        // Pass images along
        submitPlayerTurn(seconds, attachedImages);
        // Clear images after send
        clearImages();
    };

    // Keyboard Handler for Desktop
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!isWindowsDesktop()) return;

        // Enter to Send
        if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
        // Ctrl+Enter to Newline
        else if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            const target = e.target as HTMLTextAreaElement;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const val = target.value;
            const newVal = val.substring(0, start) + "\n" + val.substring(end);
            setPlayerInput(newVal);
            // Move cursor after update
            setTimeout(() => {
                target.selectionStart = target.selectionEnd = start + 1;
            }, 0);
        }
    };

    // --- Handlers ---

    // Get Target Options for Popover
    const getTargetItems = (): SelectionItem[] => {
        const currentLocId = state.map.activeLocationId;
        const chars = (Object.values(state.characters) as Character[])
            .filter(c => {
                const pos = state.map.charPositions[c.id];
                return pos && pos.locationId === currentLocId;
            })
            .map(c => ({ 
                id: c.id, 
                name: c.name, 
                description: c.description.substring(0, 30) + '...',
                icon: c.avatarUrl,
                isSelf: c.id === activeCharId
            }));
        return chars;
    };

    // Get Move Options for Popover
    const getMoveItems = (): SelectionItem[] => {
        const currentLocId = state.map.charPositions[activeCharId]?.locationId;
        const currentLoc = currentLocId ? state.map.locations[currentLocId] : null;
        if (!currentLoc) return [];

        const candidates: SelectionItem[] = [];
        (Object.values(state.map.locations) as MapLocation[]).forEach(loc => {
            if (loc.id === currentLocId) return;
            const dist = Math.sqrt((loc.coordinates.x - currentLoc.coordinates.x)**2 + (loc.coordinates.y - currentLoc.coordinates.y)**2);
            if (dist <= 1000 || (loc.isKnown && loc.regionId === currentLoc.regionId)) {
                candidates.push({
                    id: loc.id,
                    name: loc.name,
                    description: loc.isKnown ? (loc.description.substring(0, 30) + '...') : "未知地点",
                    icon: loc.avatarUrl
                });
            }
        });
        return candidates.sort((a, b) => a.name.localeCompare(b.name));
    };

    const handleTargetSelect = (targetId: string) => {
        if (popoverState?.cardId && setPendingActions) {
            const card = availableCards.find(c => c.id === popoverState.cardId);
            if (card) {
                setPendingActions([...pendingActions, {
                    id: `act_${Date.now()}`,
                    type: 'use_skill',
                    cardId: card.id,
                    cardName: card.name,
                    targetId: targetId
                }]);
            }
        }
        closePopover();
    };

    const handleMoveSelect = (locId: string) => {
        if (!setPendingActions) return;
        const loc = state.map.locations[locId];
        if (!loc) return;

        // Remove existing move actions to replace
        const filteredActions = pendingActions.filter(a => a.type !== 'move_to');
        
        setPendingActions([...filteredActions, {
            id: `act_move_${Date.now()}`,
            type: 'move_to',
            cardName: `移动至 [${loc.name}]`, 
            destinationId: loc.id,
            destinationName: loc.name
        }]);
        closePopover();
    };

    const handleCardClick = (e: React.MouseEvent, card: Card) => {
        if (isProcessingAI) return;
        
        // ISSUE 1 FIX: Logic to open details if card is clicked while popover is active for it
        if (popoverState && popoverState.isOpen && popoverState.cardId === card.id) {
            setViewingCard(card);
            closePopover();
            return;
        }
        
        // If card needs target -> Open Popover
        if (doesCardNeedTarget(card)) {
            openPopover(e, 'target', card.id);
        } else {
            // No target needed -> Standard selection logic
            if (selectedCardId === card.id) {
                setViewingCard(card); // View details on double click (or second click)
            } else {
                setSelectedCardId(card.id); 
            }
        }
    };

    const handleMoveButtonClick = (e: React.MouseEvent) => {
        if (isProcessingAI) return;
        openPopover(e, 'move');
    };

    const handleAddToQueue = () => {
        if (!selectedCardId || !setPendingActions) return;
        const card = availableCards.find(c => c.id === selectedCardId);
        if (!card) return;

        const newAction: PendingAction = {
            id: `act_${Date.now()}`,
            type: 'use_skill',
            cardId: card.id,
            cardName: card.name,
            targetId: undefined 
        };
        setPendingActions([...pendingActions, newAction]);
        setSelectedCardId(null);
    };

    const handleAddLotteryToQueue = (actionType: 'draw'|'deposit'|'peek', poolId: string, amount?: number, cardIds?: string[]) => {
        if (!setPendingActions) return;
        
        let name = "操作奖池";
        if (actionType === 'draw') name = `抽奖 (${amount}次)`;
        if (actionType === 'deposit') name = `放入物品 (${cardIds?.length})`;
        if (actionType === 'peek') name = `查看奖池 (${amount}个)`;

        const newAction: any = { 
            id: `act_lottery_${Date.now()}`,
            type: 'lottery',
            cardName: name,
            poolId: poolId,
            action: actionType,
            amount: amount,
            cardIds: cardIds,
            isHidden: false
        };
        setPendingActions([...pendingActions, newAction]);
    };

    const handleRemoveFromQueue = (index: number) => {
        if (!setPendingActions) return;
        const newActions = [...pendingActions];
        newActions.splice(index, 1);
        setPendingActions(newActions);
    };

    const handleObservation = async (query: string) => {
        if (!activeChar) return;
        setShowObservation(false);
        if (onAddLog) onAddLog(`系统: ${activeChar.name} 开始观测...`, { type: 'system', actingCharId: activeChar.id });
        
        try {
            const activeLocId = state.map.charPositions[activeChar.id]?.locationId;
            let currentLocation: MapLocation | undefined;
            if (activeLocId) currentLocation = state.map.locations[activeLocId];

            const nearbyKnown: MapLocation[] = [];
            const nearbyUnknown: MapLocation[] = [];
            if (currentLocation) {
                 (Object.values(state.map.locations) as MapLocation[]).forEach(loc => {
                     if (loc.id === currentLocation?.id) return;
                     const dist = Math.sqrt((loc.coordinates.x - currentLocation!.coordinates.x)**2 + (loc.coordinates.y - currentLocation!.coordinates.y)**2);
                     if (dist <= 1000) {
                         if (loc.isKnown) nearbyKnown.push(loc);
                         else nearbyUnknown.push(loc);
                     }
                 });
            }
            let nearbyContext = "";
            if (nearbyKnown.length === 0 && nearbyUnknown.length === 0) {
                nearbyContext = "(附近无其它已知地点)";
            } else {
                nearbyContext = nearbyKnown.map(l => {
                    const regionName = (l.regionId && state.map.regions[l.regionId]) ? state.map.regions[l.regionId].name : "未知区域";
                    return `[已知] ${l.name} (位于: ${regionName})`;
                }).join(", ");
                if (nearbyUnknown.length > 0) nearbyContext += (nearbyKnown.length > 0 ? ", " : "") + "[其它地点] (附近的未知区域)";
            }

            const localOthers = (Object.values(state.characters) as Character[]).filter(c => 
                c.id !== activeChar.id && state.map.charPositions[c.id]?.locationId === activeLocId
            );

            const obsText = await generateObservation(
                activeChar,
                query,
                state.world.history,
                state.world.attributes,
                localOthers,
                state.globalContext,
                state.cardPool,
                state.appSettings,
                state.defaultSettings,
                currentLocation,
                nearbyContext,
                state.map.regions,
                addDebugLog,
                state
            );

            if (obsText) {
                if (onAddLog) {
                    onAddLog(obsText, { type: 'narrative', isReaction: true, actingCharId: activeChar.id });
                }
            }

        } catch (e) {
            console.error(e);
            if (onAddLog) onAddLog("系统: 观测失败，思维似乎受阻。", { type: 'system' });
        }
    };

    // --- Conditional Renders ---

    // 1. Reaction Request (Priority)
    if (reactionRequest && reactionRequest.isOpen) {
        return (
            <ReactionInput 
                reactionRequest={reactionRequest} 
                state={state}
                playerInput={playerInput}
                setPlayerInput={setPlayerInput}
                onRespondToReaction={onRespondToReaction}
                onAddLog={onAddLog}
            />
        );
    }

    if (!activeChar && state.round.phase !== 'settlement') return null;

    const isPlayerTurn = activeChar?.isPlayer && state.round.phase === 'char_acting';

    return (
        <div className="min-h-[180px] bg-surface border-t border-border flex flex-col shadow-[0_-4px_20px_rgba(0,0,0,0.2)] relative z-10 text-body">
            
            {(isModalOpen || editingImage) && (
                <ImageUploadModal 
                    onClose={closeModal} 
                    onConfirm={addImage}
                    initialImage={editingImage}
                />
            )}

            {showTimePicker && createPortal(
                <DurationPicker 
                    initialDuration={manualTime}
                    onConfirm={(newVal) => { setManualTime(newVal); setShowTimePicker(false); }}
                    onCancel={() => setShowTimePicker(false)}
                />,
                document.body
            )}

            {showObservation && activeChar && (
                <ObservationModal 
                    state={state} 
                    activeChar={activeChar}
                    onClose={() => setShowObservation(false)}
                    onConfirm={handleObservation}
                    isProcessing={false} 
                />
            )}

            {viewingCard && createPortal(
                <CardEditor 
                    initialCard={viewingCard}
                    gameState={state}
                    onClose={() => setViewingCard(null)}
                    onSave={() => setViewingCard(null)}
                    readOnly={true}
                />,
                document.body
            )}

            {/* SELECTION POPOVER */}
            {popoverState && popoverState.isOpen && (
                <SelectionPopover 
                    title={popoverState.type === 'move' ? "选择目的地 (Move To)" : "选择目标 (Target)"}
                    items={popoverState.type === 'move' ? getMoveItems() : getTargetItems()}
                    anchorRect={popoverState.rect}
                    onSelect={popoverState.type === 'move' ? handleMoveSelect : handleTargetSelect}
                    onClose={closePopover}
                    onSourceClick={() => {
                        const card = availableCards.find(c => c.id === popoverState.cardId);
                        if (card) {
                            setViewingCard(card);
                            closePopover();
                        }
                    }}
                />
            )}

            {isPlayerTurn && !state.round.isPaused ? (
                <div className="flex flex-col h-full p-2 gap-2">
                    
                    {showLottery && activeChar && (
                        <LotteryModal 
                            state={state} 
                            activeChar={activeChar} 
                            pendingCounts={pendingCounts}
                            onClose={() => setShowLottery(false)} 
                            onConfirm={handleAddLotteryToQueue}
                        />
                    )}

                    {/* Pending Action Queue */}
                    <ActionQueue 
                        pendingActions={pendingActions} 
                        state={state} 
                        onRemove={handleRemoveFromQueue} 
                    />

                    {/* MAIN CONTROL AREA */}
                    <div className="flex flex-col gap-2">
                        
                        {/* ROW 1: Buttons & Tools */}
                        <div className="flex gap-2 justify-between items-center overflow-x-auto scrollbar-hide pb-1">
                            <div className="flex gap-2 shrink-0">
                                {/* Move Button: Styled to match ImageUpload (No text) */}
                                <Button 
                                    size="sm"
                                    className="h-9 px-2 flex items-center justify-center gap-1 border border-primary bg-primary/10 text-libido hover:bg-primary/20"
                                    onClick={handleMoveButtonClick}
                                    disabled={isProcessingAI}
                                    title="移动 (Move)"
                                >
                                    <MapPin size={14} />
                                </Button>

                                {/* Image Upload Button */}
                                <Button 
                                    size="sm" 
                                    className="h-9 px-2 bg-dopamine/10 border border-dopamine hover:bg-dopamine/20 text-dopamine flex items-center justify-center gap-1"
                                    onClick={openModal}
                                    disabled={isProcessingAI}
                                    title="附加图片"
                                >
                                    <ImageIcon size={14}/>
                                    {attachedImages.length > 0 && <span className="text-[10px] font-bold">{attachedImages.length}</span>}
                                </Button>

                                {/* Observation: Libido text, Primary bg/border (No text) */}
                                <Button 
                                    size="sm"
                                    className="h-9 px-2 border border-primary bg-primary/10 text-libido hover:bg-primary/20 flex items-center justify-center gap-1"
                                    onClick={() => setShowObservation(true)}
                                    disabled={isProcessingAI}
                                    title="观测 (Observation)"
                                >
                                    <Eye size={14} />
                                </Button>

                                {selectedCardId && (
                                    <Button
                                        className="h-9 px-2 bg-primary hover:bg-primary-hover border border-primary-active flex items-center justify-center gap-1 animate-in zoom-in duration-200 rounded text-white shadow-sm"
                                        onClick={handleAddToQueue}
                                        disabled={isProcessingAI}
                                        title="加入行动队列 (手动)"
                                    >
                                        <Plus size={14}/>
                                        <span className="text-[10px] font-bold">添加</span>
                                    </Button>
                                )}
                            </div>

                            {/* Removed extra margin (ml-2) here to tighten layout on mobile */}
                            <div className="flex gap-1 shrink-0 border-l border-border pl-2">
                                {/* Time Picker: Libido text, Primary bg/border, No Icon */}
                                <Button 
                                    className="h-9 px-2 border border-primary bg-primary/10 text-libido hover:bg-primary/20 flex items-center justify-center"
                                    onClick={() => setShowTimePicker(true)}
                                    disabled={isProcessingAI}
                                    title="调整本轮行动耗时"
                                >
                                    <span className="text-[10px] font-mono truncate max-w-[60px]">{formatDuration(manualTime)}</span>
                                </Button>

                                {/* Shop: Dopamine */}
                                <Button 
                                    size="sm" 
                                    className="h-9 px-2 bg-dopamine/10 border border-dopamine hover:bg-dopamine/20 text-dopamine flex items-center justify-center gap-1"
                                    onClick={onOpenShop}
                                    disabled={isProcessingAI}
                                    title="商店/创造"
                                >
                                    <ShoppingCart size={14}/>
                                </Button>
                                {/* Lottery: Dopamine */}
                                <Button 
                                    size="sm" 
                                    className="h-9 px-2 bg-dopamine/10 border border-dopamine hover:bg-dopamine/20 text-dopamine flex items-center justify-center gap-1"
                                    onClick={() => setShowLottery(true)}
                                    disabled={isProcessingAI}
                                    title="奖池"
                                >
                                    <Gift size={14}/>
                                </Button>
                            </div>
                        </div>

                        {/* ROW 2: Input & Navigation */}
                        <div className="flex gap-2 items-stretch">
                            <div className="relative flex-1 flex flex-col gap-2">
                                <TextArea 
                                  ref={inputRef}
                                  className="w-full h-full min-h-[3.5rem] rounded-lg p-2 text-xs focus:ring-2 focus:ring-primary outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed bg-surface-light border-border text-body placeholder:text-faint"
                                  placeholder={`${activeChar.name} 想要说什么/做什么...`}
                                  value={playerInput}
                                  onChange={e => setPlayerInput(e.target.value)}
                                  disabled={isProcessingAI}
                                  onKeyDown={handleKeyDown}
                                />
                                {attachedImages.length > 0 && (
                                    <div className="border border-border rounded p-1 bg-surface-light/50">
                                        <ImageAttachmentList 
                                            images={attachedImages}
                                            onRemove={removeImage}
                                            onAdd={openModal}
                                            maxImages={4}
                                            readOnly={isProcessingAI}
                                            onImageClick={editImage}
                                        />
                                    </div>
                                )}
                            </div>
                            
                            {/* Send Button: Swapped position */}
                            <div className="w-24 shrink-0 flex items-center justify-center">
                                <button
                                    onClick={handleSubmit}
                                    disabled={isProcessingAI}
                                    className={`w-full h-10 rounded flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border
                                        ${isBurningLife 
                                            ? 'bg-endorphin/10 border-endorphin text-endorphin hover:bg-endorphin/20' 
                                            : 'bg-dopamine/10 border-dopamine hover:bg-dopamine/20 text-dopamine'
                                        }`}
                                    title="发送/执行当前行动 (即使队列为空也可点击跳过回合)"
                                >
                                    {isProcessingAI ? <Loader2 size={16} className="animate-spin"/> : <Send size={16} />}
                                    <span className="text-xs font-bold">
                                        {isProcessingAI ? "执行" : (pendingActions.length > 0 ? (isBurningLife ? "燃命" : "执行") : "发送")}
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Card Carousel */}
                    <CardCarousel 
                        availableCards={availableCards}
                        selectedCardId={selectedCardId}
                        onCardClick={handleCardClick}
                        onCancelSelection={() => setSelectedCardId(null)}
                        isProcessingAI={isProcessingAI}
                        popoverCardId={popoverState?.cardId}
                        doesCardNeedTarget={doesCardNeedTarget}
                    />
                </div>
            ) : (
                <div className="flex items-center justify-center h-full text-muted gap-2 flex-col">
                    {state.round.isPaused ? (
                         <span className="flex items-center gap-2 text-sm"><Loader2 size={16} className="text-warning-base"/> 游戏暂停中</span>
                    ) : isProcessingAI ? (
                         <div className="flex flex-col items-center gap-1 animate-pulse text-primary">
                             <Loader2 size={24} className="animate-spin"/>
                             <span className="font-bold text-sm tracking-widest">AI PROCESSING</span>
                         </div>
                    ) : (
                         <span className="animate-pulse text-sm">等待 {state.characters[state.round.activeCharId || '']?.name || '角色'} 行动...</span>
                    )}
                </div>
            )}
        </div>
    );
};
