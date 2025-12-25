
import React, { useState, useMemo } from 'react';
import { GameState, WindowState, GameAttribute, Character } from '../../types';
import { Edit2, User, Coins, ListOrdered, Trash2, Lock, MessageSquare, Heart, Activity, Zap, Smile, Crown, Footprints, Feather, VenetianMask, FileText } from 'lucide-react';
import { getCharacterMemory } from '../../services/aiService';
import { TextArea } from '../ui/Button';

interface RightPanelProps {
    selectedCharId: string | null;
    state: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    openWindow: (type: WindowState['type'], data?: any) => void;
    onToggleManualOrder?: (val: boolean) => void; 
    setSelectedCharId?: (id: string) => void;
}

// Robust attribute getter with aliases
const getAttrValue = (char: Character, key: string, fallback: number = 0): number => {
    if (!char || !char.attributes) return fallback;
    
    // 1. Direct match
    if (char.attributes[key]) return Number(char.attributes[key].value);
    
    // 2. Alias map (English <-> Chinese)
    const map: Record<string, string> = {
        'health': '健康', '健康': 'health',
        'cp': '创造点', '创造点': 'cp',
        'status': '状态', '状态': 'status',
        'physique': '体能', '体能': 'physique',
        'pleasure': '快感', '快感': 'pleasure',
        'energy': '能量', '能量': 'energy'
    };
    
    if (map[key] && char.attributes[map[key]]) {
        return Number(char.attributes[map[key]].value);
    }
    
    // 3. Case insensitive search
    const lowerKey = key.toLowerCase();
    const foundKey = Object.keys(char.attributes).find(k => k.toLowerCase() === lowerKey);
    if (foundKey) return Number(char.attributes[foundKey].value);
    
    return fallback;
};

export const RightPanel: React.FC<RightPanelProps> = ({ selectedCharId, state, updateState, openWindow, setSelectedCharId }) => {
    
    // Logic to recover order from history if current state is empty
    const displayOrder = useMemo(() => {
        if (state.round.currentOrder.length > 0) return state.round.currentOrder;

        // Scan history backwards for the last valid order log
        const history = state.world.history;
        for (let i = history.length - 1; i >= 0; i--) {
            const content = history[i].content;
            // Match logs like "系统: 本轮行动顺序...: [Name1, Name2]" or "系统: 手动...: [Name1]"
            const match = content.match(/顺序.*\[(.*?)\]/);
            if (match) {
                const namesOrIds = match[1].split(',').map(s => s.trim()).filter(s => s);
                const charMap = Object.values(state.characters) as Character[];
                const recoveredIds: string[] = [];
                
                namesOrIds.forEach(val => {
                    // 1. Try ID Match
                    if (state.characters[val]) {
                        recoveredIds.push(val);
                        return;
                    }
                    // 2. Try Name Match (Prefer Player > NPC)
                    const candidates = charMap.filter(c => c.name === val);
                    if (candidates.length > 0) {
                        const player = candidates.find(c => c.isPlayer);
                        recoveredIds.push(player ? player.id : candidates[0].id);
                    }
                });
                
                // Only return if we found valid IDs
                if (recoveredIds.length > 0) return recoveredIds;
            }
        }
        return [];
    }, [state.round.currentOrder, state.world.history, state.characters]);

    const isHistoricalView = state.round.currentOrder.length === 0 && displayOrder.length > 0;

    // Logic to combine "Active Order" + "Other Characters at Location"
    const fullList = useMemo(() => {
        const activeLocId = state.map.activeLocationId;
        
        // 1. Filter the global order to ONLY keep characters at the current location
        // This solves the issue of showing previous location's characters
        const localActiveOrder = displayOrder.filter(id => {
            const pos = state.map.charPositions[id];
            return pos && pos.locationId === activeLocId;
        });

        const activeSet = new Set(localActiveOrder);
        const inactiveIds: string[] = [];

        // 2. Find all OTHER characters at current location who are NOT in the active order
        if (activeLocId) {
            (Object.values(state.characters) as Character[]).forEach(c => {
                const pos = state.map.charPositions[c.id];
                if (pos && pos.locationId === activeLocId && !activeSet.has(c.id)) {
                    inactiveIds.push(c.id);
                }
            });
        }

        // Sort inactive by: Player first, then Name
        inactiveIds.sort((a, b) => {
            const cA = state.characters[a];
            const cB = state.characters[b];
            if (cA.isPlayer && !cB.isPlayer) return -1;
            if (!cA.isPlayer && cB.isPlayer) return 1;
            return cA.name.localeCompare(cB.name);
        });

        return [...localActiveOrder, ...inactiveIds];
    }, [displayOrder, state.map.activeLocationId, state.map.charPositions, state.characters]);

    return (
        <div className="w-full lg:w-72 bg-app border-l border-border flex flex-col z-0 shadow-xl h-full">
            {/* Top Control Bar for Manual Order & Skip Settlement (Fixed at top) */}
            <div className="p-4 border-b border-border bg-surface/30 flex flex-col gap-3 shrink-0">
                <div className="flex items-center gap-2 text-muted text-xs font-bold uppercase tracking-wider">
                    <ListOrdered size={14}/> 轮次控制
                </div>
                <div className="flex justify-between">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-muted select-none">
                        <div className="relative">
                            <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={state.round.useManualTurnOrder || false}
                                onChange={(e) => {
                                    const event = new CustomEvent('update_manual_order', { detail: e.target.checked });
                                    window.dispatchEvent(event);
                                }}
                            />
                            {/* Endorphin (Orange) for Control Toggles */}
                            <div className="w-7 h-4 bg-surface-highlight peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-endorphin"></div>
                        </div>
                        手动判定
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs text-muted select-none" title="行动后直接结束轮次，不进行结算">
                        <div className="relative">
                            <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={state.round.skipSettlement || false}
                                onChange={(e) => {
                                    updateState(s => ({ ...s, round: { ...s.round, skipSettlement: e.target.checked } }));
                                }}
                            />
                            {/* Endorphin (Orange) for Control Toggles */}
                            <div className="w-7 h-4 bg-surface-highlight peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-endorphin"></div>
                        </div>
                        跳过结算
                    </label>
                </div>
            </div>

            {/* Combined Scrollable Area for Order List AND Character Details */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                
                {/* Turn Order List Section */}
                <div className="p-3 border-b border-border bg-surface/50">
                    <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2 flex justify-between items-center">
                        <span>{isHistoricalView ? "上轮顺序 (回顾)" : "当前列表"} ({fullList.length})</span>
                        <span className="text-faint">{!isHistoricalView ? `Turn ${state.round.turnIndex + 1}` : "Ended"}</span>
                    </div>
                    
                    {fullList.length === 0 ? (
                        <div className="text-center text-xs text-faint py-2 italic">无人在此...</div>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            {fullList.map((id, idx) => {
                                const char = state.characters[id];
                                if (!char) return null;
                                
                                // Check if this ID is part of the GLOBAL turn order
                                const isInOrder = displayOrder.includes(id);
                                const orderIdx = isInOrder ? displayOrder.indexOf(id) : -1;
                                const isActive = !isHistoricalView && isInOrder && orderIdx === state.round.turnIndex;
                                
                                // Fetch all 4 attributes
                                const hp = getAttrValue(char, '健康');
                                const physique = getAttrValue(char, '体能');
                                const cp = getAttrValue(char, 'cp');
                                const pleasure = getAttrValue(char, '快感');
                                
                                const isDead = hp <= 0 && !char.id.startsWith('env_');

                                // Style for inactive (not in turn order) chars
                                const inactiveStyle = !isInOrder ? "opacity-60 grayscale hover:opacity-100 hover:grayscale-0" : "";

                                return (
                                    <div 
                                        key={`${id}-${idx}`}
                                        onClick={() => {
                                            if (setSelectedCharId) setSelectedCharId(id);
                                        }}
                                        className={`
                                            flex items-center gap-2 p-1.5 rounded border cursor-pointer transition-all relative
                                            ${isActive 
                                                ? 'bg-primary/20 border-primary/50 shadow-sm z-10' 
                                                : 'bg-surface border-border hover:border-highlight'
                                            }
                                            ${selectedCharId === id ? 'ring-1 ring-primary' : ''}
                                            ${isDead ? 'opacity-50 grayscale' : inactiveStyle}
                                        `}
                                    >
                                        <div className="w-4 text-center text-[9px] font-mono text-faint shrink-0">
                                            {isInOrder ? orderIdx + 1 : '-'}
                                        </div>
                                        <div className="w-8 h-8 rounded bg-surface-highlight overflow-hidden border border-border shrink-0">
                                            {char.avatarUrl ? <img src={char.avatarUrl} className="w-full h-full object-cover"/> : <User className="p-1 w-full h-full text-muted"/>}
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <div className={`text-xs font-bold leading-none truncate ${isActive ? 'text-primary' : 'text-body'}`}>{char.name}</div>
                                            
                                            {/* 4 Attributes Row - SEMANTIC COLORS UPDATED */}
                                            <div className="flex items-center gap-2 mt-1 w-full overflow-hidden">
                                                {/* Health -> Endorphin */}
                                                <div className="flex items-center gap-0.5 text-[8px] text-endorphin" title="健康 (Health)">
                                                    <Activity size={8}/> {hp}
                                                </div>
                                                {/* Physique -> Oxytocin */}
                                                <div className="flex items-center gap-0.5 text-[8px] text-oxytocin" title="体能 (Physique)">
                                                    <Zap size={8}/> {physique}
                                                </div>
                                                {/* Pleasure -> Libido */}
                                                <div className="flex items-center gap-0.5 text-[8px] text-libido" title="快感 (Pleasure)">
                                                    <Heart size={8}/> {pleasure}
                                                </div>
                                                {/* CP -> Dopamine */}
                                                <div className="flex items-center gap-0.5 text-[8px] text-dopamine" title="创造点 (CP)">
                                                    <Coins size={8}/> {cp}
                                                </div>
                                            </div>
                                        </div>
                                        {/* Status Dots - Fixed with semantic colors */}
                                        {char.isPlayer && <div className="w-1.5 h-1.5 rounded-full bg-dopamine shrink-0 mr-1" title="玩家角色"></div>}
                                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-success shrink-0 animate-pulse"></div>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Character Detail Section */}
                <div className="p-5">
                    {(!selectedCharId || !state.characters[selectedCharId]) ? (
                        <div className="flex flex-col items-center justify-center text-muted text-sm h-40 italic">
                            请选择一个角色以查看详情
                        </div>
                    ) : (
                        <CharacterDetail 
                            char={state.characters[selectedCharId]} 
                            state={state} 
                            openWindow={openWindow} 
                            updateState={updateState}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

const CharacterDetail: React.FC<{ char: Character, state: GameState, openWindow: any, updateState: any }> = ({ char, state, openWindow, updateState }) => {
    const isLocked = state.appSettings.lockedFeatures?.characterEditor;

    const cpValue = getAttrValue(char, 'cp', 0);
    const pleasureValue = getAttrValue(char, '快感', 50);

    const togglePlayerStatus = () => {
        updateState((prev: GameState) => ({
            ...prev,
            characters: {
                ...prev.characters,
                [char.id]: {
                    ...char,
                    isPlayer: !char.isPlayer
                }
            }
        }));
    };

    const toggleFollowStatus = () => {
        updateState((prev: GameState) => ({
            ...prev,
            characters: {
                ...prev.characters,
                [char.id]: {
                    ...char,
                    isFollowing: !char.isFollowing
                }
            }
        }));
    };

    return (
    <>
        <div className="flex justify-end mb-4 gap-2">
            <button
                onClick={() => openWindow('letter', char.id)}
                className="flex items-center gap-1 text-xs transition-colors px-2 py-1 rounded text-accent-teal hover:text-teal-300 hover:bg-surface border border-transparent hover:border-teal-900"
                title="书信 (Letters)"
            >
                <Feather size={14}/>
            </button>
            <button 
                onClick={() => !isLocked && openWindow('char', char)} 
                disabled={isLocked}
                className={`flex items-center gap-1 text-xs transition-colors px-2 py-1 rounded ${isLocked ? 'text-faint cursor-not-allowed' : 'text-muted hover:text-primary hover:bg-surface'}`}
            >
                {isLocked ? <Lock size={12}/> : <Edit2 size={12}/>} 编辑
            </button>
        </div>
        
        <div className="flex flex-col items-center mb-4">
            <div className="relative">
                {/* Player Status Hat Button (Crown) - Top (Dopamine) */}
                <button
                    onClick={togglePlayerStatus}
                    className={`absolute -top-3 left-1/2 -translate-x-1/2 z-10 p-1 rounded-full border transition-colors shadow-md hover:scale-110 ${char.isPlayer ? 'bg-dopamine border-dopamine text-black' : 'bg-surface-highlight border-border text-muted hover:bg-surface-light'}`}
                    title={char.isPlayer ? "当前为玩家角色 (点击取消)" : "设为玩家角色"}
                >
                    <Crown size={14} className={char.isPlayer ? "fill-current" : ""} />
                </button>

                {/* Avatar */}
                <div className="w-24 h-24 rounded-full bg-surface overflow-hidden border-4 border-border shadow-2xl group">
                        {char.avatarUrl ? 
                        <img src={char.avatarUrl} className="w-full h-full object-cover transition-transform group-hover:scale-110 pixelated" style={{ imageRendering: 'pixelated' }}/> 
                        : <User className="w-full h-full p-6 text-muted"/>}
                </div>
            </div>
            
            <div className="text-muted font-mono text-[10px] mb-2 bg-surface/50 px-2 py-0.5 rounded border border-border/50 mt-4">
                ID: {char.id}
            </div>

            <h2 className="text-xl font-bold text-body text-center leading-tight">{char.name}</h2>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-6">
                {/* CP -> Dopamine */}
                <div className="bg-dopamine/10 border border-dopamine/30 px-3 py-1 rounded flex items-center gap-2 text-dopamine font-mono text-sm" title="创造点 (Creation Points)">
                    <Coins size={14}/> {cpValue} CP
                </div>
                {/* Pleasure -> Libido */}
                <div className="bg-libido/10 border border-libido/30 px-3 py-1 rounded flex items-center gap-2 text-libido font-mono text-sm" title="快感 (Pleasure)">
                    <Heart size={14}/> {pleasureValue}
                </div>
                {/* Follow Status Button - Moved here */}
                <button
                    onClick={toggleFollowStatus}
                    className={`px-2 py-1 rounded border transition-colors shadow-sm flex items-center justify-center ${char.isFollowing ? 'bg-dopamine border-dopamine text-black hover:bg-dopamine/90' : 'bg-surface-highlight border-border text-muted hover:text-body'}`}
                    title={char.isFollowing ? "跟随模式已开启 (点击关闭)" : "开启跟随模式"}
                >
                    <Footprints size={14} className={char.isFollowing ? "fill-current" : ""} />
                </button>
        </div>

        <div className="space-y-4">
            {/* Appearance Section - Title -> Oxytocin */}
            {char.appearance && (
                <div className="bg-surface/50 p-3 rounded border border-oxytocin/30 relative">
                    <div className="text-[10px] font-bold text-oxytocin mb-1 flex items-center gap-1">
                        <VenetianMask size={10}/> 外观 (Appearance)
                    </div>
                    <p className="text-xs text-body leading-relaxed">
                        {char.appearance}
                    </p>
                </div>
            )}

            {/* Description Section - Title -> Oxytocin */}
            <div className="bg-surface/30 p-3 rounded border border-border relative">
                <div className="text-[10px] font-bold text-oxytocin mb-1 flex items-center gap-1">
                    <FileText size={10}/> 设定 (Description)
                </div>
                <p className="text-xs text-muted italic leading-relaxed">
                    "{char.description}"
                </p>
            </div>

            {/* Character Memory Section */}
            <div className="flex-1 flex flex-col min-h-[200px]">
                <h4 className="text-xs font-bold text-primary uppercase border-b border-primary/30 pb-2 mb-2 flex items-center gap-2">
                    <MessageSquare size={12}/> 角色记忆 (Memory)
                </h4>
                <TextArea 
                    readOnly 
                    value={getCharacterMemory(
                        state.world.history, 
                        char.id, 
                        state.map.activeLocationId, 
                        state.appSettings.maxCharacterMemoryRounds,
                        undefined, // No Image Builder for plain text view
                        state.appSettings.maxInputTokens,
                        state.characters,
                        state.map.locations
                    ) || "(暂无相关记忆)"} 
                    className="w-full h-64 font-serif text-xs leading-relaxed bg-black/30 text-muted resize-none border-border focus:border-highlight"
                />
            </div>
        </div>
    </>
    );
};
