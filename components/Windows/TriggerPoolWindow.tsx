
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { GameState, Trigger, TriggerCondition, ConditionType, Character, MapLocation, TriggerPhase } from '../../types';
import { Button, Input, TextArea, Label } from '../ui/Button';
import { X, Plus, Trash2, Edit2, Save, Activity, ArrowRight, Filter, Zap, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Hash, Clock } from 'lucide-react';
import { WorldTimePicker } from '../ui/WorldTimePicker';
import { Window } from '../ui/Window';

interface TriggerPoolWindowProps {
    winId: number;
    state: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    closeWindow: (id: number) => void;
    addLog: (text: string) => void;
}

const CONDITION_TYPES: { value: ConditionType, label: string }[] = [
    { value: 'char_attr', label: '角色属性 (Character Attribute)' },
    { value: 'char_card', label: '角色卡牌 (Character Card)' },
    { value: 'world_time', label: '世界时间 (World Time)' },
    { value: 'world_attr', label: '世界属性 (World Attribute)' },
    { value: 'char_name', label: '角色名存在 (Character Name Exists)' },
    { value: 'loc_name', label: '地点名存在 (Location Name Exists)' },
    { value: 'region_name', label: '区域名存在 (Region Name Exists)' },
    { value: 'history', label: '近期故事检查 (History Check)' },
];

const COMPARATORS = ['>', '>=', '=', '!=', '<', '<='];
const STR_COMPARATORS = [
    { value: 'exists', label: '存在' },
    { value: 'not_exists', label: '不存在' },
    { value: 'contains', label: '包含' },
    { value: 'exact', label: '完全匹配' },
];

const PHASES: TriggerPhase[] = [
    'determineCharacterAction',
    'determineCharacterReaction',
    'determineTurnOrder',
    'checkCondition',
    'checkConditionsBatch',
    'generateCharacter',
    'generateLocationDetails',
    'analyzeSettlement',
    'analyzeTimePassage'
];

export const TriggerPoolWindow: React.FC<TriggerPoolWindowProps> = ({ winId, state, updateState, closeWindow, addLog }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    
    // Time Picker State
    const [timePickerTarget, setTimePickerTarget] = useState<{ triggerId: string, condId: string, value: string } | null>(null);

    const triggers = Object.values(state.triggers || {}) as Trigger[];

    // Helper lists
    const locations = Object.values(state.map.locations) as MapLocation[];
    const characters = Object.values(state.characters) as Character[];

    const handleCreateTrigger = () => {
        const newId = `trig_${Date.now()}`;
        const newTrigger: Trigger = {
            id: newId,
            name: "新触发器",
            phase: 'determineCharacterAction',
            conditions: [],
            urgentRequirement: "",
            systemLog: "",
            enabled: true,
            maxTriggers: -1
        };
        updateState(prev => ({
            ...prev,
            triggers: { ...(prev.triggers || {}), [newId]: newTrigger }
        }));
        setExpandedId(newId);
    };

    const handleUpdateTrigger = (id: string, updates: Partial<Trigger>) => {
        updateState(prev => ({
            ...prev,
            triggers: {
                ...prev.triggers,
                [id]: { ...prev.triggers[id], ...updates }
            }
        }));
    };

    const handleDeleteTrigger = (id: string) => {
        if (deleteConfirmId === id) {
            updateState(prev => {
                const next = { ...prev.triggers };
                delete next[id];
                return { ...prev, triggers: next };
            });
            setDeleteConfirmId(null);
        } else {
            setDeleteConfirmId(id);
            setTimeout(() => setDeleteConfirmId(null), 3000);
        }
    };

    const handleAddCondition = (triggerId: string) => {
        const newCond: TriggerCondition = {
            id: `cond_${Date.now()}`,
            type: 'char_attr',
            comparator: '>',
            value: 0
        };
        const trigger = state.triggers[triggerId];
        if (trigger) {
            handleUpdateTrigger(triggerId, { conditions: [...trigger.conditions, newCond] });
        }
    };

    const handleUpdateCondition = (triggerId: string, condId: string, updates: Partial<TriggerCondition>) => {
        const trigger = state.triggers[triggerId];
        if (!trigger) return;
        const newConditions = trigger.conditions.map(c => c.id === condId ? { ...c, ...updates } : c);
        handleUpdateTrigger(triggerId, { conditions: newConditions });
    };

    const handleRemoveCondition = (triggerId: string, condId: string) => {
        const trigger = state.triggers[triggerId];
        if (!trigger) return;
        const newConditions = trigger.conditions.filter(c => c.id !== condId);
        handleUpdateTrigger(triggerId, { conditions: newConditions });
    };

    // Inline Editor for Conditions
    const renderConditionEditor = (tId: string, cond: TriggerCondition, index: number) => {
        return (
            <div key={cond.id} className="bg-surface-light p-2 mb-2 flex flex-col gap-2 border border-border rounded">
                <div className="flex justify-between items-center border-b border-border pb-1">
                    <span className="text-xs font-bold text-primary">条件 #{index + 1} (Macro: {`{{condition ${index + 1}}`})</span>
                    <button onClick={() => handleRemoveCondition(tId, cond.id)} className="text-muted hover:text-danger-fg"><Trash2 size={12}/></button>
                </div>
                
                {/* Type Selector */}
                <div className="flex gap-2">
                    <select 
                        className="flex-1 bg-surface border border-border rounded text-xs p-1 text-body"
                        value={cond.type}
                        onChange={e => handleUpdateCondition(tId, cond.id, { type: e.target.value as ConditionType })}
                    >
                        {CONDITION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                </div>

                {/* Dynamic Inputs based on Type */}
                <div className="flex flex-col gap-2">
                    {(cond.type === 'char_attr' || cond.type === 'char_card') && (
                        <>
                            <div className="flex gap-2">
                                <select 
                                    className="flex-1 bg-surface border border-border rounded text-xs p-1 text-body"
                                    value={cond.locationId || 'all'}
                                    onChange={e => handleUpdateCondition(tId, cond.id, { locationId: e.target.value })}
                                >
                                    <option value="all">所有地点 (All Locations)</option>
                                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                                <select 
                                    className="flex-1 bg-surface border border-border rounded text-xs p-1 text-body"
                                    value={cond.characterId || 'all'}
                                    onChange={e => handleUpdateCondition(tId, cond.id, { characterId: e.target.value })}
                                >
                                    <option value="all">所有角色 (All Characters)</option>
                                    <option value="current" className="text-primary font-bold">★ 当前角色 (Context/Active)</option>
                                    {characters.filter(c => !cond.locationId || cond.locationId === 'all' || state.map.charPositions[c.id]?.locationId === cond.locationId).map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <Input 
                                className="text-xs h-7" 
                                placeholder={cond.type === 'char_attr' ? "属性名称 (Attribute Name)" : "卡牌名称 (Card Name)"}
                                value={cond.targetName || ""}
                                onChange={e => handleUpdateCondition(tId, cond.id, { targetName: e.target.value })}
                            />
                        </>
                    )}

                    {(cond.type === 'char_name' || cond.type === 'loc_name' || cond.type === 'region_name' || cond.type === 'world_attr') && (
                        <Input 
                            className="text-xs h-7" 
                            placeholder="名称 / 键名 (Name/Key)"
                            value={cond.targetName || ""}
                            onChange={e => handleUpdateCondition(tId, cond.id, { targetName: e.target.value })}
                        />
                    )}

                    {cond.type === 'history' && (
                        <div className="flex items-center gap-2">
                            <Label>检查最近</Label>
                            <Input 
                                type="number" 
                                className="w-12 h-7 text-xs text-center" 
                                value={cond.historyRounds || 5}
                                onChange={e => handleUpdateCondition(tId, cond.id, { historyRounds: parseInt(e.target.value) })}
                            />
                            <Label>轮</Label>
                        </div>
                    )}

                    {/* Comparator & Value */}
                    <div className="flex gap-2">
                        <select 
                            className="w-24 bg-surface border border-border rounded text-xs p-1 text-body"
                            value={cond.comparator}
                            onChange={e => handleUpdateCondition(tId, cond.id, { comparator: e.target.value as any })}
                        >
                            {(cond.type === 'char_attr' || cond.type === 'world_time' || cond.type === 'world_attr') ? (
                                COMPARATORS.map(c => <option key={c} value={c}>{c}</option>)
                            ) : (
                                STR_COMPARATORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
                            )}
                        </select>
                        
                        {['exists', 'not_exists'].includes(cond.comparator) ? (
                            <div className="flex-1 bg-surface-highlight rounded flex items-center px-2 text-xs text-muted italic border border-border">
                                (无需数值)
                            </div>
                        ) : cond.type === 'world_time' ? (
                            <Button 
                                variant="secondary" 
                                className="flex-1 h-7 text-xs flex items-center gap-2 justify-start font-mono"
                                onClick={() => setTimePickerTarget({ 
                                    triggerId: tId, 
                                    condId: cond.id, 
                                    value: String(cond.value || state.world.attributes.worldTime?.value || "2077:01:01:00:00:00") 
                                })}
                            >
                                <Clock size={12}/> {String(cond.value || "设定时间")}
                            </Button>
                        ) : (
                            <Input 
                                className="flex-1 text-xs h-7" 
                                placeholder="比较值 (Value)"
                                value={cond.value}
                                onChange={e => handleUpdateCondition(tId, cond.id, { value: e.target.value })}
                            />
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Window
            title={<span className="flex items-center gap-2"><Zap size={18} className="text-warning-fg"/> 触发器管理 (Trigger System)</span>}
            onClose={() => closeWindow(winId)}
            maxWidth="max-w-4xl"
            height="h-[85vh]"
            disableContentScroll={true}
            noPadding={true}
        >
            {timePickerTarget && createPortal(
                <WorldTimePicker
                    initialTime={timePickerTarget.value}
                    onCancel={() => setTimePickerTarget(null)}
                    onConfirm={(val) => {
                        handleUpdateCondition(timePickerTarget.triggerId, timePickerTarget.condId, { value: val });
                        setTimePickerTarget(null);
                    }}
                />,
                document.body
            )}

            <div className="flex flex-col h-full overflow-hidden">
                {/* Toolbar */}
                <div className="p-2 border-b border-border bg-surface-highlight shrink-0 flex justify-between items-center">
                    <div className="text-xs text-muted truncate mr-2">
                        定义特定条件下的 Prompt 注入与系统日志。
                    </div>
                    <Button size="sm" onClick={handleCreateTrigger} className="flex items-center gap-1 shrink-0">
                        <Plus size={14}/> 新建
                    </Button>
                </div>

                {/* Main List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-surface/30 custom-scrollbar">
                    {triggers.length === 0 && (
                        <div className="text-center text-muted italic py-10">暂无触发器。点击上方新建。</div>
                    )}
                    
                    {triggers.map(trigger => (
                        <div key={trigger.id} className="bg-surface border border-border rounded-lg overflow-hidden transition-all shadow-sm">
                            {/* Header Row */}
                            <div 
                                className={`p-3 flex items-center justify-between cursor-pointer hover:bg-surface-highlight ${expandedId === trigger.id ? 'bg-surface-highlight border-b border-border' : ''}`}
                                onClick={() => setExpandedId(expandedId === trigger.id ? null : trigger.id)}
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div 
                                        onClick={(e) => { e.stopPropagation(); handleUpdateTrigger(trigger.id, { enabled: !trigger.enabled }); }}
                                        className="cursor-pointer shrink-0"
                                        title={trigger.enabled ? "已启用 (点击禁用)" : "已禁用 (点击启用)"}
                                    >
                                        {trigger.enabled ? <CheckCircle size={18} className="text-success-fg"/> : <div className="w-[18px] h-[18px] rounded-full border-2 border-muted"/>}
                                    </div>
                                    <span className={`font-bold text-sm truncate ${trigger.enabled ? 'text-body' : 'text-muted line-through'}`}>{trigger.name}</span>
                                    <span className="text-[10px] bg-surface-light px-1.5 py-0.5 rounded text-muted font-mono hidden sm:inline border border-border">{trigger.phase}</span>
                                    
                                    {/* Remaining Count Badge */}
                                    {trigger.maxTriggers !== undefined && trigger.maxTriggers > -1 && (
                                        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded border border-primary/30 flex items-center gap-1 shrink-0">
                                            <Hash size={10}/> <span className="hidden sm:inline">剩余:</span> {trigger.maxTriggers}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteTrigger(trigger.id); }} 
                                        className={`p-1.5 rounded transition-all flex items-center justify-center ${deleteConfirmId === trigger.id ? 'bg-danger-base text-white w-12 md:w-16' : 'text-muted hover:text-danger-fg'}`}
                                    >
                                        {deleteConfirmId === trigger.id ? "!" : <Trash2 size={14}/>}
                                    </button>
                                    {expandedId === trigger.id ? <ChevronUp size={16} className="text-muted"/> : <ChevronDown size={16} className="text-muted"/>}
                                </div>
                            </div>

                            {/* Expanded Content */}
                            {expandedId === trigger.id && (
                                <div className="p-4 bg-surface-light/50 animate-in slide-in-from-top-2">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Left: Settings & Conditions */}
                                        <div className="space-y-4">
                                            <div>
                                                <Label>触发器名称</Label>
                                                <Input value={trigger.name} onChange={e => handleUpdateTrigger(trigger.id, { name: e.target.value })} />
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="flex flex-col">
                                                    <Label>触发阶段 (Phase)</Label>
                                                    <select 
                                                        className="w-full bg-surface border border-border rounded px-2 py-2 text-xs text-body font-mono h-8"
                                                        value={trigger.phase}
                                                        onChange={e => handleUpdateTrigger(trigger.id, { phase: e.target.value as TriggerPhase })}
                                                    >
                                                        {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <Label>自动禁用计数 (-1=无限)</Label>
                                                    <Input 
                                                        type="number" 
                                                        className="h-8 text-xs" 
                                                        value={trigger.maxTriggers ?? -1} 
                                                        onChange={e => handleUpdateTrigger(trigger.id, { maxTriggers: parseInt(e.target.value) })} 
                                                        placeholder="-1"
                                                    />
                                                </div>
                                            </div>

                                            <div className="border-t border-border pt-2">
                                                <div className="flex justify-between items-center mb-2">
                                                    <Label className="text-primary">触发条件 (Conditions - AND Logic)</Label>
                                                    <Button size="sm" variant="secondary" onClick={() => handleAddCondition(trigger.id)} className="h-6 text-xs">
                                                        <Plus size={12}/> 添加条件
                                                    </Button>
                                                </div>
                                                <div className="space-y-2">
                                                    {trigger.conditions.length === 0 && <div className="text-xs text-muted italic">无条件 (总是触发)</div>}
                                                    {trigger.conditions.map((c, i) => renderConditionEditor(trigger.id, c, i))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Actions */}
                                        <div className="space-y-4 border-l-0 border-t lg:border-t-0 lg:border-l border-border pl-0 pt-4 lg:pt-0 lg:pl-6">
                                            <Label className="text-success-fg flex items-center gap-2"><Activity size={14}/> 触发效果 (Actions)</Label>
                                            
                                            <div className="bg-surface-light p-3 rounded border border-border">
                                                <Label>紧急需求 (Urgent Requirement)</Label>
                                                <p className="text-[10px] text-muted mb-1">将此文本追加到 AI Prompt 的末尾，强制 AI 注意。</p>
                                                <TextArea 
                                                    className="h-24 resize-none text-xs font-mono" 
                                                    placeholder="例如: 你的{{condition 1}}过低，必须描述濒死状态..."
                                                    value={trigger.urgentRequirement}
                                                    onChange={e => handleUpdateTrigger(trigger.id, { urgentRequirement: e.target.value })}
                                                />
                                            </div>

                                            <div className="bg-surface-light p-3 rounded border border-border">
                                                <Label>系统日志 (System Log)</Label>
                                                <p className="text-[10px] text-muted mb-1">触发时立即在故事面板插入此消息。留空则不插入。</p>
                                                <TextArea 
                                                    className="h-24 resize-none text-xs" 
                                                    placeholder="例如: 系统: [{{char_name}}] 触发了死亡判定，数值: {{condition 1}}..."
                                                    value={trigger.systemLog}
                                                    onChange={e => handleUpdateTrigger(trigger.id, { systemLog: e.target.value })}
                                                />
                                            </div>

                                            <div className="bg-primary/10 p-2 rounded border border-primary/30 text-[10px] text-primary">
                                                <strong>可用宏 (Macros):</strong><br/>
                                                <code>{'{{condition N}}'}</code> - 第 N 个条件判定时获取到的实际值。<br/>
                                                例如: 条件1检查 HP &gt; 0, 实际 HP 为 50。 <code>{'{{condition 1}}'}</code> 将被替换为 50。
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </Window>
    );
};
