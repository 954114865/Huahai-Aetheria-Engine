
import React, { useState, useEffect, useMemo } from 'react';
import { GameState, Character, MapLocation, MapRegion } from '../../types';
import { Users, MapPin, Edit2, Trash2, ChevronDown, ChevronRight, Plus, Navigation, Copy, Sparkles, FolderOpen, Globe, UserPlus, Bot, CheckSquare, Square, Gift } from 'lucide-react';
import { Button } from '../ui/Button';
import { Window } from '../ui/Window';
import { LocationEditor } from './LocationEditor';
import { AiGenWindow } from './Pools/AiGenWindow';
import { propagateCharacterNameChange } from '../../services/characterUtils';

interface WorldCompositionWindowProps {
    winId: number;
    state: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    closeWindow: (id: number) => void;
    openWindow: (type: any, data?: any) => void;
    addLog: (text: string) => void;
    addDebugLog: (log: any) => void;
    data?: any; // Passed from openWindow (e.g. { targetCardId: '...' })
}

export const WorldCompositionWindow: React.FC<WorldCompositionWindowProps> = ({ 
    winId, state, updateState, closeWindow, openWindow, addLog, addDebugLog, data 
}) => {
    // --- State ---
    const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
    const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    
    // Sub-Editors
    const [editingLocation, setEditingLocation] = useState<MapLocation | null>(null);
    
    // AI Gen State: Now tracks specific target location
    const [genTargetLocId, setGenTargetLocId] = useState<string | null>(null);

    // Multi-Select Mode for Giving Cards
    const targetCardId = data?.targetCardId;
    const targetCardName = data?.targetCardName || "未知物品";
    const [selectedCharIds, setSelectedCharIds] = useState<Set<string>>(new Set());

    // Current Context
    const activeLocId = state.map.activeLocationId || "";
    const activeRegionId = activeLocId ? state.map.locations[activeLocId]?.regionId : null;

    // --- Initialization: Expand Current Context ---
    useEffect(() => {
        const newRegs = new Set<string>();
        const newLocs = new Set<string>();
        
        if (activeRegionId) newRegs.add(activeRegionId);
        if (activeLocId) newLocs.add(activeLocId);
        
        // Also expand "Unknown" regions if current location has no region
        if (activeLocId && !activeRegionId) newRegs.add("unknown_region");

        setExpandedRegions(newRegs);
        setExpandedLocations(newLocs);
    }, []); // Run once on mount

    // --- Data Preparation & Grouping ---
    const groupedData = useMemo(() => {
        const regions = Object.values(state.map.regions || {}) as MapRegion[];
        const locations = (Object.values(state.map.locations) as MapLocation[]).filter(l => l.isKnown);
        const characters = Object.values(state.characters) as Character[];

        // 1. Group Characters by Location
        const charsByLoc: Record<string, Character[]> = {};
        characters.forEach(c => {
            const locId = state.map.charPositions[c.id]?.locationId || "unknown_loc";
            if (!charsByLoc[locId]) charsByLoc[locId] = [];
            charsByLoc[locId].push(c);
        });

        // 2. Group Locations by Region
        const locsByRegion: Record<string, MapLocation[]> = {};
        locations.forEach(l => {
            const rId = l.regionId || "unknown_region";
            if (!locsByRegion[rId]) locsByRegion[rId] = [];
            locsByRegion[rId].push(l);
        });

        // 3. Prepare Region List (including 'unknown')
        const allRegions = [...regions];
        if (locsByRegion["unknown_region"]?.length > 0) {
            allRegions.push({ id: "unknown_region", name: "未探明区域 / 荒野", description: "不属于任何已知管辖范围的地带。", vertices: [], center: {x:0,y:0}, color: "" });
        }

        // 4. Sort Regions (Active First, then Alphabetical)
        allRegions.sort((a, b) => {
            if (a.id === activeRegionId) return -1;
            if (b.id === activeRegionId) return 1;
            // Put unknown last
            if (a.id === "unknown_region") return 1;
            if (b.id === "unknown_region") return -1;
            return a.name.localeCompare(b.name, 'zh');
        });

        // 5. Structure Final Data
        return allRegions.map(region => {
            const regionLocs = locsByRegion[region.id] || [];
            
            // Sort Locations (Active First, then Name)
            regionLocs.sort((a, b) => {
                if (a.id === activeLocId) return -1;
                if (b.id === activeLocId) return 1;
                return a.name.localeCompare(b.name, 'zh');
            });

            return {
                region,
                locations: regionLocs.map(loc => ({
                    location: loc,
                    characters: charsByLoc[loc.id] || []
                }))
            };
        });
    }, [state.map, state.characters, activeLocId, activeRegionId]);

    // --- Handlers ---

    const toggleRegion = (id: string) => {
        const next = new Set(expandedRegions);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedRegions(next);
    };

    const toggleLocation = (id: string) => {
        const next = new Set(expandedLocations);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedLocations(next);
    };

    const toggleCharSelection = (charId: string) => {
        const next = new Set(selectedCharIds);
        if (next.has(charId)) next.delete(charId);
        else next.add(charId);
        setSelectedCharIds(next);
    };

    const handleConfirmGive = () => {
        if (!targetCardId) return;
        
        const count = selectedCharIds.size;
        if (count === 0) {
            alert("请至少选择一个角色。");
            return;
        }

        updateState(prev => {
            const newChars = { ...prev.characters };
            let givenNames: string[] = [];
            
            selectedCharIds.forEach(cId => {
                const char = newChars[cId];
                if (char) {
                    // Check duplicate
                    if (!char.inventory.includes(targetCardId)) {
                        char.inventory = [...char.inventory, targetCardId];
                        givenNames.push(char.name);
                    }
                }
            });
            
            return { ...prev, characters: newChars };
        });

        addLog(`系统: 已将 [${targetCardName}] 分发给 ${count} 名角色。`);
        closeWindow(winId);
    };

    const handleDeleteLocation = (locId: string, locName: string) => {
        if (deleteConfirmId === locId) {
            updateState(prev => {
                const newLocations = { ...prev.map.locations };
                delete newLocations[locId];

                const newChars = { ...prev.characters };
                const newPositions = { ...prev.map.charPositions };
                const removedChars: string[] = [];

                Object.keys(prev.map.charPositions).forEach(charId => {
                    if (newPositions[charId].locationId === locId) {
                        delete newChars[charId];
                        delete newPositions[charId];
                        removedChars.push(charId);
                    }
                });

                let newActiveLoc = prev.map.activeLocationId;
                if (newActiveLoc === locId) {
                    newActiveLoc = Object.keys(newLocations)[0] || ""; 
                }

                return {
                    ...prev,
                    map: {
                        ...prev.map,
                        locations: newLocations,
                        charPositions: newPositions,
                        activeLocationId: newActiveLoc
                    },
                    characters: newChars,
                    round: {
                        ...prev.round,
                        currentOrder: prev.round.currentOrder.filter(id => !removedChars.includes(id)),
                        defaultOrder: prev.round.defaultOrder.filter(id => !removedChars.includes(id))
                    }
                };
            });
            addLog(`系统: 地点 [${locName}] 及其居民已移除。`);
            setDeleteConfirmId(null);
        } else {
            setDeleteConfirmId(locId);
            setTimeout(() => setDeleteConfirmId(null), 3000);
        }
    };

    const handleDeleteCharacter = (charId: string) => {
        if (deleteConfirmId === charId) {
            updateState(prev => {
                const newChars = { ...prev.characters };
                delete newChars[charId];
                return {
                    ...prev,
                    characters: newChars,
                    round: {
                        ...prev.round,
                        defaultOrder: prev.round.defaultOrder.filter(id => id !== charId),
                        currentOrder: prev.round.currentOrder.filter(id => id !== charId)
                    }
                };
            });
            setDeleteConfirmId(null);
            addLog(`系统: 角色已移除。`);
        } else {
            setDeleteConfirmId(charId);
            setTimeout(() => setDeleteConfirmId(null), 3000);
        }
    };

    const handleCopyCharacter = (originalChar: Character) => {
        const newId = `char_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const newChar: Character = JSON.parse(JSON.stringify(originalChar));
        newChar.id = newId;
        newChar.name = `${originalChar.name}(复制)`;
        newChar.isPlayer = false;
        
        if(newChar.drives) newChar.drives = newChar.drives.map((d, i) => ({...d, id: `drv_${newId}_${i}`}));
        if(newChar.conflicts) newChar.conflicts = newChar.conflicts.map((c, i) => ({...c, id: `conf_${newId}_${i}`}));

        updateState(prev => ({
            ...prev,
            characters: { ...prev.characters, [newId]: newChar },
            map: { 
                ...prev.map, 
                charPositions: { 
                    ...prev.map.charPositions, 
                    [newId]: { ...prev.map.charPositions[originalChar.id] } 
                } 
            },
            round: {
                ...prev.round,
                defaultOrder: [...prev.round.defaultOrder, newId],
                currentOrder: [...prev.round.currentOrder, newId]
            }
        }));
        addLog(`系统: 已复制角色 [${originalChar.name}]。`);
    };

    const handleLocationSave = (updatedLoc: MapLocation) => {
        // Check for name change to update Environment Character
        const oldLoc = state.map.locations[updatedLoc.id];
        const envCharId = `env_${updatedLoc.id}`;
        const envChar = state.characters[envCharId];
        
        let updateEnvChar: Character | undefined = undefined;
        let logSuffix = "";

        if (oldLoc && oldLoc.name !== updatedLoc.name && envChar) {
            const oldEnvName = envChar.name;
            const newEnvName = oldEnvName.split(oldLoc.name).join(updatedLoc.name);
            
            if (newEnvName !== oldEnvName) {
                // Apply Propagation
                updateEnvChar = propagateCharacterNameChange({ ...envChar, name: newEnvName }, oldEnvName, newEnvName);
                logSuffix = ` (关联环境角色已重命名为: ${newEnvName})`;
            }
        }

        updateState(prev => {
            const newChars = { ...prev.characters };
            if (updateEnvChar) {
                newChars[updateEnvChar.id] = updateEnvChar;
            }

            return {
                ...prev,
                map: {
                    ...prev.map,
                    locations: {
                        ...prev.map.locations,
                        [updatedLoc.id]: updatedLoc
                    }
                },
                characters: newChars
            };
        });
        setEditingLocation(null);
        addLog(`系统: 地点 [${updatedLoc.name}] 信息已更新。${logSuffix}`);
    };

    return (
        <Window
            title={targetCardId ? `分发物品: ${targetCardName}` : "世界构成 (World Composition)"}
            icon={targetCardId ? <Gift size={18}/> : <Globe size={18}/>}
            onClose={() => closeWindow(winId)}
            maxWidth="max-w-4xl"
            height="h-[85vh]"
            noPadding={true}
            footer={targetCardId ? (
                <div className="flex justify-between items-center w-full px-2">
                    <div className="text-xs text-muted">
                        已选中 <span className="font-bold text-primary">{selectedCharIds.size}</span> 名角色
                    </div>
                    <Button onClick={handleConfirmGive} disabled={selectedCharIds.size === 0} className="bg-success-base hover:bg-success-base/80 text-white">
                        确认分发
                    </Button>
                </div>
            ) : null} 
        >
            {editingLocation && (
                <LocationEditor 
                    location={editingLocation}
                    onSave={handleLocationSave}
                    onClose={() => setEditingLocation(null)}
                />
            )}
            
            {/* AI Generator */}
            {genTargetLocId && (
                <AiGenWindow 
                    state={state} 
                    updateState={updateState} 
                    addLog={addLog} 
                    onClose={() => setGenTargetLocId(null)} 
                    isPlayerMode={false}
                    addDebugLog={addDebugLog}
                    targetLocationId={genTargetLocId}
                />
            )}

            <div className="h-full overflow-y-auto custom-scrollbar p-2 space-y-3 bg-surface/30">
                
                <div className="flex justify-between items-center px-2 py-1 text-xs text-muted">
                    <span>{targetCardId ? "请勾选要接收物品的角色：" : "层级视图: 区域 > 地点 > 角色"}</span>
                    <span>总计: {Object.keys(state.map.regions).length} 区域, {Object.keys(state.map.locations).length} 地点, {Object.keys(state.characters).length} 角色</span>
                </div>

                {groupedData.length === 0 && (
                    <div className="text-center text-muted text-sm py-10 italic">
                        这片世界空无一物。请先探索或生成内容。
                    </div>
                )}

                {groupedData.map(({ region, locations }) => {
                    const isRegExpanded = expandedRegions.has(region.id);
                    return (
                        <div key={region.id} className="border-b border-border last:border-0 transition-all">
                            {/* Region Header */}
                            <div 
                                onClick={() => toggleRegion(region.id)}
                                className={`
                                    group flex flex-col p-3 cursor-pointer select-none transition-colors rounded-lg mb-1
                                    ${isRegExpanded ? 'bg-surface-highlight/10' : 'hover:bg-surface-light/50'}
                                `}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="text-muted transition-transform duration-200">
                                        {isRegExpanded ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                                    </div>
                                    <div className="flex items-center gap-2 font-bold text-base text-primary">
                                        <FolderOpen size={18} className="opacity-80"/>
                                        {region.name}
                                    </div>
                                    {region.id === activeRegionId && (
                                        <span className="text-[9px] bg-primary/20 text-primary px-2 py-0.5 rounded border border-primary/30 ml-2">
                                            当前区域
                                        </span>
                                    )}
                                    <span className="text-xs text-muted ml-auto font-mono">
                                        {locations.length} 地点
                                    </span>
                                </div>
                                <div className="text-[10px] text-muted pl-8 mt-1 truncate opacity-70 group-hover:opacity-100 transition-opacity">
                                    {region.description || "无描述..."}
                                </div>
                            </div>

                            {/* Region Content */}
                            {isRegExpanded && (
                                <div className="pl-4 pr-1 pb-4 space-y-3 border-l-2 border-border/30 ml-4">
                                    {locations.length === 0 && <div className="text-xs text-muted py-2 italic pl-2">此区域无已知地点。</div>}
                                    
                                    {locations.map(({ location, characters }) => {
                                        const isLocExpanded = expandedLocations.has(location.id);
                                        const isActiveLoc = location.id === activeLocId;

                                        return (
                                            <div key={location.id} className={`rounded-lg overflow-hidden transition-all border ${isActiveLoc ? 'border-primary/40 bg-primary/5' : 'border-border bg-surface/5'}`}>
                                                {/* Location Header */}
                                                <div 
                                                    className={`
                                                        flex items-center p-2 gap-3 cursor-pointer select-none
                                                        ${isLocExpanded ? 'border-b border-border/50' : ''}
                                                    `}
                                                    onClick={() => toggleLocation(location.id)}
                                                >
                                                    <div className="text-muted p-1 hover:text-body transition-transform">
                                                        {isLocExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                                                    </div>

                                                    <div className="w-10 h-10 rounded overflow-hidden border border-border shrink-0 bg-black/40">
                                                        {location.avatarUrl ? (
                                                            <img src={location.avatarUrl} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }}/>
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-muted"><MapPin size={16}/></div>
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-sm font-bold truncate ${isActiveLoc ? 'text-primary' : 'text-body'}`}>
                                                                {location.name}
                                                            </span>
                                                            {isActiveLoc && <span className="text-[9px] bg-red-600 text-white px-1.5 rounded shadow-sm">在此地</span>}
                                                        </div>
                                                        <div className="text-[10px] text-muted truncate opacity-80" title={location.description}>
                                                            {location.description || "无描述..."}
                                                        </div>
                                                    </div>

                                                    {/* Location Actions (Hidden in Give Mode) */}
                                                    {!targetCardId && (
                                                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                            {!isActiveLoc && (
                                                                <button 
                                                                    onClick={() => {
                                                                        updateState(prev => ({ ...prev, map: { ...prev.map, activeLocationId: location.id } }));
                                                                        addLog(`系统: 强制转移至 [${location.name}]`);
                                                                    }}
                                                                    className="p-1.5 rounded hover:bg-primary hover:text-white text-muted transition-colors"
                                                                    title="移动至此"
                                                                >
                                                                    <Navigation size={14}/>
                                                                </button>
                                                            )}
                                                            <button 
                                                                onClick={() => setEditingLocation(location)}
                                                                className="p-1.5 rounded hover:bg-surface-highlight hover:text-body text-muted transition-colors"
                                                                title="编辑地点"
                                                            >
                                                                <Edit2 size={14}/>
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteLocation(location.id, location.name)}
                                                                className={`p-1.5 rounded transition-colors ${deleteConfirmId === location.id ? 'bg-danger text-white animate-pulse' : 'text-muted hover:text-danger-fg hover:bg-surface-highlight'}`}
                                                                title="删除地点"
                                                            >
                                                                {deleteConfirmId === location.id ? "!" : <Trash2 size={14}/>}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Character List */}
                                                {isLocExpanded && (
                                                    <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-black/5">
                                                        {characters.length === 0 && (
                                                            <div className="col-span-full text-center text-xs text-faint italic py-2">
                                                                暂无角色。
                                                            </div>
                                                        )}
                                                        {characters.map(char => {
                                                            const isSelected = selectedCharIds.has(char.id);
                                                            return (
                                                                <div 
                                                                    key={char.id} 
                                                                    onClick={targetCardId ? () => toggleCharSelection(char.id) : undefined}
                                                                    className={`
                                                                        flex items-start gap-2 p-2 border rounded transition-colors group relative shadow-sm
                                                                        ${targetCardId 
                                                                            ? (isSelected ? 'bg-primary/20 border-primary cursor-pointer' : 'bg-surface border-border hover:bg-surface-highlight cursor-pointer') 
                                                                            : 'bg-surface border-border hover:border-primary/50'
                                                                        }
                                                                    `}
                                                                >
                                                                    {/* Selection Checkbox (Visible only in Give Mode) */}
                                                                    {targetCardId && (
                                                                        <div className={`mt-2 ${isSelected ? 'text-primary' : 'text-muted'}`}>
                                                                            {isSelected ? <CheckSquare size={16}/> : <Square size={16}/>}
                                                                        </div>
                                                                    )}

                                                                    <div className="w-8 h-8 rounded-full overflow-hidden border border-border shrink-0 bg-black">
                                                                        {char.avatarUrl ? (
                                                                            <img src={char.avatarUrl} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }}/>
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center bg-surface-highlight text-muted"><Users size={14}/></div>
                                                                        )}
                                                                    </div>
                                                                    
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex justify-between items-center h-4 mb-0.5">
                                                                            <div className="flex items-center gap-1 min-w-0">
                                                                                <span className="text-xs font-bold text-body truncate">{char.name}</span>
                                                                                {char.isPlayer && <span className="text-[8px] bg-primary text-black px-1 rounded font-bold shrink-0">PC</span>}
                                                                            </div>

                                                                            {/* Character Actions (Hidden in Give Mode) */}
                                                                            {!targetCardId && (
                                                                                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0 ml-1">
                                                                                    <button 
                                                                                        onClick={(e) => { e.stopPropagation(); handleCopyCharacter(char); }} 
                                                                                        className="text-muted hover:text-accent-teal transition-colors hover:bg-surface-highlight p-0.5 rounded"
                                                                                        title="复制"
                                                                                    >
                                                                                        <Copy size={12}/>
                                                                                    </button>
                                                                                    <button 
                                                                                        onClick={(e) => { e.stopPropagation(); openWindow('char', char); }} 
                                                                                        className="text-muted hover:text-primary transition-colors hover:bg-surface-highlight p-0.5 rounded"
                                                                                        title="编辑"
                                                                                    >
                                                                                        <Edit2 size={12}/>
                                                                                    </button>
                                                                                    <button 
                                                                                        onClick={(e) => { e.stopPropagation(); handleDeleteCharacter(char.id); }} 
                                                                                        className={`transition-colors p-0.5 rounded hover:bg-surface-highlight ${deleteConfirmId === char.id ? 'text-danger animate-pulse font-bold' : 'hover:text-danger text-muted'}`}
                                                                                        title="删除"
                                                                                    >
                                                                                        {deleteConfirmId === char.id ? "!" : <Trash2 size={12}/>}
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-[10px] text-muted truncate mt-0.5" title={char.description}>
                                                                            {char.description}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                        
                                                        {/* Actions Slot: Manual Create & AI Generate (Hidden in Give Mode) */}
                                                        {!targetCardId && (
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <button 
                                                                    onClick={() => openWindow('char', { initialLocationId: location.id })}
                                                                    className="flex items-center justify-center gap-1 p-2 border border-dashed border-border rounded text-xs text-muted hover:text-primary hover:border-primary hover:bg-surface transition-colors bg-surface/30"
                                                                    title="在此地点手动创建角色"
                                                                >
                                                                    <UserPlus size={14}/> 
                                                                    <span className="font-bold">手动</span>
                                                                </button>
                                                                <button 
                                                                    onClick={() => setGenTargetLocId(location.id)}
                                                                    className="flex items-center justify-center gap-1 p-2 border border-dashed border-border rounded text-xs text-muted hover:text-accent-teal hover:border-accent-teal hover:bg-surface transition-colors bg-surface/30"
                                                                    title="在此地点 AI 生成角色"
                                                                >
                                                                    <Bot size={14}/> 
                                                                    <span className="font-bold">AI生成</span>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </Window>
    );
};
