
import React, { useState } from 'react';
import { GameState, PrizePool, PrizeItem, MapLocation } from '../../types';
import { Button, Input, TextArea, Label } from '../ui/Button';
import { X, Plus, Trash2, Gift, Edit, Save, FileText, CheckCircle, AlertTriangle, ArrowRight, EyeOff, Eye, MapPin, CheckSquare, Square, ChevronUp, ChevronDown } from 'lucide-react';
import { Window } from '../ui/Window';

interface PrizePoolWindowProps {
    winId: number;
    state: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    closeWindow: (id: number) => void;
    addLog: (text: string) => void;
}

export const PrizePoolWindow: React.FC<PrizePoolWindowProps> = ({ winId, state, updateState, closeWindow, addLog }) => {
    const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
    const [isBulkEditing, setIsBulkEditing] = useState(false);
    const [bulkText, setBulkText] = useState("");
    
    // New State for In-UI Preview
    const [previewItems, setPreviewItems] = useState<PrizeItem[] | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const pools = (Object.values(state.prizePools || {}) as PrizePool[]);
    const activePool = selectedPoolId && state.prizePools ? state.prizePools[selectedPoolId] : null;
    
    // Get Known Locations for Selector
    const knownLocations = (Object.values(state.map.locations) as MapLocation[]).filter(l => l.isKnown);

    const handleCreatePool = () => {
        const newId = `pool_${Date.now()}`;
        const activeLocId = state.map.activeLocationId;
        
        const newPool: PrizePool = {
            id: newId,
            name: "新奖池",
            description: "这是一个新的奖池。",
            locationIds: activeLocId ? [activeLocId] : [],
            items: [],
            minDraws: 1,
            maxDraws: 1
        };
        updateState(prev => ({
            ...prev,
            prizePools: { ...(prev.prizePools || {}), [newId]: newPool }
        }));
        setSelectedPoolId(newId);
    };

    const handleDeletePool = (id: string) => {
        if (deleteConfirmId === id) {
            updateState(prev => {
                const next = { ...(prev.prizePools || {}) };
                delete next[id];
                return { ...prev, prizePools: next };
            });
            if (selectedPoolId === id) setSelectedPoolId(null);
            setDeleteConfirmId(null);
        } else {
            setDeleteConfirmId(id);
            setTimeout(() => setDeleteConfirmId(prev => prev === id ? null : prev), 3000);
        }
    };

    const handleUpdatePool = (updates: Partial<PrizePool>) => {
        if (!selectedPoolId) return;
        updateState(prev => {
            const currentPool = prev.prizePools[selectedPoolId];
            if (!currentPool) return prev;
            
            return {
                ...prev,
                prizePools: {
                    ...prev.prizePools,
                    [selectedPoolId]: { ...currentPool, ...updates }
                }
            };
        });
    };

    // Location Management Helpers
    const toggleLocation = (locId: string) => {
        if (!activePool) return;
        const currentLocs = activePool.locationIds || [];
        const newLocs = currentLocs.includes(locId) 
            ? currentLocs.filter(id => id !== locId)
            : [...currentLocs, locId];
        handleUpdatePool({ locationIds: newLocs });
    };

    const selectAllLocations = () => {
        if (!activePool) return;
        handleUpdatePool({ locationIds: knownLocations.map(l => l.id) });
    };

    const clearLocations = () => {
        if (!activePool) return;
        handleUpdatePool({ locationIds: [] });
    };

    const handleAddItem = () => {
        if (!activePool) return;
        const newItem: PrizeItem = {
            id: `pitem_${Date.now()}`,
            name: "新物品",
            description: "物品描述",
            weight: 10,
            isHidden: false
        };
        handleUpdatePool({ items: [...activePool.items, newItem] });
    };

    const handleUpdateItem = (idx: number, updates: Partial<PrizeItem>) => {
        if (!activePool) return;
        const newItems = [...activePool.items];
        newItems[idx] = { ...newItems[idx], ...updates };
        handleUpdatePool({ items: newItems });
    };

    const handleDeleteItem = (idx: number) => {
        if (!activePool) return;
        const newItems = activePool.items.filter((_, i) => i !== idx);
        handleUpdatePool({ items: newItems });
    };

    const startBulkEdit = () => {
        if (!activePool) return;
        // Export format: Name Description IsHidden(0/1)
        const text = activePool.items.map(i => `${i.name} ${i.description} ${i.isHidden ? 1 : 0}`).join('\n');
        setBulkText(text);
        setPreviewItems(null); 
        setParseError(null);
        setIsBulkEditing(true);
    };

    const parseBulkText = () => {
        setParseError(null);
        setPreviewItems(null);

        const rawLines = bulkText.split('\n');
        const lines = rawLines.map(l => l.trim()).filter(l => l.length > 0);
        
        if (lines.length === 0) {
            setParseError("内容为空，无法解析。");
            return;
        }

        // Dynamic Default Description based on Pool Name
        const defaultDesc = activePool 
            ? `来自${activePool.name}的奖池物品` 
            : "无描述";

        const newItems: PrizeItem[] = [];

        try {
            lines.forEach((line, index) => {
                let name = "";
                let desc = ""; // Start empty to detect if provided
                let isHidden = false;
                
                // Check last char for hidden flag
                const lastChar = line.slice(-1);
                let processLine = line;
                if (lastChar === '0' || lastChar === '1') {
                    isHidden = lastChar === '1';
                    processLine = line.slice(0, -1).trim();
                }

                // Strategy 1: Colon Separator (: or ：)
                let sepIndex = processLine.indexOf(':');
                if (sepIndex === -1) sepIndex = processLine.indexOf('：');
                
                if (sepIndex !== -1) {
                    name = processLine.substring(0, sepIndex).trim();
                    desc = processLine.substring(sepIndex + 1).trim();
                } else {
                    // Strategy 2: First Whitespace
                    const spaceMatch = processLine.match(/\s+/);
                    if (spaceMatch && spaceMatch.index !== undefined) {
                        name = processLine.substring(0, spaceMatch.index).trim();
                        desc = processLine.substring(spaceMatch.index + spaceMatch[0].length).trim();
                    } else {
                        // Strategy 3: No separator (Single word is Name)
                        name = processLine.trim();
                        desc = ""; // Explicitly empty
                    }
                }
                
                if (!name) name = "未命名";
                // Apply dynamic default if desc is missing
                if (!desc) desc = defaultDesc;

                newItems.push({
                    id: `pitem_bulk_${Date.now()}_${index}`,
                    name: name,
                    description: desc,
                    weight: 10,
                    isHidden: isHidden
                });
            });

            if (newItems.length === 0) {
                setParseError("未能解析出任何有效物品。");
            } else {
                setPreviewItems(newItems);
            }
        } catch (e: any) {
            setParseError("解析过程发生错误: " + e.message);
        }
    };

    const applyBulkChanges = () => {
        if (activePool && previewItems && previewItems.length > 0) {
            handleUpdatePool({ items: previewItems });
            addLog(`系统: 奖池 [${activePool.name}] 已更新 (${previewItems.length} 项)。`);
            setIsBulkEditing(false);
            setPreviewItems(null);
        }
    };

    return (
        <Window
            title="奖池管理 (Prize Pools)"
            icon={<Gift size={18} className="text-accent-pink"/>}
            onClose={() => closeWindow(winId)}
            maxWidth="max-w-6xl"
            height="h-[95vh]"
            disableContentScroll={true}
            noPadding={true}
        >
                <div className="flex flex-col md:flex-row flex-1 min-h-0 h-full overflow-hidden">
                    {/* Left Sidebar: Pool List */}
                    <div className={`
                        border-r-0 border-b md:border-b-0 md:border-r border-border flex flex-col shrink-0
                        w-full md:w-64 transition-all duration-300
                        ${selectedPoolId ? 'h-32 md:h-full' : 'flex-1 md:h-full'}
                        bg-surface/50
                    `}>
                        <div className="p-2 border-b border-border shrink-0">
                             <Button className="w-full flex items-center justify-center gap-2 text-xs md:text-sm h-8 md:h-10" onClick={handleCreatePool}>
                                 <Plus size={14}/> 新建奖池
                             </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                            {pools.length === 0 && (
                                <div className="text-muted text-xs text-center py-4">暂无奖池</div>
                            )}
                            {pools.map(pool => (
                                <div 
                                    key={pool.id} 
                                    onClick={() => { setSelectedPoolId(pool.id); setIsBulkEditing(false); }}
                                    className={`p-2 rounded cursor-pointer flex justify-between items-center group ${selectedPoolId === pool.id ? 'bg-pink-900/30 text-pink-200 border border-pink-900/50' : 'text-muted hover:bg-surface-highlight hover:text-body'}`}
                                >
                                    <div className="truncate font-bold text-xs md:text-sm">{pool.name}</div>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeletePool(pool.id); }} 
                                        className={`transition-all p-1 rounded ${deleteConfirmId === pool.id ? 'bg-red-600 text-white opacity-100 scale-110 px-2' : 'text-muted hover:text-danger-fg opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}
                                        title={deleteConfirmId === pool.id ? "点击确认删除" : "删除"}
                                    >
                                        {deleteConfirmId === pool.id ? <span className="text-[10px] font-bold">确认?</span> : <Trash2 size={14}/>}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Content: Pool Editor */}
                    <div className="flex-1 bg-surface-light flex flex-col min-w-0 min-h-0 overflow-hidden">
                        {activePool ? (
                            <div className="flex flex-col h-full overflow-hidden">
                                {/* Top Panel: Info & Locations */}
                                {!isBulkEditing && (
                                    <div className="grid grid-cols-1 lg:grid-cols-3 border-b border-border shrink-0 max-h-[40vh] overflow-y-auto md:overflow-visible">
                                        {/* Basic Info */}
                                        <div className="p-3 flex flex-col gap-3 border-r-0 lg:border-r border-b lg:border-b-0 border-border bg-surface">
                                            <div>
                                                <Label>奖池名称</Label>
                                                <Input className="h-8" value={activePool.name} onChange={e => handleUpdatePool({ name: e.target.value })} />
                                            </div>
                                            <div className="flex gap-4">
                                                <div>
                                                    <Label>最小抽取数</Label>
                                                    <Input type="number" className="h-8 w-24" value={activePool.minDraws || 1} onChange={e => handleUpdatePool({ minDraws: (parseInt(e.target.value) || 0) })} />
                                                </div>
                                                <div>
                                                    <Label>最大抽取数</Label>
                                                    <Input type="number" className="h-8 w-24" value={activePool.maxDraws || 1} onChange={e => handleUpdatePool({ maxDraws: (parseInt(e.target.value) || 0) })} />
                                                </div>
                                            </div>
                                            <div>
                                                <Label>描述 (AI 可见)</Label>
                                                <TextArea className="resize-none text-xs h-16" value={activePool.description} onChange={e => handleUpdatePool({ description: e.target.value })} />
                                            </div>
                                        </div>

                                        {/* Location Selector */}
                                        <div className="col-span-1 lg:col-span-2 p-3 flex flex-col bg-surface-highlight/20">
                                            <div className="flex justify-between items-center mb-2">
                                                <Label className="flex items-center gap-2 text-primary"><MapPin size={14}/> 分布地点 (Locations)</Label>
                                                <div className="flex gap-2">
                                                    <button onClick={selectAllLocations} className="text-[10px] text-muted hover:text-highlight underline">全选</button>
                                                    <button onClick={clearLocations} className="text-[10px] text-muted hover:text-highlight underline">清空</button>
                                                </div>
                                            </div>
                                            <div className="flex-1 bg-surface-light border border-border rounded p-2 max-h-24 overflow-y-auto custom-scrollbar">
                                                <div className="flex flex-wrap gap-2">
                                                    {knownLocations.length === 0 && <div className="text-muted text-xs italic w-full text-center py-2">暂无已知地点</div>}
                                                    {knownLocations.map(loc => {
                                                        const isSelected = (activePool.locationIds || []).includes(loc.id);
                                                        return (
                                                            <button
                                                                key={loc.id}
                                                                onClick={() => toggleLocation(loc.id)}
                                                                className={`
                                                                    text-[10px] px-2 py-1 rounded border transition-all flex items-center gap-1
                                                                    ${isSelected 
                                                                        ? 'bg-primary border-primary text-primary-fg shadow-sm' 
                                                                        : 'bg-surface border-border text-muted hover:border-highlight hover:text-body'}
                                                                `}
                                                            >
                                                                {loc.name}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-muted mt-1 leading-tight">
                                                只有位于选中地点的角色才能与此奖池互动。
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Items Toolbar */}
                                <div className="p-2 border-b border-border bg-surface-highlight shrink-0 flex justify-between items-center">
                                    <span className="text-xs font-bold text-muted px-2">
                                        {isBulkEditing ? "批量编辑模式" : `物品 (${activePool.items.length})`}
                                    </span>
                                    <div className="flex gap-2">
                                        {!isBulkEditing ? (
                                            <>
                                                <Button size="sm" variant="secondary" onClick={startBulkEdit} title="批量编辑 (文本格式)" className="h-7 text-xs px-2">
                                                    <FileText size={12} className="mr-1"/> 批量
                                                </Button>
                                                <Button size="sm" onClick={handleAddItem} className="h-7 text-xs px-2">
                                                    <Plus size={12} className="mr-1"/> 添加
                                                </Button>
                                            </>
                                        ) : (
                                            <Button size="sm" variant="ghost" onClick={() => setIsBulkEditing(false)} className="h-7 text-xs">
                                                返回列表
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Items List or Bulk Editor */}
                                <div className="flex-1 overflow-y-auto p-2 md:p-4 bg-surface-light custom-scrollbar min-h-0">
                                    {isBulkEditing ? (
                                        <div className="h-full flex flex-col gap-4">
                                            <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
                                                {/* Left: Input Area */}
                                                <div className="flex-1 flex flex-col gap-2 min-h-[200px]">
                                                    <Label className="text-primary">输入文本 (每行一项)</Label>
                                                    <p className="text-[10px] text-muted">格式: 物品名称 物品描述 [0或1]<br/>0=公开, 1=隐藏。不写默认为公开。支持空格或冒号分隔。</p>
                                                    <TextArea 
                                                        className="flex-1 font-mono text-xs md:text-sm bg-surface border-border p-2 resize-none" 
                                                        value={bulkText} 
                                                        onChange={e => setBulkText(e.target.value)}
                                                        placeholder={`示例:\n宝剑: 锋利的武器 0\n神秘信封 只有持有者能看到内容 1`}
                                                    />
                                                    <Button onClick={parseBulkText} variant="secondary" className="w-full h-8 text-xs">
                                                        <ArrowRight size={14} className="mr-2"/> 解析并预览
                                                    </Button>
                                                </div>

                                                {/* Right: Preview Area */}
                                                <div className="flex-1 flex flex-col gap-2 border-t md:border-t-0 md:border-l border-border pt-2 md:pt-0 md:pl-4 min-h-[200px]">
                                                    <Label className={parseError ? "text-danger-fg" : "text-success-fg"}>
                                                        {parseError ? "解析错误" : "预览结果"}
                                                    </Label>
                                                    
                                                    <div className="flex-1 bg-surface border border-border rounded p-2 overflow-y-auto text-xs space-y-1 custom-scrollbar">
                                                        {parseError && (
                                                            <div className="text-danger-fg flex items-center gap-2">
                                                                <AlertTriangle size={14}/> {parseError}
                                                            </div>
                                                        )}
                                                        {!parseError && !previewItems && (
                                                            <div className="text-muted italic text-center mt-10">
                                                                请在左侧输入内容并点击“解析”。
                                                            </div>
                                                        )}
                                                        {previewItems && previewItems.map((item, idx) => (
                                                            <div key={idx} className="flex gap-2 p-1 border-b border-border/50 last:border-0 items-center">
                                                                <span className="text-muted font-mono w-6">{idx+1}.</span>
                                                                <span className="text-primary font-bold whitespace-nowrap max-w-[80px] truncate">{item.name}</span>
                                                                <span className="text-muted truncate flex-1 text-[10px]">- {item.description}</span>
                                                                {item.isHidden && <EyeOff size={12} className="text-danger-fg shrink-0"/>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex justify-end gap-2 pt-2 border-t border-border shrink-0">
                                                <Button variant="secondary" onClick={() => setIsBulkEditing(false)} className="h-8 text-xs">取消</Button>
                                                <Button 
                                                    onClick={applyBulkChanges} 
                                                    disabled={!previewItems || previewItems.length === 0}
                                                    className={!previewItems ? "opacity-50 cursor-not-allowed h-8 text-xs" : "bg-success-base hover:bg-success-base/80 h-8 text-xs"}
                                                >
                                                    <CheckCircle size={14} className="mr-2"/> 确认保存
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 pb-4">
                                            {activePool.items.length === 0 && <div className="text-center text-muted italic mt-10 text-sm">暂无物品，请添加。</div>}
                                            {activePool.items.map((item, idx) => (
                                                <div key={item.id} className="flex items-start gap-2 bg-surface p-2 rounded border border-border group hover:border-highlight transition-colors">
                                                    <div className="w-10 pt-1 text-center border-r border-border pr-1 shrink-0">
                                                        <span className="text-[8px] text-muted block mb-0.5 uppercase">Wt.</span>
                                                        <input 
                                                            type="number" 
                                                            className="w-full bg-transparent text-center text-xs font-bold text-accent-pink outline-none border-b border-transparent focus:border-accent-pink hover:border-border p-0"
                                                            value={item.weight}
                                                            onChange={e => handleUpdateItem(idx, { weight: parseInt(e.target.value) || 0 })}
                                                        />
                                                    </div>
                                                    <div className="flex-1 grid grid-cols-1 gap-1 pl-1 min-w-0">
                                                        <div className="flex gap-2">
                                                            <Input 
                                                                className="h-7 text-xs font-bold border-transparent focus:border-primary hover:bg-surface-highlight flex-1 min-w-0" 
                                                                value={item.name} 
                                                                onChange={e => handleUpdateItem(idx, { name: e.target.value })}
                                                                placeholder="物品名称"
                                                            />
                                                            <button 
                                                                className={`p-1.5 rounded shrink-0 ${item.isHidden ? 'text-danger-fg bg-danger/10' : 'text-muted hover:bg-surface-highlight'}`}
                                                                onClick={() => handleUpdateItem(idx, { isHidden: !item.isHidden })}
                                                                title={item.isHidden ? "隐藏 (私有)" : "公开"}
                                                            >
                                                                {item.isHidden ? <EyeOff size={14}/> : <Eye size={14}/>}
                                                            </button>
                                                        </div>
                                                        <Input 
                                                            className="h-7 text-xs text-muted bg-transparent border-transparent focus:border-primary hover:bg-surface-highlight w-full" 
                                                            value={item.description} 
                                                            onChange={e => handleUpdateItem(idx, { description: e.target.value })}
                                                            placeholder="描述..."
                                                        />
                                                    </div>
                                                    <button onClick={() => handleDeleteItem(idx)} className="p-2 text-muted hover:text-danger-fg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                                                        <Trash2 size={16}/>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-muted p-4 text-center">
                                <Gift size={48} className="mb-4 opacity-20"/>
                                <p className="text-sm">请在左侧(或上方)选择或创建一个奖池以开始编辑。</p>
                            </div>
                        )}
                    </div>
                </div>
        </Window>
    );
};
