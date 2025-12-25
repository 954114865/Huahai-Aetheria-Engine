// ... existing imports ...
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GameState, WindowState, GameAttribute, Conflict, MapLocation, MapRegion, Character, GameImage } from '../../types';
import { Edit2, X, Globe, Wind, MapPin, Clock, Zap, Sun, Navigation, Compass, Footprints, AlertTriangle, Map, Users, RefreshCw, History, Lock, Check, Save, Hand, UserPlus, Trash2, Telescope, Loader2, Info } from 'lucide-react';
import { MapVisualizer } from './MapVisualizer/index';
import { Button, TextArea, Label, Input } from '../ui/Button';
import { getTerrainHeight } from '../../services/mapUtils';
import { generateRandomFlagAvatar } from '../../assets/imageLibrary';
import { AiGenWindow } from '../Windows/Pools/AiGenWindow';
import { Window } from '../ui/Window';
import { ImageAttachmentList } from '../ui/ImageAttachmentList';
import { ImageUploadModal } from '../Modals/ImageUploadModal';
import { useImageAttachments } from '../../hooks/useImageAttachments';

interface LeftPanelProps {
    state: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    openWindow: (type: WindowState['type']) => void;
    addLog: (text: string) => void;
    onResetLocation: (locationId: string, keepRegion: boolean, instructions?: string, cultureInstructions?: string, locImages?: GameImage[], charImages?: GameImage[]) => void;
    onExploreLocation?: (location: MapLocation, isManual: boolean, instructions?: string, cultureInstructions?: string, locImages?: GameImage[], charImages?: GameImage[]) => Promise<any>;
}

// ... existing AttrIcon component ...
const AttrIcon = ({ id }: { id: string }) => {
    switch(id) {
        case 'weather': return <Wind size={14} />;
        case 'world_status': return <Wind size={14} />;
        case 'time': return <Clock size={14} />;
        case 'worldTime': return <Clock size={14} />;
        case 'chaos_level': return <Zap size={14} />;
        default: return <Sun size={14} />;
    }
};

export const LeftPanel: React.FC<LeftPanelProps> = ({ state, updateState, openWindow, addLog, onResetLocation, onExploreLocation }) => {
    // ... existing state definitions ...
    const [viewingLocId, setViewingLocId] = useState<string | null>(null);
    const [isEditingGuidance, setIsEditingGuidance] = useState(false);
    const [guidanceTemp, setGuidanceTemp] = useState("");
    const [showConflictHistory, setShowConflictHistory] = useState(false);
    const [isManualMove, setIsManualMove] = useState(false);
    
    // Player Character Generation State
    const [showPlayerGen, setShowPlayerGen] = useState(false);
    const CREATE_CHAR_COST = 25;

    // Region Editing State
    const [isEditingRegion, setIsEditingRegion] = useState(false);
    const [tempRegion, setTempRegion] = useState({ name: "", description: "" });

    // Delete Confirmation State
    const [deleteConfirmLocId, setDeleteConfirmLocId] = useState<string | null>(null);

    // Exploration Local State
    const [isExploring, setIsExploring] = useState(false);
    const [showExplorationModal, setShowExplorationModal] = useState(false);
    const [explorationInput, setExplorationInput] = useState("");
    const [cultureInput, setCultureInput] = useState("");

    // Image Hooks for Exploration
    const locImagesHook = useImageAttachments();
    const charImagesHook = useImageAttachments();

    const locked = state.appSettings.lockedFeatures || ({} as any);

    // Reset Location Modal
    const [resetLocModal, setResetLocModal] = useState<{ isOpen: boolean, keepRegion: boolean } | null>(null);
    
    // Pending Reset State (Stores config while waiting for instructions in Exploration Modal)
    const [pendingReset, setPendingReset] = useState<{ locationId: string, keepRegion: boolean } | null>(null);

    useEffect(() => {
        if (!viewingLocId && state.map.activeLocationId) {
            setViewingLocId(state.map.activeLocationId);
        }
    }, [state.map.activeLocationId]);

    const handleLocationSelect = (locId: string) => {
        setViewingLocId(locId);
        // Reset editing/delete state when changing location
        setIsEditingRegion(false);
        setDeleteConfirmLocId(null);
    };

    // ... existing handleCreateLocation, handleDeleteLocation, getCost, handleExploreClick ...

    const handleCreateLocation = (x: number, y: number) => {
        const seed = state.map.chunks['0_0']?.seed || 123;
        const z = getTerrainHeight(x, y, seed);
        const newId = `loc_custom_${x}_${y}_${Date.now()}`;
        
        const newLoc: MapLocation = {
            id: newId,
            name: "标记地点",
            description: "手动标记的未知地点。",
            coordinates: { x, y, z },
            isKnown: false,
            radius: 50,
            associatedNpcIds: [],
            avatarUrl: generateRandomFlagAvatar(true) // Generate blurred avatar for manual creation
        };
        
        updateState(prev => ({
            ...prev,
            map: {
                ...prev.map,
                locations: {
                    ...prev.map.locations,
                    [newId]: newLoc
                }
            }
        }));
        setViewingLocId(newId);
        addLog(`系统: 已在坐标 (${x}, ${y}) 标记新地点。`);
    };

    const handleDeleteLocation = () => {
        if (!viewingLocId) return;

        if (deleteConfirmLocId === viewingLocId) {
            // Execute Delete
            const locName = state.map.locations[viewingLocId]?.name || "未知地点";
            
            updateState(prev => {
                const newLocations = { ...prev.map.locations };
                delete newLocations[viewingLocId];

                const newChars = { ...prev.characters };
                const newPositions = { ...prev.map.charPositions };
                const removedChars: string[] = [];

                // Remove all characters at this location
                Object.keys(prev.map.charPositions).forEach(charId => {
                    if (newPositions[charId].locationId === viewingLocId) {
                        delete newChars[charId];
                        delete newPositions[charId];
                        removedChars.push(charId);
                    }
                });

                // Clean up turn order
                let newCurrentOrder = prev.round.currentOrder.filter(id => !removedChars.includes(id));
                let newDefaultOrder = prev.round.defaultOrder.filter(id => !removedChars.includes(id));

                // Handle Active Location logic if we deleted the current spot
                let newActiveLoc = prev.map.activeLocationId;
                if (newActiveLoc === viewingLocId) {
                    // Fallback to the first available location to prevent crash
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
                        currentOrder: newCurrentOrder,
                        defaultOrder: newDefaultOrder
                    }
                };
            });

            addLog(`系统: 地点 [${locName}] 及其所有内容已被彻底抹除。`);
            setViewingLocId(null);
            setDeleteConfirmLocId(null);
        } else {
            // Request Confirmation
            setDeleteConfirmLocId(viewingLocId);
            setTimeout(() => setDeleteConfirmLocId(null), 3000);
        }
    };

    // Calculate Travel/Explore Cost
    const getCost = (loc: MapLocation | null) => {
        if (!loc || !state.map.activeLocationId) return 0;
        const activeLoc = state.map.locations[state.map.activeLocationId];
        if (!activeLoc) return 0;
        
        const dist = Math.sqrt(Math.pow(loc.coordinates.x - activeLoc.coordinates.x, 2) + Math.pow(loc.coordinates.y - activeLoc.coordinates.y, 2));
        
        // Known locations are free/cheap to move to
        if (loc.isKnown) {
             return 0; // Free move for known
        }
        
        // Unknown locations cost AP to explore
        return Math.ceil(dist / 100);
    };

    const handleExploreClick = () => {
        if (!viewingLocId) return;
        const loc = state.map.locations[viewingLocId];
        if (!loc) return;

        const cost = getCost(loc);
        if (state.round.actionPoints < cost) {
            addLog(`系统: 行动点不足！需要 ${cost} AP。`);
            return;
        }

        // Open Modal for instructions regardless of mode
        setExplorationInput("");
        setCultureInput("");
        locImagesHook.clearImages();
        charImagesHook.clearImages();
        setShowExplorationModal(true);
    };

    const executeExplore = async (locInstruction: string, cultInstruction: string) => {
        setShowExplorationModal(false);
        
        // Use attached images
        const locImages = locImagesHook.images;
        const charImages = charImagesHook.images;

        // --- BRANCH 1: RESET LOCATION EXECUTION ---
        if (pendingReset) {
            // Fix: Pass all arguments to reset location as well, to support full re-generation context
            onResetLocation(pendingReset.locationId, pendingReset.keepRegion, locInstruction, cultInstruction, locImages, charImages);
            setPendingReset(null);
            // Clear images
            locImagesHook.clearImages();
            charImagesHook.clearImages();
            return;
        }

        // --- BRANCH 2: NORMAL EXPLORATION EXECUTION ---
        if (!viewingLocId || !onExploreLocation) return;
        const loc = state.map.locations[viewingLocId];
        if (!loc) return;
        
        const cost = getCost(loc);

        // Deduct AP immediately (Pre-deduction)
        updateState(prev => ({
            ...prev,
            round: { ...prev.round, actionPoints: prev.round.actionPoints - cost }
        }));
        
        setIsExploring(true);
        
        addLog(`系统: 消耗 ${cost} AP，开始探索 [${loc.name || "未知地点"}] ...`);
        
        try {
            // Pass both text and images
            const result = await onExploreLocation(loc, isManualMove, locInstruction, cultInstruction, locImages, charImages);
            
            // Check result. If failed or interrupted (e.g. Stop Execution), refund AP
            if (!result || !result.success) {
                 updateState(prev => ({
                    ...prev,
                    round: { ...prev.round, actionPoints: prev.round.actionPoints + cost }
                }));
                addLog(`系统: 探索中断或失败，已返还 ${cost} AP。`);
            } else {
                // Success handled in useLocationGeneration
            }
        } catch (e) {
            console.error("Explore failed:", e);
            // Refund on error
            updateState(prev => ({
                ...prev,
                round: { ...prev.round, actionPoints: prev.round.actionPoints + cost }
            }));
            addLog(`系统: 探索发生错误，已返还 ${cost} AP。`);
        } finally {
            setIsExploring(false);
            locImagesHook.clearImages();
            charImagesHook.clearImages();
        }
    };

    // ... existing handleTravel, handleSaveGuidance, confirmResetLocation ...
    const handleTravel = () => {
        if (viewingLocId && viewingLocId !== state.map.activeLocationId) {
            const loc = state.map.locations[viewingLocId];
            const currentLocId = state.map.activeLocationId;
            const cost = getCost(loc);

            if (state.round.actionPoints < cost) {
                addLog(`系统: 行动点不足！需要 ${cost} AP。`);
                return;
            }

            updateState(prev => {
                const nextPos = { ...prev.map.charPositions };
                const nextChars = { ...prev.characters };
                
                // Calculate ID base
                let maxId = 0;
                (Object.values(prev.characters) as Character[]).forEach(c => {
                    c.conflicts?.forEach(x => {
                        const n = parseInt(x.id);
                        if (!isNaN(n) && n > maxId) maxId = n;
                    });
                });

                // Move Followers Logic
                (Object.values(prev.characters) as Character[]).forEach(c => {
                    if (c.isFollowing) {
                        const pos = nextPos[c.id];
                        if (pos && pos.locationId === currentLocId) {
                            nextPos[c.id] = {
                                x: loc.coordinates.x,
                                y: loc.coordinates.y,
                                locationId: viewingLocId
                            };
                            
                            // Add Conflict
                            maxId++;
                            const updatedChar = { ...nextChars[c.id] };
                            updatedChar.conflicts = [
                                ...(updatedChar.conflicts || []),
                                {
                                    id: String(maxId),
                                    desc: "刚到此地，对当地情况不熟悉",
                                    apReward: 2,
                                    solved: false
                                }
                            ];
                            nextChars[c.id] = updatedChar;
                        }
                    }
                });

                return {
                    ...prev,
                    map: { 
                        ...prev.map, 
                        activeLocationId: viewingLocId, 
                        charPositions: nextPos,
                        // Set manual flag if we are moving to unknown location and Manual Mode is checked
                        manualExplorationNext: (!loc.isKnown && isManualMove)
                    },
                    characters: nextChars,
                    round: { ...prev.round, actionPoints: prev.round.actionPoints - cost }
                };
            });
            
            addLog(`系统: 快速移动至已知地点 [${loc.name}] (0 AP)。`);
        }
    };

    const handleSaveGuidance = () => {
        updateState(prev => ({
            ...prev,
            world: { ...prev.world, worldGuidance: guidanceTemp }
        }));
        setIsEditingGuidance(false);
        addLog("系统: 世界发展指导需求已更新，AI 将尝试遵循新指令。");
    };

    const confirmResetLocation = () => {
        if (viewingLocId && resetLocModal) {
            // Set pending reset config and open instructions modal instead of executing directly
            setPendingReset({
                locationId: viewingLocId,
                keepRegion: resetLocModal.keepRegion
            });
            
            // Close Warning Modal
            setResetLocModal(null);
            
            // Clear input and Open Exploration Modal for Instructions
            setExplorationInput("");
            setCultureInput("");
            locImagesHook.clearImages();
            charImagesHook.clearImages();
            setShowExplorationModal(true);
        }
    };
    
    // ... existing viewingLocation, viewingRegion, handleSaveRegion ...
    const viewingLocation = viewingLocId ? state.map.locations[viewingLocId] : null;
    const isAtLocation = viewingLocId === state.map.activeLocationId;
    // Look up region from map state
    const viewingRegion = viewingLocation?.regionId ? state.map.regions[viewingLocation.regionId] : null;

    const handleSaveRegion = () => {
        if (!viewingRegion) return;
        updateState(prev => ({
            ...prev,
            map: {
                ...prev.map,
                regions: {
                    ...prev.map.regions,
                    [viewingRegion.id]: {
                        ...viewingRegion,
                        name: tempRegion.name,
                        description: tempRegion.description
                    }
                }
            }
        }));
        setIsEditingRegion(false);
        addLog(`系统: 区域 [${tempRegion.name}] 信息已更新。`);
    };

    // ... existing derived data for rendering ...
    // Characters at viewing location
    const charsAtLocation = viewingLocId ? (Object.values(state.characters) as Character[]).filter(c => {
        const pos = state.map.charPositions[c.id];
        return pos && pos.locationId === viewingLocId;
    }) : [];

    // Gather conflicts from CHARACTERS
    const localConflicts: { charName: string, conflict: Conflict }[] = [];
    charsAtLocation.forEach(c => {
        if (c.conflicts) {
            c.conflicts.forEach(conf => {
                if (!conf.solved) {
                    localConflicts.push({ charName: c.name, conflict: conf });
                }
            });
        }
    });

    // Gather region conflicts (characters in same region but NOT current location)
    const regionOtherConflicts: { locName: string, charName: string, conflict: Conflict }[] = [];
    if (viewingRegion) {
        (Object.values(state.characters) as Character[]).forEach(c => {
            const pos = state.map.charPositions[c.id];
            if (pos && pos.locationId && pos.locationId !== viewingLocId) {
                const loc = state.map.locations[pos.locationId];
                if (loc && loc.regionId === viewingRegion.id) {
                    if (c.conflicts) {
                        c.conflicts.forEach(conf => {
                             if (!conf.solved) {
                                 regionOtherConflicts.push({ locName: loc.name, charName: c.name, conflict: conf });
                             }
                        });
                    }
                }
            }
        });
    }

    // Gather ALL solved conflicts for history
    const solvedConflicts: { charName: string, conflict: Conflict }[] = [];
    (Object.values(state.characters) as Character[]).forEach(c => {
        if(c.conflicts) {
            c.conflicts.forEach(conf => {
                if(conf.solved) {
                    solvedConflicts.push({ charName: c.name, conflict: conf });
                }
            });
        }
    });
    solvedConflicts.sort((a,b) => (b.conflict.solvedTimestamp || 0) - (a.conflict.solvedTimestamp || 0));

    // Dynamic cost calc for display
    const travelCost = getCost(viewingLocation);
    const distance = viewingLocation && state.map.activeLocationId ? 
        Math.sqrt(Math.pow(viewingLocation.coordinates.x - state.map.locations[state.map.activeLocationId].coordinates.x, 2) + Math.pow(viewingLocation.coordinates.y - state.map.locations[state.map.activeLocationId].coordinates.y, 2)) 
        : 0;

    return (
        <div className="w-full lg:w-72 bg-app border-b lg:border-b-0 lg:border-r border-border flex flex-col z-0 shadow-lg relative h-full">
            {/* ... render content (same as before) ... */}
            {/* Conflict History Modal */}
          {showConflictHistory && (
              <Window
                  title="矛盾解决历史"
                  icon={<History size={18}/>}
                  onClose={() => setShowConflictHistory(false)}
                  maxWidth="max-w-md"
                  height="h-auto max-h-[70vh]"
                  zIndex={100}
              >
                  <div className="space-y-3">
                      {solvedConflicts.length === 0 ? (
                          <div className="text-center text-muted text-sm mt-4 italic">暂无已解决的矛盾。</div>
                      ) : (
                          solvedConflicts.map((item, idx) => (
                              <div key={idx} className="bg-surface border border-success/30 rounded p-3 opacity-80 hover:opacity-100 transition-opacity">
                                  <div className="flex justify-between text-xs mb-1">
                                      <span className="text-muted font-bold">[{item.charName}]</span>
                                      <span className="text-success-fg font-mono text-[10px]">
                                          {item.conflict.solvedTimestamp ? new Date(item.conflict.solvedTimestamp).toLocaleTimeString() : "已解决"}
                                      </span>
                                  </div>
                                  <div className="text-sm text-body line-through decoration-success-fg decoration-2">{item.conflict.desc}</div>
                                  <div className="text-[10px] text-muted mt-1 flex items-center gap-1">
                                      <Zap size={10}/> 已获得奖励: {item.conflict.apReward} AP
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </Window>
          )}

          {/* Reset Location Modal */}
          {resetLocModal && (
              <Window
                  title={<span className="flex items-center gap-2"><RefreshCw size={18} className="text-danger-fg"/> 重置/重生成地点?</span>}
                  onClose={() => setResetLocModal(null)}
                  maxWidth="max-w-sm"
                  height="h-auto"
                  zIndex={150}
                  noPadding={true}
                  footer={
                      <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => setResetLocModal(null)}>取消</Button>
                          <Button size="sm" variant="danger" onClick={confirmResetLocation}>下一步 (指令)</Button>
                      </div>
                  }
              >
                  <div className="p-6">
                      <p className="text-xs text-muted mb-4">
                          这将清除当前地点的名称和描述，并根据当前世界观重新生成。地理位置和现有角色将保留。
                      </p>
                      <label className="flex items-center gap-2 text-xs text-body mb-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={resetLocModal.keepRegion} 
                            onChange={e => setResetLocModal({...resetLocModal, keepRegion: e.target.checked})}
                            className="accent-primary"
                          />
                          保留区域信息 (Keep Region)
                      </label>
                      <div className="text-[10px] text-muted ml-5">
                          {resetLocModal.keepRegion ? "地点将适配现有区域主题。" : "将同时重新生成所属区域的设定。"}
                      </div>
                  </div>
              </Window>
          )}

          {/* Player Generation Modal (Portal) */}
          {showPlayerGen && (
              <AiGenWindow
                  state={state}
                  updateState={updateState}
                  addLog={addLog}
                  onClose={() => setShowPlayerGen(false)}
                  isPlayerMode={true}
                  cost={CREATE_CHAR_COST} // Pass cost to AiGenWindow
              />
          )}
            
            {/* Image Modals for Exploration */}
            {(locImagesHook.isModalOpen || locImagesHook.editingImage) && (
                <ImageUploadModal 
                    onClose={locImagesHook.closeModal} 
                    onConfirm={locImagesHook.addImage}
                    initialImage={locImagesHook.editingImage}
                />
            )}
            {(charImagesHook.isModalOpen || charImagesHook.editingImage) && (
                <ImageUploadModal 
                    onClose={charImagesHook.closeModal} 
                    onConfirm={charImagesHook.addImage}
                    initialImage={charImagesHook.editingImage}
                />
            )}

            {/* Exploration Config Modal (Also used for Reset Instructions) */}
            {showExplorationModal && (
                <Window
                    title={<span className="flex items-center gap-2 text-accent-teal">
                        {pendingReset ? <RefreshCw size={16} className="text-danger-fg"/> : <Telescope size={16}/>} 
                        {pendingReset ? " 重置指令 (Reset Instructions)" : " 探索指令 (Exploration)"}
                    </span>}
                    onClose={() => { 
                        setShowExplorationModal(false); 
                        setPendingReset(null); // Clear pending reset on close/cancel
                    }}
                    maxWidth="max-w-2xl" // Widen for 2 columns
                    height="h-auto max-h-[90vh]"
                    zIndex={200}
                    noPadding={true}
                    footer={
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => { 
                                setShowExplorationModal(false); 
                                setPendingReset(null); 
                            }}>取消</Button>
                            <Button onClick={() => executeExplore(explorationInput, cultureInput)} className={`${pendingReset ? 'bg-danger hover:bg-danger-hover' : 'bg-accent-teal hover:bg-teal-500'} text-white font-bold`}>
                                {pendingReset ? "确认重置" : "开始探索"}
                            </Button>
                        </div>
                    }
                >
                    <div className="p-4 flex flex-col gap-4 overflow-y-auto">
                        <div className="text-xs text-muted flex items-start gap-2 bg-surface-highlight/30 p-2 rounded">
                            <Info size={14} className={`shrink-0 mt-0.5 ${pendingReset ? 'text-danger' : 'text-accent-teal'}`}/>
                            <span>
                                {pendingReset 
                                    ? "请输入针对本次【地点重置】的具体要求。AI 将根据您的指示重新生成地点的名称、描述和氛围。"
                                    : "请分别为地点和人文环境输入要求。留空则由 AI 随机发挥。"
                                }
                            </span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Left: Location Definition */}
                            <div className="flex flex-col gap-2">
                                <Label className="text-primary font-bold">1. 地点定义 (Location)</Label>
                                <p className="text-[10px] text-muted">描述地理特征、建筑风格、环境氛围。如：“废弃的游乐园”、“古代遗迹”。</p>
                                <TextArea 
                                    className={`w-full h-32 text-sm bg-surface-light resize-none border-border p-3 ${pendingReset ? 'focus:border-danger' : 'focus:border-primary'}`}
                                    placeholder="输入地点定义..."
                                    value={explorationInput}
                                    onChange={e => setExplorationInput(e.target.value)}
                                    autoFocus
                                />
                                <div className="border border-border rounded p-1 bg-surface-light/50">
                                    <ImageAttachmentList 
                                        images={locImagesHook.images}
                                        onRemove={locImagesHook.removeImage}
                                        onAdd={locImagesHook.openModal}
                                        onImageClick={locImagesHook.editImage}
                                        maxImages={4}
                                        label="地点参考图"
                                    />
                                </div>
                            </div>

                            {/* Right: Culture/Character Definition */}
                            <div className="flex flex-col gap-2">
                                <Label className="text-accent-teal font-bold">2. 人文与居民 (Culture & Chars)</Label>
                                <p className="text-[10px] text-muted">描述当地的文化习俗、居民类型或特定NPC。如：“好客的游牧民”、“赛博朋克黑帮”。</p>
                                <TextArea 
                                    className={`w-full h-32 text-sm bg-surface-light resize-none border-border p-3 focus:border-accent-teal`}
                                    placeholder="输入人文或角色要求..."
                                    value={cultureInput}
                                    onChange={e => setCultureInput(e.target.value)}
                                />
                                <div className="border border-border rounded p-1 bg-surface-light/50">
                                    <ImageAttachmentList 
                                        images={charImagesHook.images}
                                        onRemove={charImagesHook.removeImage}
                                        onAdd={charImagesHook.openModal}
                                        onImageClick={charImagesHook.editImage}
                                        maxImages={4}
                                        label="人文/角色参考图"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </Window>
            )}

            {/* MAIN SCROLLABLE CONTAINER (Rest is same) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
              
              {/* 1. Map Visualizer (Fixed Height within scroll) */}
              <div className="w-full h-64 shrink-0 relative border-b border-border bg-black">
                  <MapVisualizer 
                    state={state} 
                    onLocationSelect={handleLocationSelect} 
                    viewingLocationId={viewingLocId}
                    onCreateLocation={handleCreateLocation}
                  />
              </div>
              
              {/* 2. Action Points & Guidance Controls */}
              <div className="bg-surface p-2 border-b border-border flex flex-col gap-2 shrink-0">
                   <div className="flex items-center justify-between bg-surface-highlight p-2 rounded border border-border">
                       <div className="flex items-center gap-2 text-accent-teal font-bold text-xs">
                           <Footprints size={14}/> 行动点 (AP)
                       </div>
                       <div className="flex items-center gap-1">
                           <input 
                               type="number" 
                               className={`w-28 bg-surface-light border border-border rounded px-1 text-right text-xs font-mono text-highlight outline-none ${locked.actionPoints ? 'opacity-50 cursor-not-allowed' : 'focus:border-primary'}`}
                               value={state.round.actionPoints}
                               readOnly={locked.actionPoints}
                               onChange={(e) => {
                                   if (locked.actionPoints) return;
                                   const val = parseInt(e.target.value) || 0;
                                   updateState(s => ({...s, round: {...s.round, actionPoints: val}}));
                               }}
                           />
                       </div>
                   </div>

                   <Button 
                        size="sm" 
                        variant="ghost"
                        className={`w-full flex justify-between items-center text-xs text-muted hover:text-primary hover:bg-surface-highlight py-1 h-auto ${state.round.actionPoints < CREATE_CHAR_COST ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => {
                            if (state.round.actionPoints >= CREATE_CHAR_COST) setShowPlayerGen(true);
                        }}
                        disabled={state.round.actionPoints < CREATE_CHAR_COST}
                        title={`消耗 ${CREATE_CHAR_COST} AP 创建一个新的玩家角色`}
                   >
                        <span className="flex items-center gap-2"><UserPlus size={12}/> 创建角色</span>
                        {/* Cost text -> Dopamine */}
                        <span className="text-dopamine font-mono text-[10px]">-{CREATE_CHAR_COST} AP</span>
                   </Button>

                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className={`w-full flex justify-between items-center text-xs text-muted hover:text-primary hover:bg-surface-highlight py-1 h-auto ${locked.directorInstructions ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => { 
                        if (locked.directorInstructions) return;
                        setGuidanceTemp(state.world.worldGuidance || ""); 
                        setIsEditingGuidance(true); 
                    }}
                    title={locked.directorInstructions ? "已锁定" : "点击编辑世界生成指导"}
                  >
                      <span className="flex items-center gap-2"><Compass size={12}/> 导演指令</span>
                      {locked.directorInstructions ? <Lock size={10}/> : <Edit2 size={10} />}
                  </Button>
              </div>

              {/* 3. Location & Region Details Panel */}
              {viewingLocation && (
                  <div className="p-4 border-b border-border bg-surface/30 shrink-0">
                      
                      {/* Action Buttons: Explore or Move - MOVED TO TOP */}
                      {!isAtLocation && (
                          <div className="flex flex-col gap-1 mb-4">
                              <div className="flex justify-between text-[10px] text-muted mb-1">
                                   <span>距离: {distance.toFixed(0)}m</span>
                                   <span className={state.round.actionPoints >= travelCost ? "text-success-fg" : "text-danger-fg"}>消耗: {travelCost} AP</span>
                              </div>
                              <div className="flex gap-2">
                                  {!viewingLocation.isKnown && (
                                      <label className="flex items-center gap-1 text-xs text-muted cursor-pointer px-2 py-1 rounded bg-surface border border-border hover:bg-surface-highlight" title="手动模式: 跳过AI生成，手动填写地名和描述">
                                          <input 
                                              type="checkbox" 
                                              checked={isManualMove} 
                                              onChange={e => setIsManualMove(e.target.checked)}
                                              className="accent-primary"
                                          />
                                          手动
                                      </label>
                                  )}

                                  {/* DYNAMIC BUTTON: EXPLORE or MOVE */}
                                  {viewingLocation.isKnown ? (
                                      <Button 
                                        size="sm" 
                                        className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white" 
                                        onClick={handleTravel}
                                        // Known location travel is usually free/cheap, so mostly enabled.
                                        title="移动至已知地点"
                                      >
                                          <Navigation size={14}/> 移动至此
                                      </Button>
                                  ) : (
                                      <Button 
                                        size="sm" 
                                        className="flex-1 flex items-center justify-center gap-2 bg-accent-teal hover:bg-teal-500 text-white" 
                                        onClick={handleExploreClick} // Changed Handler
                                        disabled={state.round.actionPoints < travelCost || isExploring}
                                        title={state.round.actionPoints < travelCost ? "AP不足" : "探索地点详情"}
                                      >
                                          {isExploring ? <Loader2 size={14} className="animate-spin"/> : <Telescope size={14}/>} 
                                          {isExploring ? "探索中..." : (state.round.actionPoints < travelCost ? "AP不足" : "探索")}
                                      </Button>
                                  )}
                                  
                                  {/* DELETE BUTTON -> Primary */}
                                  <Button
                                      size="sm"
                                      variant={deleteConfirmLocId === viewingLocation.id ? "danger" : "secondary"}
                                      className="w-16 flex items-center justify-center shrink-0 border-border"
                                      onClick={handleDeleteLocation}
                                      title={deleteConfirmLocId === viewingLocation.id ? "确认删除?" : "删除地点 (含角色)"}
                                  >
                                      {deleteConfirmLocId === viewingLocation.id ? <span className="text-[10px] font-bold">确认?</span> : <Trash2 size={14} className="text-primary hover:text-primary-fg"/>}
                                  </Button>
                              </div>
                          </div>
                      )}
                      
                      {/* Separate Delete button row for CURRENT LOCATION view (optional but consistent) - MOVED TO TOP */}
                      {isAtLocation && !locked.locationEditor && (
                          <div className="flex justify-end mb-4">
                               <Button
                                  size="sm"
                                  variant={deleteConfirmLocId === viewingLocation.id ? "danger" : "secondary"}
                                  className="w-auto px-3 flex items-center justify-center gap-2 text-xs border-border bg-surface"
                                  onClick={handleDeleteLocation}
                                  title="删除当前地点 (危险操作)"
                               >
                                  {deleteConfirmLocId === viewingLocation.id ? "确认删除当前地点?" : <><Trash2 size={12} className="text-primary"/> <span className="text-primary">删除此地</span></>}
                               </Button>
                          </div>
                      )}

                      {/* Region Section */}
                      <div className="mb-3 pb-3 border-b border-border/50">
                          <div className="flex justify-between items-start mb-1">
                              <h3 className="text-[10px] font-bold text-primary mb-1 flex items-center gap-1 uppercase tracking-wider">
                                  <Map size={10}/> 所属区域 (Region)
                              </h3>
                          </div>
                          
                          {viewingRegion ? (
                            isEditingRegion ? (
                                <div className="flex flex-col gap-2 bg-surface p-2 rounded border border-border mt-1">
                                    <Input 
                                        value={tempRegion.name} 
                                        onChange={e => setTempRegion({...tempRegion, name: e.target.value})}
                                        className="text-xs h-7"
                                        placeholder="区域名称"
                                    />
                                    <TextArea 
                                        value={tempRegion.description}
                                        onChange={e => setTempRegion({...tempRegion, description: e.target.value})}
                                        className="text-xs min-h-[100px] leading-relaxed resize-none"
                                        placeholder="区域描述..."
                                    />
                                    <div className="flex justify-end gap-2 mt-1">
                                        <button 
                                            onClick={() => setIsEditingRegion(false)} 
                                            className="text-[10px] flex items-center gap-1 px-2 py-1 rounded bg-secondary text-secondary-fg hover:bg-secondary-hover"
                                        >
                                            <X size={10}/> 取消
                                        </button>
                                        <button 
                                            onClick={handleSaveRegion} 
                                            className="text-[10px] flex items-center gap-1 px-2 py-1 rounded bg-success-base/50 text-success-fg hover:bg-success-base/80 border border-success-base"
                                        >
                                            <Save size={10}/> 保存
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="group relative pr-6">
                                    <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => {
                                                if (locked.locationEditor) return;
                                                setTempRegion({ name: viewingRegion.name, description: viewingRegion.description });
                                                setIsEditingRegion(true);
                                            }}
                                            className={`p-1 rounded ${locked.locationEditor ? 'text-muted cursor-not-allowed' : 'text-muted hover:text-primary hover:bg-surface-highlight'}`}
                                            title={locked.locationEditor ? "区域编辑已锁定" : "编辑区域信息"}
                                        >
                                            {locked.locationEditor ? <Lock size={12}/> : <Edit2 size={12}/>}
                                        </button>
                                    </div>
                                    <p className="text-xs font-bold text-body mb-1">{viewingRegion.name}</p>
                                    <p className="text-[9px] text-muted leading-tight">{viewingRegion.description}</p>
                                </div>
                            )
                          ) : (
                            <p className="text-[9px] text-faint italic">未知 / 未分配区域</p>
                          )}
                      </div>

                      <div className="flex items-start justify-between mb-2">
                           <h3 className="text-xs font-bold text-muted flex items-center gap-2">
                              <MapPin size={12}/> 
                              {viewingLocation.isKnown ? viewingLocation.name : "未知地点"}
                              {isAtLocation && <span className="text-[9px] bg-danger/50 text-danger-fg px-1.5 rounded">当前位置</span>}
                           </h3>
                           {viewingLocation.isKnown && !locked.locationEditor && (
                               <div className="flex gap-1">
                                   <button 
                                     onClick={() => openWindow('world_composition' as any)}
                                     className="text-faint hover:text-body p-1 rounded hover:bg-surface-highlight transition-colors"
                                     title="打开详细列表"
                                   >
                                       <Globe size={12}/>
                                   </button>
                                   <button 
                                     onClick={() => setResetLocModal({ isOpen: true, keepRegion: true })}
                                     className="text-faint hover:text-body p-1 rounded hover:bg-surface-highlight transition-colors"
                                     title="重置/重新生成地点信息"
                                   >
                                       <RefreshCw size={12}/>
                                   </button>
                               </div>
                           )}
                      </div>
                      
                      <p className="text-[10px] text-muted mb-3 italic leading-relaxed">
                          {viewingLocation.isKnown ? viewingLocation.description : "遥远的未知之地。点击「探索」以探知详情。"}
                      </p>
                      <div className="flex justify-between items-center text-[10px] text-muted font-mono mb-2 px-1">
                          <span>X: {viewingLocation.coordinates.x.toFixed(0)}</span>
                          <span>Y: {viewingLocation.coordinates.y.toFixed(0)}</span>
                          <span>Z: {viewingLocation.coordinates.z.toFixed(0)}m</span>
                      </div>

                      {/* Character List */}
                      <div className="mb-3">
                           <h3 className="text-[10px] font-bold text-accent-teal uppercase mb-1 flex items-center gap-1">
                              <Users size={10}/> 区域角色 ({(charsAtLocation || []).length})
                           </h3>
                           {(charsAtLocation || []).length > 0 ? (
                               <div className="flex flex-wrap gap-1">
                                   {(charsAtLocation || []).map(c => (
                                       <span key={c.id} className="text-[9px] bg-secondary text-secondary-fg px-1.5 py-0.5 rounded border border-border">
                                           {c.name}
                                       </span>
                                   ))}
                               </div>
                           ) : (
                               <span className="text-[9px] text-faint italic">空无一人</span>
                           )}
                      </div>

                      {/* Conflicts Display */}
                      {viewingLocation.isKnown && (
                          <div className="mt-3 mb-3 space-y-2">
                              <div className="flex justify-between items-center">
                                  {/* Active Conflicts Header -> Endorphin */}
                                  <h3 className="text-[10px] font-bold text-endorphin uppercase flex items-center gap-1">
                                      <AlertTriangle size={10} /> 活跃矛盾 (Active)
                                  </h3>
                                  <button onClick={() => setShowConflictHistory(true)} className="text-[9px] text-muted hover:text-body flex items-center gap-1 bg-surface px-2 py-0.5 rounded border border-border">
                                      <History size={10}/> 历史
                                  </button>
                              </div>

                              {/* Local Conflicts */}
                              {localConflicts.length > 0 ? (
                                  <div className="bg-orange-900/10 border border-orange-900/30 rounded p-2">
                                      <div className="space-y-1">
                                          {localConflicts.map((item, idx) => (
                                              <div key={idx} className="text-[10px] flex justify-between gap-2 text-body">
                                                  <span className="whitespace-pre-wrap break-words">
                                                      <span className="text-muted">[{item.charName}]</span> {item.conflict.desc}
                                                  </span>
                                                  <span className="font-mono text-orange-300 whitespace-nowrap">+{item.conflict.apReward}</span>
                                              </div>
                                          ))}
                                      </div>
                                  </div>
                              ) : (
                                  <div className="text-[9px] text-faint italic px-2">无本地角色矛盾</div>
                              )}
                              
                              {/* Region Conflicts */}
                              {regionOtherConflicts.length > 0 && (
                                  <div className="bg-surface-highlight/30 border border-border/50 rounded p-2 opacity-80 hover:opacity-100 transition-opacity">
                                      <div className="text-[10px] font-bold text-muted uppercase mb-1 flex items-center gap-1">
                                          <Globe size={10} /> 区域其他矛盾 (Region)
                                      </div>
                                      <div className="space-y-1">
                                          {regionOtherConflicts.slice(0, 3).map((item, i) => (
                                              <div key={i} className="text-[9px] text-muted flex justify-between gap-2">
                                                  <span className="whitespace-pre-wrap break-words">[{item.locName} - {item.charName}] {item.conflict.desc}</span>
                                                  <span className="font-mono text-faint">+{item.conflict.apReward}</span>
                                              </div>
                                          ))}
                                          {regionOtherConflicts.length > 3 && <div className="text-[8px] text-faint">...以及更多 ({regionOtherConflicts.length - 3})</div>}
                                      </div>
                                  </div>
                              )}
                          </div>
                      )}
                  </div>
              )}

              {/* 4. World Status Panel */}
              <div className="p-4 shrink-0">
                  <div className="flex justify-between items-center mb-3">
                    {/* World Status Header -> Primary */}
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                        <Globe size={12}/> 世界状态
                    </h3>
                    <button 
                        onClick={() => !locked.worldState && openWindow('world')} 
                        disabled={locked.worldState}
                        className={`text-muted hover:text-body ${locked.worldState ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {locked.worldState ? <Lock size={12}/> : <Edit2 size={12}/>}
                    </button>
                  </div>
                  <div className="space-y-2">
                      {(Object.values(state.world.attributes) as GameAttribute[]).map(attr => (
                          <div key={attr.id} className="flex justify-between items-center bg-surface p-2.5 rounded border border-border group hover:border-highlight transition-colors">
                              <div className="flex items-center gap-2 text-muted text-xs font-medium">
                                  <AttrIcon id={attr.id} /> {attr.name}
                              </div>
                              <span className="font-mono text-xs text-primary px-1.5 py-0.5">{attr.value}</span>
                          </div>
                      ))}
                  </div>
              </div>
              
              {/* Spacer for bottom clearance on mobile if needed */}
              <div className="h-10 lg:h-0 shrink-0"></div>
          </div>

          {/* Director Instructions Modal Window */}
          {isEditingGuidance && (
              <Window
                  title={<span className="flex items-center gap-2"><Compass size={20}/> 世界导演指令 / 生成设定</span>}
                  onClose={() => setIsEditingGuidance(false)}
                  maxWidth="max-w-5xl"
                  height="h-[80vh]"
                  zIndex={200}
                  noPadding={true}
                  footer={
                      <div className="flex justify-end gap-2">
                          <Button variant="secondary" onClick={() => setIsEditingGuidance(false)}>取消</Button>
                          <Button onClick={handleSaveGuidance}>保存设定</Button>
                      </div>
                  }
              >
                  <TextArea
                      className="w-full h-full text-sm font-mono leading-relaxed resize-none bg-surface/30 border-none focus:ring-0 p-4"
                      placeholder="例如: 这是一个赛博朋克世界，科技发达但社会秩序混乱。所有的NPC都应该带有某种机械改造特征..."
                      value={guidanceTemp}
                      onChange={e => setGuidanceTemp(e.target.value)}
                  />
              </Window>
          )}
      </div>
    );
};
