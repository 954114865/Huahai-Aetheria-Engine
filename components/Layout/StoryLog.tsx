
import React, { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { GameState, Character, GamePhase, LogEntry, GameImage, WindowState } from '../../types';
import { Button, TextArea, Input, Label } from '../ui/Button';
import { Trash2, Scissors, Edit2, RefreshCw, ListOrdered, User, CheckCircle, AlertCircle, Sword, Play, Pause, Square, FastForward, X, Zap, MapPin, ArrowDown, MoreHorizontal, Book, BookOpen, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import { ImageUploadModal } from '../Modals/ImageUploadModal';
import { ModelQueueIndicator } from '../ui/ModelQueueIndicator'; // Import Indicator
import { Window } from '../ui/Window';

interface StoryLogProps {
    state: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    onConfirm: (title: string, msg: string, action: () => void) => void;
    onRollback: (index: number) => void; 
    onRegenerate: (index: number) => void; 
    onStopExecution: () => void;
    onUnveil?: (logs: string[], charIds: string[], intent?: string) => void; 
    openWindow?: (type: WindowState['type'], data?: any) => void; // New Prop
}

// Character Selection Modal for Unveil
const CharacterSelectorModal: React.FC<{
    state: GameState,
    onConfirm: (ids: string[], intent: string) => void,
    onCancel: () => void
}> = ({ state, onConfirm, onCancel }) => {
    const activeLocId = state.map.activeLocationId;
    const localChars = (Object.values(state.characters) as Character[]).filter(c => 
        state.map.charPositions[c.id]?.locationId === activeLocId
    );
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [intent, setIntent] = useState("");

    const toggle = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    return (
        <Window
            title={<span className="flex items-center gap-2 text-primary"><BookOpen size={18}/> 选择揭露对象</span>}
            onClose={onCancel}
            maxWidth="max-w-md"
            height="h-auto"
            zIndex={200}
            noPadding={true}
            footer={
                <div className="flex justify-end gap-2 w-full">
                    <Button variant="secondary" onClick={onCancel} size="sm">取消</Button>
                    <Button 
                        onClick={() => onConfirm(Array.from(selectedIds), intent)}
                        disabled={selectedIds.size === 0}
                        className="bg-primary hover:bg-primary-hover text-primary-fg border-transparent"
                        size="sm"
                    >
                        确认揭露
                    </Button>
                </div>
            }
        >
            <div className="p-4 flex flex-col gap-4">
                <p className="text-xs text-muted">请选择要补充回忆的当前地点角色。</p>
                
                <div className="flex-1 overflow-y-auto space-y-1 bg-surface-light/50 p-2 rounded border border-border custom-scrollbar min-h-[150px] max-h-[40vh]">
                    {localChars.map(char => {
                        const isSel = selectedIds.has(char.id);
                        return (
                            <div 
                                key={char.id} 
                                onClick={() => toggle(char.id)}
                                className={`flex items-center gap-3 p-2 rounded cursor-pointer border transition-colors ${isSel ? 'bg-primary/20 border-primary/50' : 'bg-surface/50 border-border hover:bg-surface-highlight'}`}
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSel ? 'border-primary bg-primary' : 'border-highlight'}`}>
                                    {isSel && <div className="text-primary-fg text-[10px]">✓</div>}
                                </div>
                                <div className="text-sm text-body font-bold">{char.name}</div>
                            </div>
                        )
                    })}
                    {localChars.length === 0 && <div className="text-muted text-center text-xs py-4">无可见角色</div>}
                </div>

                <div>
                    <Label>额外指示 (可选)</Label>
                    <TextArea 
                        className="w-full h-24 text-xs bg-surface-light/50 border-border resize-none p-3 focus:border-primary mt-1"
                        placeholder="在此指定你想要揭露的具体细节或方向..."
                        value={intent}
                        onChange={e => setIntent(e.target.value)}
                    />
                </div>
            </div>
        </Window>
    );
};

const ProcessVisualizer = ({ state, onClearError }: { state: GameState, onClearError: () => void }) => {
    const { phase, roundNumber, activeCharId, turnIndex, currentOrder, lastErrorMessage, isPaused } = state.round;
    const activeChar = activeCharId ? state.characters[activeCharId] : null;

    const steps = [
        { id: 'order', label: '判定顺序', icon: <ListOrdered size={14}/> },
        { id: 'turn', label: '角色行动', icon: <User size={14}/> },
        { id: 'settlement', label: '轮次结算', icon: <CheckCircle size={14}/> },
    ];

    // Determine current visual step
    let currentStepId = '';
    if (phase === 'init' || phase === 'order') currentStepId = 'order';
    else if (['turn_start', 'char_acting', 'executing'].includes(phase)) currentStepId = 'turn';
    else if (['settlement', 'round_end'].includes(phase)) currentStepId = 'settlement';

    return (
        <div className="bg-surface border-b border-border shadow-md z-30 flex flex-col shrink-0 relative">
            <div className="flex items-center justify-between px-3 py-2 h-14">
                <div className="flex items-center gap-2 md:gap-4 overflow-x-auto scrollbar-hide max-w-full h-full">
                    {/* ROUND BOX - Fixed Height h-10 */}
                    <div className="flex flex-col items-center justify-center bg-black/20 px-3 rounded border border-border shrink-0 h-10 min-w-[3.5rem]">
                        <span className="text-[8px] text-muted uppercase font-bold tracking-wider leading-none mb-0.5">Round</span>
                        {/* Round Number -> Endorphin */}
                        <span className="text-lg font-mono font-bold text-endorphin leading-none">{roundNumber}</span>
                    </div>
                    
                    {isPaused && (
                         /* PAUSED -> Endorphin */
                         <div className="flex items-center gap-2 text-endorphin text-xs font-bold bg-endorphin/10 px-2 py-1 rounded animate-pulse shrink-0 border border-endorphin/30 h-8">
                             <Pause size={12}/> <span className="hidden sm:inline">PAUSED</span>
                         </div>
                    )}

                    <div className="h-6 w-px bg-border mx-1 shrink-0"></div>

                    <div className="flex items-center gap-1">
                        {steps.map((step, idx) => {
                            const isActive = currentStepId === step.id;
                            const isDone = steps.findIndex(s => s.id === currentStepId) > idx;
                            
                            return (
                                <React.Fragment key={step.id}>
                                    {/* Steps -> Dopamine */}
                                    <div className={`
                                        flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 rounded transition-all shrink-0
                                        ${isActive 
                                            ? (lastErrorMessage ? 'bg-red-900/50 text-red-200 border border-danger' : 'bg-dopamine/10 text-dopamine border border-dopamine shadow-lg scale-105') 
                                            : isDone ? 'text-dopamine/50 opacity-70' : 'text-faint bg-surface'}
                                    `}>
                                        <div className={isActive && phase === 'executing' ? 'animate-spin' : ''}>{step.icon}</div>
                                        <span className="text-xs font-bold hidden sm:inline">{step.label}</span>
                                    </div>
                                    {idx < steps.length - 1 && (
                                        <div className={`h-0.5 w-2 md:w-4 ${isDone ? 'bg-dopamine/30' : 'bg-border'}`}></div>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                {/* Active Char Info */}
                {currentStepId === 'turn' && activeChar && (
                     <div className="flex items-center gap-2 md:gap-3 animate-in slide-in-from-right-4 pl-2 border-l border-border ml-2 shrink-0 h-full">
                         <div className="text-right hidden xs:flex flex-col justify-center h-full">
                             <div className="text-[9px] text-muted uppercase leading-tight">Turn {turnIndex + 1}/{currentOrder.length}</div>
                             <div className="text-sm font-bold text-body truncate max-w-[80px] leading-tight">{activeChar.name}</div>
                         </div>
                         {/* AVATAR BOX - Matched Height h-10 */}
                         <div className="w-10 h-10 rounded bg-surface-highlight overflow-hidden border border-border shrink-0">
                             {activeChar.avatarUrl ? (
                                <img src={activeChar.avatarUrl} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} alt={activeChar.name}/>
                             ) : (
                                <div className="w-full h-full bg-surface-light flex items-center justify-center">
                                    <User size={20} className="text-muted"/>
                                </div>
                             )}
                         </div>
                     </div>
                )}
            </div>

            {/* Error Message Display */}
            {lastErrorMessage && (
                <div className="bg-red-900/20 border-t border-red-900/50 px-4 py-2 flex items-center gap-2 text-xs text-danger-fg animate-in slide-in-from-top-1">
                    <AlertCircle size={14} className="shrink-0"/>
                    <span className="font-mono flex-1">{lastErrorMessage}</span>
                    <button 
                        onClick={onClearError}
                        className="p-1 hover:bg-red-900/30 rounded text-danger-fg hover:text-red-200 transition-colors"
                        title="关闭报错信息"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
        </div>
    );
};

// --- Location Bar Component ---
const LocationBar = ({ state, openWindow }: { state: GameState, openWindow?: (type: WindowState['type'], data?: any) => void }) => {
    const locId = state.map.activeLocationId;
    const location = locId ? state.map.locations[locId] : null;
    const regionName = location && location.regionId && state.map.regions[location.regionId] 
        ? state.map.regions[location.regionId].name 
        : "未知区域";
    
    // Check lock status
    const isLocked = state.appSettings.lockedFeatures?.locationEditor;

    const handlePinClick = (e: React.MouseEvent) => {
        if (isLocked || !location || !openWindow) return;
        e.stopPropagation();
        openWindow('location_edit', location);
    };

    // --- ANIMATION OPTIMIZATION ---
    // Use JS-driven 15fps loop instead of CSS animation to reduce performance overhead
    const bgRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        let frameId: number;
        let lastTime = 0;
        const FPS = 15;
        const INTERVAL = 1000 / FPS;
        const DURATION = 30000; // 30s one way

        const animate = (time: number) => {
            frameId = requestAnimationFrame(animate);
            if (time - lastTime < INTERVAL) return;
            lastTime = time;

            if (bgRef.current) {
                // Ease-in-out cycle (0% -> 100% -> 0%)
                // Cycle length = DURATION * 2
                const t = time % (DURATION * 2);
                // Map time to 0..1..0 with cosine easing
                // phase: 0 to 2*PI
                const phase = (t / (DURATION * 2)) * Math.PI * 2;
                const progress = (1 - Math.cos(phase)) / 2; // result 0..1
                
                bgRef.current.style.backgroundPosition = `center ${progress * 100}%`;
            }
        };

        frameId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameId);
    }, []);
    
    return (
        <div className="relative h-12 w-full overflow-hidden border-b border-border bg-app shrink-0 group z-20">
            {/* 1. Background Image */}
            <div 
                ref={bgRef}
                className="absolute inset-0 opacity-60 bg-no-repeat transition-opacity duration-500"
                style={{ 
                    backgroundImage: location?.avatarUrl ? `url(${location.avatarUrl})` : 'none',
                    backgroundSize: '100% auto', // Fit width, allow height to overflow
                    willChange: 'background-position', // Hint browser to optimize
                    filter: 'blur(0px)'
                }}
            />
            
            {/* 2. Gradient Overlay (Left Transparent -> Right Black) */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/40 to-black/90 pointer-events-none" />

            {/* 3. Info Text (Right Aligned) */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-right z-10 flex flex-col items-end justify-center h-full pointer-events-none">
                <div 
                    className="text-sm md:text-base font-black text-black uppercase tracking-widest leading-none mb-0.5"
                    style={{ 
                        // Location Name Stroke -> Oxytocin Color Hack
                        textShadow: '-1px -1px 0 #0d9488, 1px -1px 0 #0d9488, -1px 1px 0 #0d9488, 1px 1px 0 #0d9488' 
                    }}
                >
                    {regionName} - {location ? location.name : "未知地点"}
                </div>
            </div>
            
            {/* Optional Left Icon - Clickable if not locked */}
            <div 
                className={`absolute left-4 top-1/2 -translate-y-1/2 text-white/50 z-20 p-2 rounded transition-colors ${!isLocked && location ? 'cursor-pointer hover:bg-white/10 hover:text-white' : ''}`}
                onClick={handlePinClick}
                title={!isLocked && location ? "编辑地点信息" : "当前地点"}
            >
                <MapPin size={24} />
            </div>
        </div>
    );
};

export const StoryLog: React.FC<StoryLogProps> = ({ state, updateState, onConfirm, onRollback, onRegenerate, onStopExecution, onUnveil, openWindow }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const scrollAnchorRef = useRef<{ id: string, offset: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null); // To detect resize

    const [editingLogIndex, setEditingLogIndex] = useState<number | null>(null);
    const [editLogValue, setEditLogValue] = useState("");
    const [focusedLogIndex, setFocusedLogIndex] = useState<number | null>(null);
    const [expandedSystemGroups, setExpandedSystemGroups] = useState<Set<string>>(new Set());
    
    // Auto Round Input State
    const [showAutoInput, setShowAutoInput] = useState(false);
    const [autoRoundInput, setAutoRoundInput] = useState("5");

    // Scroll Management State
    const [showScrollBottom, setShowScrollBottom] = useState(false);

    // Unveil Mode State
    const [isUnveilMode, setIsUnveilMode] = useState(false);
    const [selectedUnveilIndices, setSelectedUnveilIndices] = useState<Set<number>>(new Set());
    const [showCharSelector, setShowCharSelector] = useState(false);
    // Delete Confirm State for Unveil Mode
    const [multiDeleteConfirm, setMultiDeleteConfirm] = useState(false);

    // Image Editing State
    const [editingImageInfo, setEditingImageInfo] = useState<{ logIndex: number, image: GameImage } | null>(null);

    const isLightMode = state.appSettings.storyLogLightMode;
    const isAutoScrollEnabled = state.appSettings.autoScrollOnNewLog ?? false; // Default false based on user preference

    // --- SCROLL LOGIC ---

    // 1. Handle user scrolling: Determine "Show Bottom" button and update Anchoring
    const handleScroll = () => {
        if (scrollRef.current) {
            const container = scrollRef.current;
            const { scrollTop, scrollHeight, clientHeight } = container;
            
            // Check if near bottom
            const isStickToBottom = scrollHeight - scrollTop - clientHeight < 100;
            setShowScrollBottom(!isStickToBottom);

            // Update Anchor for resizing stability
            const children = Array.from(container.children) as HTMLElement[];
            for (const child of children) {
                // Find first element whose bottom edge is below the current scroll top
                // This means it's the first visible (or partially visible at top) element
                if (child.offsetTop + child.offsetHeight > scrollTop) {
                    // Save ID and relative offset
                    scrollAnchorRef.current = {
                        id: child.id,
                        offset: scrollTop - child.offsetTop
                    };
                    break;
                }
            }
        }
    };

    // 2. Scroll to Bottom Helper
    const scrollToBottom = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
    };

    // 3. Auto-scroll on new content (Conditional)
    useEffect(() => {
        if (scrollRef.current && editingLogIndex === null) {
            // Only auto-scroll if setting is enabled AND user was already at bottom (or near it)
            // If setting is disabled, we do nothing, preserving current position.
            if (isAutoScrollEnabled && !showScrollBottom) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        }
    }, [state.world.history, editingLogIndex, expandedSystemGroups, isAutoScrollEnabled]);

    // 4. Scroll Restoration on Resize (Use ResizeObserver)
    useLayoutEffect(() => {
        if (!scrollRef.current) return;
        const container = scrollRef.current;

        const observer = new ResizeObserver(() => {
            // Logic: restore scroll position based on cached anchor
            if (scrollAnchorRef.current) {
                const anchorEl = document.getElementById(scrollAnchorRef.current.id);
                if (anchorEl) {
                    // Restore position: Element Top + Saved Offset
                    // Note: We set scrollTop directly to avoid animation jitter during resize
                    container.scrollTop = anchorEl.offsetTop + scrollAnchorRef.current.offset;
                }
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    // --- End Scroll Logic ---

    const handleLogEdit = (index: number, newValue: string) => {
        updateState(prev => {
            const newHistory = [...prev.world.history];
            newHistory[index] = { ...newHistory[index], content: newValue };
            return { ...prev, world: { ...prev.world, history: newHistory } };
        });
        setEditingLogIndex(null);
        setFocusedLogIndex(null);
    };

    const handleLogDelete = (index: number) => {
        // If deleting the last item, behave like a rollback to index-1
        if (index === state.world.history.length - 1 && index > 0) {
             onRollback(index - 1);
        } else {
             updateState(prev => {
                const newHistory = prev.world.history.filter((_, i) => i !== index);
                return { ...prev, world: { ...prev.world, history: newHistory } };
            });
        }
        if (editingLogIndex === index) setEditingLogIndex(null);
        if (focusedLogIndex === index) setFocusedLogIndex(null);
    };

    const handleRegenerateAt = (index: number) => {
        onConfirm("重新生成 / 分叉", "确定要从此处分叉/重新生成吗？\n\n**此条消息**及之后的所有内容将被删除，系统将重新从本回合开始演算。", () => {
            // Use specialized Regenerate function that enforces correct state
            onRegenerate(index);
            setFocusedLogIndex(null);
        });
    };

    const togglePause = () => {
        updateState(s => ({...s, round: {...s.round, isPaused: !s.round.isPaused}}));
    };

    const handleStopRound = () => {
        onStopExecution(); // Use new Engine Stop
    };

    const handleAutoRoundClick = () => {
        // If already running auto, stop it
        if ((state.round.autoAdvanceCount || 0) > 0) {
            updateState(s => ({ ...s, round: { ...s.round, autoAdvanceCount: 0 } }));
        } else {
            setShowAutoInput(true);
        }
    };

    const confirmAutoRounds = () => {
        const count = parseInt(autoRoundInput);
        if (!isNaN(count) && count > 0) {
            updateState(s => ({ 
                ...s, 
                round: { 
                    ...s.round, 
                    autoAdvanceCount: count,
                    isPaused: false // Also auto-start
                } 
            }));
        }
        setShowAutoInput(false);
    };

    const clearError = () => {
        updateState(prev => ({
            ...prev,
            round: { ...prev.round, lastErrorMessage: undefined }
        }));
    };

    const handleLogClick = (index: number, e: React.MouseEvent) => {
        // Prevent triggering if clicking inside edit area or buttons
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('textarea')) {
            return;
        }
        
        if (isUnveilMode) {
            const next = new Set(selectedUnveilIndices);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            setSelectedUnveilIndices(next);
            return;
        }

        if (focusedLogIndex === index) {
            setFocusedLogIndex(null);
        } else {
            setFocusedLogIndex(index);
        }
    };

    // --- Image Handling ---
    const handleImageUpdate = (newImage: GameImage) => {
        if (!editingImageInfo) return;
        const { logIndex } = editingImageInfo;
        
        updateState(prev => {
            const newHistory = [...prev.world.history];
            const logEntry = { ...newHistory[logIndex] };
            if (logEntry.images) {
                logEntry.images = logEntry.images.map(img => img.id === newImage.id ? newImage : img);
                newHistory[logIndex] = logEntry;
            }
            return { ...prev, world: { ...prev.world, history: newHistory } };
        });
        setEditingImageInfo(null);
    };

    // --- Unveil Logic ---
    const enterUnveilMode = (index: number) => {
        setIsUnveilMode(true);
        setSelectedUnveilIndices(new Set([index]));
        setFocusedLogIndex(null);
    };

    const handleUnveilConfirm = (charIds: string[], intent: string) => {
        setShowCharSelector(false);
        setIsUnveilMode(false);
        
        const logs = (Array.from(selectedUnveilIndices) as number[])
            .sort((a: number, b: number) => a - b)
            .map((i: number) => state.world.history[i]?.content)
            .filter((s): s is string => !!s);
        
        if (onUnveil) onUnveil(logs, charIds, intent);
        setSelectedUnveilIndices(new Set());
    };
    
    // --- Multi Delete Logic ---
    const handleMultiDelete = () => {
        if (!multiDeleteConfirm) {
            setMultiDeleteConfirm(true);
            setTimeout(() => setMultiDeleteConfirm(false), 2000); // 2s reset
            return;
        }

        // Execute Delete
        updateState(prev => ({
            ...prev,
            world: {
                ...prev.world,
                // Filter logs where index is NOT in selected set
                history: prev.world.history.filter((_, i) => !selectedUnveilIndices.has(i))
            }
        }));
        
        // Reset UI
        setIsUnveilMode(false);
        setSelectedUnveilIndices(new Set());
        setMultiDeleteConfirm(false);
    };

    // --- Smart Text Enrichment ---
    const enrichLogText = (text: string) => {
        let enriched = text;
        
        // Fix: Remove specific text-muted class to avoid dimming narrative logs
        enriched = enriched.replace("text-slate-400 italic", "italic");

        // 1. Replace Character Names with Avatar + Name
        // Filter characters that are present in the text AND have an avatar
        const matchingChars = (Object.values(state.characters) as Character[])
            .filter(char => char.avatarUrl && enriched.includes(char.name));

        // Sort by name length descending to handle overlapping names (e.g. "小明" vs "小明的家")
        // Longer names processed first to consume the string token
        matchingChars.sort((a, b) => b.name.length - a.name.length);

        if (matchingChars.length > 0) {
            // Escape special regex characters in names
            const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Construct a single regex OR pattern: (NameLong|NameShort|NameX)
            const pattern = new RegExp(`(${matchingChars.map(c => escapeRegExp(c.name)).join('|')})`, 'g');
            
            enriched = enriched.replace(pattern, (match) => {
                const char = matchingChars.find(c => c.name === match);
                if (char) {
                    // Added bg-black/50 for better visibility on transparent images
                    return `<span class="inline-flex items-center align-bottom mx-1 text-dopamine"><img src="${char.avatarUrl}" class="w-4 h-4 rounded-sm object-cover mr-1 opacity-80 bg-black/50"/>${char.name}</span>`;
                }
                return match;
            });
        }

        // 2. Replace [CardName] or 【CardName】 with Icon + Name
        const allCards = [...state.cardPool];
        (Object.values(state.characters) as Character[]).forEach(c => allCards.push(...c.skills));
        
        const uniqueCards = Array.from(new Set(allCards.map(c => c.name))).map(name => {
            return allCards.find(c => c.name === name);
        });

        uniqueCards.forEach(card => {
            if (!card || !card.imageUrl) return;
            
            // Added bg-black/50 for better visibility
            // Standard bracket
            if (enriched.includes(`[${card.name}]`)) {
                const imgTag = `[<span class="inline-flex items-center align-bottom mx-0.5"><img src="${card.imageUrl}" class="w-4 h-4 rounded-sm object-cover mr-1 opacity-80 bg-black/50"/>${card.name}</span>]`;
                enriched = enriched.split(`[${card.name}]`).join(imgTag);
            }
            // Chinese bracket
            if (enriched.includes(`「${card.name}」`)) {
                const imgTag = `「<span class="inline-flex items-center align-bottom mx-0.5"><img src="${card.imageUrl}" class="w-4 h-4 rounded-sm object-cover mr-1 opacity-80 bg-black/50"/>${card.name}</span>」`;
                enriched = enriched.split(`「${card.name}」`).join(imgTag);
            }
        });

        // 3. Process Bolding **text**
        const boldClass = isLightMode ? "text-indigo-900 italic font-bold" : "text-indigo-300 italic";
        enriched = enriched.replace(/\*\*(.*?)\*\*/g, `<span class="${boldClass}">$1</span>`);

        return enriched;
    };

    // --- Helper: Check if an entry is a System log ---
    const isSystemEntry = (entry: LogEntry) => {
        const line = entry.content;
        return entry.type === 'system' || !!line.match(/^\[.*?\]\s*系统[:\s]/) || line.includes('---');
    };

    // --- Grouping Logic for System Messages ---
    interface GroupedLogs {
        type: 'single' | 'group';
        id: string; // ID of the first item in the group or the item itself
        items: Array<{ entry: LogEntry, index: number }>;
    }

    const groupedHistory = useMemo(() => {
        const result: GroupedLogs[] = [];
        let currentGroup: Array<{ entry: LogEntry, index: number }> = [];

        state.world.history.forEach((entry, i) => {
            const isSystem = isSystemEntry(entry);
            
            if (isSystem) {
                currentGroup.push({ entry, index: i });
            } else {
                // If there's a pending group, push it
                if (currentGroup.length > 0) {
                    result.push({ 
                        type: 'group', 
                        id: currentGroup[0].entry.id, 
                        items: currentGroup 
                    });
                    currentGroup = [];
                }
                // Push current non-system entry
                result.push({ 
                    type: 'single', 
                    id: entry.id, 
                    items: [{ entry, index: i }] 
                });
            }
        });

        // Push any remaining group
        if (currentGroup.length > 0) {
            result.push({ 
                type: 'group', 
                id: currentGroup[0].entry.id, 
                items: currentGroup 
            });
        }
        return result;
    }, [state.world.history]);

    const toggleGroup = (groupId: string) => {
        const next = new Set(expandedSystemGroups);
        if (next.has(groupId)) next.delete(groupId);
        else next.add(groupId);
        setExpandedSystemGroups(next);
    };

    const renderLogItem = (entry: LogEntry, i: number, isGrouped: boolean = false) => {
        const line = entry.content;
        const isSystemLog = isSystemEntry(entry);
        
        // Fixed: Only extract tags that appear at the very START of the string to avoid catching skills in brackets
        const systemTagMatch = line.match(/^\[(.*?)\]/);
        const systemTag = systemTagMatch ? systemTagMatch[0] : "";
        const displayContent = systemTag ? line.substring(systemTag.length) : line;

        // Text Color Class based on Mode - Update to use new CSS Vars or specific classes
        const textClass = isSystemLog 
            ? 'text-muted text-xs italic border-l-2 border-border pl-2 py-1'
            : ''; // Inherit from parent (var(--text-story))

        const isFocused = focusedLogIndex === i;
        const isSelectedForUnveil = selectedUnveilIndices.has(i);

        // --- CHECK IF THIS IS A MILESTONE LOG FOR REGENERATION ---
        const isOrderLog = line.includes("系统: 本轮行动顺序") || line.includes("系统: 手动设定轮次顺序");
        const isSettlementLog = line.includes("--- 轮次结算阶段 ---");
        
        let isCharStartLog = !isSystemLog;

        // New: Environment characters do not create branch points
        if (entry.actingCharId && entry.actingCharId.startsWith('env_')) {
            isCharStartLog = false;
        }

        if (isCharStartLog) {
            // Logic to determine if this is the start of a character's turn log block
            // ... (omitted complex check for simplicity, relying on standard interactions)
            // Re-implementing simplified check from original
            for (let k = i - 1; k >= 0; k--) {
                const pLog = state.world.history[k];
                if (pLog.turnIndex === entry.turnIndex && pLog.type !== 'system') {
                    isCharStartLog = false;
                    break;
                }
                if (pLog.turnIndex !== entry.turnIndex) break;
                if (pLog.content.includes("系统: 本轮行动顺序") || pLog.content.includes("系统: 手动设定轮次顺序")) break;
            }
        }

        const isBranchablePoint = isOrderLog || isSettlementLog || isCharStartLog;
        
        // Assign Stable ID for Anchor Scrolling
        // We use entry.id which is unique
        const domId = entry.id || `log-item-${i}`;

        return (
            <div 
                id={domId}
                key={entry.id || i} 
                className={`
                    relative animate-in fade-in slide-in-from-bottom-1 duration-300 transition-colors rounded ${textClass} 
                    ${isFocused ? 'bg-primary/10 -mx-2 px-4 py-2 ring-1 ring-primary/20' : 'pr-2'}
                    ${isSelectedForUnveil ? 'bg-primary/10 -mx-2 px-4 py-2 ring-1 ring-primary/40' : ''}
                    ${isUnveilMode ? 'cursor-pointer hover:bg-white/5' : ''}
                    ${isGrouped ? 'mb-1' : ''}
                `}
                onClick={(e) => handleLogClick(i, e)}
            >
                {editingLogIndex === i ? (
                    <div className="flex flex-col gap-2 bg-surface/50 p-2 rounded border border-primary/50">
                        <TextArea 
                            autoFocus
                            value={editLogValue}
                            onChange={e => setEditLogValue(e.target.value)}
                            className="w-full min-h-[100px]"
                        />
                        <div className="flex justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setEditingLogIndex(null)}>取消</Button>
                            <Button size="sm" onClick={() => handleLogEdit(i, editLogValue)}>保存</Button>
                        </div>
                    </div>
                ) : (
                    <>
                        {isFocused && !isUnveilMode && (
                            <div className="absolute right-0 -top-8 z-20 flex gap-1 bg-surface-highlight border border-border shadow-xl px-2 py-1 rounded-t-lg rounded-bl-lg items-center animate-in slide-in-from-bottom-2 fade-in">
                                {isBranchablePoint && (
                                    <>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleRegenerateAt(i); }} 
                                            className="text-muted hover:text-dopamine p-1 rounded hover:bg-surface transition-colors" 
                                            title="重新生成/分叉 (删除此条及后续，从本回合重新开始)"
                                        >
                                            <Scissors size={14}/>
                                        </button>
                                        <div className="w-px h-3 bg-border mx-0.5"></div>
                                    </>
                                )}
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setEditingLogIndex(i); setEditLogValue(line); }} 
                                    className="text-muted hover:text-dopamine p-1 rounded hover:bg-surface transition-colors"
                                    title="编辑内容"
                                >
                                    <Edit2 size={14}/>
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleLogDelete(i); }} 
                                    className="text-muted hover:text-dopamine p-1 rounded hover:bg-surface transition-colors"
                                    title="删除此条 (仅删除记录，不回滚状态)"
                                >
                                    <Trash2 size={14}/>
                                </button>
                                <div className="w-px h-3 bg-border mx-0.5"></div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); enterUnveilMode(i); }} 
                                    className="text-muted hover:text-dopamine p-1 rounded hover:bg-surface transition-colors"
                                    title="揭露 (Unveil) - 进入多选模式"
                                >
                                    <Book size={14}/>
                                </button>
                            </div>
                        )}

                        <div className="flex gap-2">
                            {isUnveilMode && (
                                <div className={`mt-1 w-4 h-4 border rounded flex items-center justify-center shrink-0 ${isSelectedForUnveil ? 'bg-primary border-primary' : 'border-highlight'}`}>
                                    {isSelectedForUnveil && <div className="text-white text-[10px]">✓</div>}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div>
                                    <span className="opacity-30 text-[10px] mr-3 select-none font-mono text-muted">
                                        {systemTag}
                                        {state.devMode && entry.locationId && <span className="ml-1 text-[8px] opacity-50">[{entry.locationId.substring(0,8)}]</span>}
                                        {state.devMode && <span className="ml-1 text-[8px] opacity-30">T:{entry.turnIndex}</span>}
                                    </span>
                                    <span dangerouslySetInnerHTML={{__html: enrichLogText(displayContent)}}></span>
                                </div>
                                
                                {entry.images && entry.images.length > 0 && (
                                    <div className="flex flex-wrap gap-3 mt-3">
                                        {entry.images.map((img, idx) => (
                                            <div 
                                                key={idx} 
                                                className="relative group w-48 md:w-64 border border-border rounded-lg overflow-hidden bg-black/20 flex flex-col cursor-pointer hover:border-primary transition-colors shadow-sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingImageInfo({ logIndex: i, image: img });
                                                }}
                                            >
                                                {/* Adjusted background from bg-black to bg-black/50 for transparency friendliness */}
                                                <div className="w-full relative bg-black/50 flex items-center justify-center">
                                                    <img 
                                                        src={img.base64} 
                                                        alt={img.description} 
                                                        className="w-full h-auto max-h-96 object-contain"
                                                    />
                                                </div>
                                                <div className="bg-surface-light/80 p-2 text-xs text-body border-t border-border/50 text-center">
                                                    {img.description || "无描述"}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    };

    return (
      <div 
        className="flex-1 flex flex-col min-w-0 relative transition-colors duration-500 font-medium"
        style={{ backgroundColor: 'var(--bg-story)', color: 'var(--text-story)' }}
      >
          
          <div className={`absolute inset-0 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] ${isLightMode ? 'opacity-25' : 'opacity-100'}`} />

          {showCharSelector && (
              <CharacterSelectorModal 
                  state={state} 
                  onConfirm={handleUnveilConfirm} 
                  onCancel={() => setShowCharSelector(false)} 
              />
          )}

          {editingImageInfo && (
              <ImageUploadModal 
                  initialImage={editingImageInfo.image}
                  onClose={() => setEditingImageInfo(null)}
                  onConfirm={handleImageUpdate}
              />
          )}

          <ProcessVisualizer state={state} onClearError={clearError} />
          <LocationBar state={state} openWindow={openWindow} />

          <div className="flex-1 relative group">
            <ModelQueueIndicator />

            <div 
                ref={scrollRef} 
                className="absolute inset-0 overflow-y-auto p-4 md:p-6 space-y-4 font-serif leading-relaxed pt-14"
                onScroll={handleScroll}
            >
                {groupedHistory.map((group) => {
                    // Case 1: Single Log (Non-System)
                    if (group.type === 'single') {
                        return renderLogItem(group.items[0].entry, group.items[0].index);
                    }

                    // Case 2: Grouped System Logs
                    // Always show at least the first item
                    const isExpanded = expandedSystemGroups.has(group.id);
                    const firstItem = group.items[0];

                    return (
                        <div key={group.id} className="relative group/system">
                             <div className="relative">
                                {/* Render the first item normally */}
                                {renderLogItem(firstItem.entry, firstItem.index, true)}
                                
                                {/* Expansion Toggle Button - Only if more than 1 item */}
                                {group.items.length > 1 && (
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleGroup(group.id);
                                        }}
                                        className="absolute right-0 top-1 text-muted opacity-50 hover:opacity-100 p-1 hover:bg-surface-highlight rounded transition-all"
                                        title={isExpanded ? "收起" : `展开 (${group.items.length - 1} 条更多)`}
                                    >
                                        {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                    </button>
                                )}
                             </div>

                             {/* Render Remaining Items if Expanded */}
                             {isExpanded && group.items.length > 1 && (
                                 <div className="pl-2 border-l border-border/30 mt-1 space-y-1 animate-in slide-in-from-top-1 fade-in duration-200">
                                     {group.items.slice(1).map((item) => (
                                         renderLogItem(item.entry, item.index, true)
                                     ))}
                                 </div>
                             )}
                        </div>
                    );
                })}
                {state.world.history.length <= 1 && <div className="text-faint italic text-center mt-20">创建角色并解除暂停以开始故事...</div>}
            </div>

            {showScrollBottom && (
                <button
                    onClick={scrollToBottom}
                    className="absolute bottom-4 right-6 z-40 bg-primary hover:bg-primary-hover text-primary-fg rounded-full p-2 shadow-lg animate-bounce transition-colors border border-primary/50"
                    title="跳转至最新"
                >
                    <ArrowDown size={20} />
                </button>
            )}

            {isUnveilMode && (
                <div className="absolute top-10 left-0 w-full flex justify-center pointer-events-none z-[60] animate-in slide-in-from-top-2 fade-in">
                    <div className="glass-panel !rounded-full !shadow-lg flex items-center gap-3 px-4 py-2 border-primary/30 pointer-events-auto">
                        <span className="text-xs font-bold text-body hidden sm:block whitespace-nowrap">已选择 {selectedUnveilIndices.size} 条记录</span>
                        <button 
                            onClick={() => setShowCharSelector(true)}
                            className="bg-primary hover:bg-primary-hover text-primary-fg px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap shadow-sm"
                            disabled={selectedUnveilIndices.size === 0}
                        >
                            <BookOpen size={14}/> 揭露 {selectedUnveilIndices.size > 0 && <span className="sm:hidden">({selectedUnveilIndices.size})</span>}
                        </button>
                        
                        <div className="w-px h-4 bg-primary/30"></div>
                        <button
                            onClick={handleMultiDelete}
                            className={`px-3 py-1 rounded-full flex items-center justify-center transition-all shadow-sm ${multiDeleteConfirm ? 'bg-danger text-white' : 'bg-surface hover:bg-danger/20 text-muted hover:text-danger-fg'}`}
                            title="删除选中 (双击确认)"
                            disabled={selectedUnveilIndices.size === 0}
                        >
                            <Trash2 size={14} className={multiDeleteConfirm ? "animate-pulse" : ""} />
                        </button>

                        <div className="w-px h-4 bg-primary/30"></div>
                        <button 
                            onClick={() => { setIsUnveilMode(false); setSelectedUnveilIndices(new Set()); setMultiDeleteConfirm(false); }}
                            className="text-muted hover:text-body transition-colors"
                        >
                            <X size={16}/>
                        </button>
                    </div>
                </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border bg-surface p-2 flex items-center gap-2 z-30 relative">
              {showAutoInput && (
                  <>
                      <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowAutoInput(false)} />
                      <div className="absolute bottom-16 right-0 mr-2 bg-surface-highlight border border-highlight p-3 rounded shadow-xl flex flex-col gap-2 w-auto min-w-[180px] animate-in slide-in-from-bottom-2 z-50">
                          <div className="text-xs font-bold text-body">设置自动轮次数量</div>
                          <div className="flex gap-2">
                              <Input 
                                  type="number" 
                                  value={autoRoundInput} 
                                  onChange={e => setAutoRoundInput(e.target.value)}
                                  className="h-8 text-xs w-20"
                                  autoFocus
                              />
                              <Button size="sm" onClick={confirmAutoRounds} className="flex-1">确认</Button>
                          </div>
                          <div className="text-[10px] text-muted">结束后自动暂停</div>
                      </div>
                  </>
              )}

              <button 
                  onClick={togglePause} 
                  className="flex-1 h-10 flex items-center justify-center gap-2 text-sm font-bold bg-surface border border-border text-muted hover:text-highlight hover:bg-surface-highlight rounded transition-all"
                  title={state.round.isPaused ? "继续游戏" : "暂停游戏"}
              >
                  {!state.round.isPaused ? (
                      <><Pause size={18}/> 暂停</>
                  ) : (
                      <><Play size={18}/> 继续</>
                  )}
              </button>

              <button 
                  onClick={() => updateState(s => ({ ...s, round: { ...s.round, autoReaction: !s.round.autoReaction } }))}
                  className={`w-24 h-10 flex items-center justify-center gap-1 border rounded transition-all hover:bg-surface-highlight hover:text-highlight ${state.round.autoReaction ? 'text-primary font-bold border-primary bg-surface' : 'text-muted border-border bg-surface'}`}
                  title={state.round.autoReaction ? "玩家角色将自动使用AI反应" : "玩家角色需手动输入反应"}
              >
                  <Zap size={16} className={state.round.autoReaction ? "fill-current" : ""} /> 
                  <span className="text-xs">{state.round.autoReaction ? "自动反应" : "手动反应"}</span>
              </button>

              <button 
                  onClick={handleAutoRoundClick}
                  className={`w-24 h-10 flex items-center justify-center gap-1 border border-border rounded transition-all hover:bg-surface-highlight ${state.round.autoAdvanceCount && state.round.autoAdvanceCount > 0 ? 'bg-info-base/20 text-info-fg border-info-base' : 'text-muted bg-surface'}`}
                  title="自动进行多轮"
              >
                  {state.round.autoAdvanceCount && state.round.autoAdvanceCount > 0 ? (
                      <span className="font-mono font-bold animate-pulse">{state.round.autoAdvanceCount} 轮</span>
                  ) : (
                      <><FastForward size={18}/> 自动</>
                  )}
              </button>

              <button 
                  onClick={handleStopRound} 
                  className="w-16 h-10 flex items-center justify-center rounded bg-surface border border-border text-muted hover:text-highlight hover:bg-surface-highlight transition-all"
                  title="中止本轮 / 丢弃正在进行的AI请求"
              >
                  <Square size={18} className="fill-current"/>
              </button>
          </div>
      </div>
    );
};