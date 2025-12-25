
import React, { useState, useEffect } from 'react';
import { GameState, Character, LogEntry } from '../../types';
import { Button, Input, Label } from '../ui/Button';
import { Download, Upload, CheckSquare, Square, Globe, Cpu, MessageSquare, Key, Lock, FileText, Unlock, UserPlus, BrainCircuit, AlertTriangle, Users } from 'lucide-react';

interface SaveLoadModalProps {
    config: {
        type: 'save' | 'load';
        dataToLoad?: any; 
        fileToLoad?: File; 
        isOpen: boolean;
        error?: string; 
    };
    state: GameState;
    onClose: () => void;
    onSave: (progress: boolean, settings: boolean, model: boolean, context: boolean, filename: string) => void;
    onLoad: (progress: boolean, settings: boolean, model: boolean, context: boolean, data?: any) => void;
    onImport: (chars: Character[], history: LogEntry[], keepMemory: boolean, memoryRounds: number) => void;
    onUpdateConfig: (newConfig: any) => void;
    parseAndValidateSave: (file: File) => Promise<any>;
}

export const SaveLoadModal: React.FC<SaveLoadModalProps> = ({ 
    config, state, onClose, onSave, onLoad, onImport, onUpdateConfig, parseAndValidateSave 
}) => {
    // Local state for checkboxes
    const [options, setOptions] = useState({ 
        progress: true, 
        settings: true, 
        modelInterface: true, 
        globalContext: true
    });

    // Import Mode State
    const [isImportMode, setIsImportMode] = useState(false);
    const [parsedImportChars, setParsedImportChars] = useState<Character[]>([]);
    const [parsedImportHistory, setParsedImportHistory] = useState<LogEntry[]>([]);
    const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
    // Import Settings
    const [importSettings, setImportSettings] = useState({ keepMemory: false, memoryRounds: 20 });
    
    // Inputs
    const [saveFilename, setSaveFilename] = useState("");
    const [loadPasswordInput, setLoadPasswordInput] = useState("");

    // Calculate Lock State for Load
    const currentDevPassword = state.appSettings.devPassword;
    const isLoadLocked = config.type === 'load' && !!currentDevPassword && loadPasswordInput !== currentDevPassword;

    // Reset on Open
    useEffect(() => {
        if (config.isOpen) {
            setIsImportMode(false);
            setParsedImportChars([]);
            setParsedImportHistory([]);
            setSelectedImportIds(new Set());
            setImportSettings({ keepMemory: false, memoryRounds: 20 });
            setLoadPasswordInput("");
            setOptions({ 
                progress: true, 
                settings: true, 
                modelInterface: true, 
                globalContext: true
            });

            if (config.type === 'save') {
                const date = new Date();
                const timeStr = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const activeLoc = state.map.activeLocationId ? state.map.locations[state.map.activeLocationId] : null;
                const regionName = activeLoc?.regionId && state.map.regions[activeLoc.regionId] ? state.map.regions[activeLoc.regionId].name : "UnknownRegion";
                const locName = activeLoc ? activeLoc.name : "UnknownLoc";
                setSaveFilename(`${timeStr}_${regionName}_${locName}`);
            }
        }
    }, [config.isOpen, config.type]); // Intentionally not including state map deps to avoid reset on minor updates

    // Parse Logic
    useEffect(() => {
        if (config.isOpen && config.type === 'load' && config.fileToLoad) {
            parseAndValidateSave(config.fileToLoad)
                .then((json: any) => {
                    if (json) {
                        onUpdateConfig({ ...config, dataToLoad: json });

                        if (json.characters) {
                            const chars = Object.values(json.characters) as Character[];
                            setParsedImportChars(chars);
                        } else {
                            setParsedImportChars([]);
                        }
                        if (json.world && json.world.history) {
                            setParsedImportHistory(json.world.history);
                        } else {
                            setParsedImportHistory([]);
                        }
                    }
                })
                .catch((e: any) => {
                    if (e.message === "UserCancelled") {
                        onClose();
                    } else {
                        console.error("Secure load failed", e);
                        setParsedImportChars([]);
                        setParsedImportHistory([]);
                        onUpdateConfig({ ...config, error: e.message || "文件解析或安全验证失败。" });
                    }
                });
        }
    }, [config.isOpen, config.fileToLoad, config.type]);

    const handleConfirm = () => {
        if (config.type === 'save') {
            onSave(options.progress, options.settings, options.modelInterface, options.globalContext, saveFilename);
        } else {
            if (isImportMode) {
                const selectedChars = parsedImportChars.filter(c => selectedImportIds.has(c.id));
                if (selectedChars.length > 0) {
                    onImport(selectedChars, parsedImportHistory, importSettings.keepMemory, importSettings.memoryRounds);
                } else {
                    alert("请先选择至少一个角色。");
                }
            } else {
                onLoad(options.progress, options.settings, options.modelInterface, options.globalContext, config.dataToLoad);
            }
        }
    };

    const toggleImportSelection = (id: string) => {
        const newSet = new Set(selectedImportIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedImportIds(newSet);
    };

    const selectAllImport = () => {
        if (selectedImportIds.size === parsedImportChars.length) {
            setSelectedImportIds(new Set());
        } else {
            setSelectedImportIds(new Set(parsedImportChars.map(c => c.id)));
        }
    };

    if (!config.isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
            <div className="fixed inset-0 bg-overlay transition-opacity" onClick={onClose} />
            <div 
                className="flex min-h-full items-center justify-center p-4"
                onClick={(e) => {
                    if (e.target === e.currentTarget) onClose();
                }}
            >
                <div className={`relative glass-panel p-6 w-full animate-in fade-in zoom-in-95 duration-200 flex flex-col text-body ${isImportMode ? 'max-w-2xl max-h-[85vh]' : 'max-w-md'}`}>
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-bold text-highlight flex items-center gap-2">
                            {config.type === 'save' ? <Download size={20}/> : <Upload size={20}/>}
                            {config.type === 'save' ? "保存游戏 (Save Game)" : "加载数据 (Load Data)"}
                        </h3>
                        {config.type === 'load' && config.fileToLoad && (
                            <div className="flex bg-surface-highlight rounded p-0.5 text-xs">
                                <button 
                                    onClick={() => setIsImportMode(false)}
                                    className={`px-3 py-1 rounded ${!isImportMode ? 'bg-primary text-white' : 'text-muted hover:text-body'}`}
                                >
                                    完整加载
                                </button>
                                <button 
                                    onClick={() => setIsImportMode(true)}
                                    className={`px-3 py-1 rounded flex items-center gap-1 ${isImportMode ? 'bg-accent-teal text-white' : 'text-muted hover:text-body'}`}
                                >
                                    <UserPlus size={12}/> 导入角色
                                </button>
                            </div>
                        )}
                    </div>
                    
                    {/* ERROR MESSAGE DISPLAY */}
                    {config.error && (
                        <div className="mb-4 bg-danger/20 border border-danger/50 text-danger-fg p-3 rounded text-xs whitespace-pre-wrap leading-relaxed">
                            <div className="font-bold flex items-center gap-2 mb-1 text-danger-fg">
                                <AlertTriangle size={14}/> 错误 (Error)
                            </div>
                            {config.error}
                        </div>
                    )}
                    
                    {config.type === 'save' && (
                        <div className="mb-6">
                            <Label className="mb-2 block">文件名 (Filename)</Label>
                            <div className="flex items-center gap-2 mb-4">
                                <Input 
                                    value={saveFilename} 
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSaveFilename(e.target.value)} 
                                    className="flex-1"
                                    placeholder="Enter filename..."
                                />
                                <span className="text-muted text-sm font-mono">.json</span>
                            </div>

                            <div className="space-y-4 mb-6">
                                {/* Checkbox Options for Save */}
                                <div 
                                  className={`flex items-center p-3 rounded border cursor-pointer transition-colors ${options.progress ? 'bg-primary/20 border-primary' : 'bg-surface-light border-border'}`}
                                  onClick={() => setOptions(p => ({ ...p, progress: !p.progress }))}
                                >
                                    {options.progress ? <CheckSquare className="text-primary mr-3"/> : <Square className="text-muted mr-3"/>}
                                    <div>
                                        <div className="font-bold text-sm text-body">游戏进度 (Game Progress)</div>
                                        <div className="text-xs text-muted">包含角色、世界、地图、背包等当前状态。</div>
                                    </div>
                                </div>

                                <div 
                                  className={`flex items-center p-3 rounded border cursor-pointer transition-colors ${options.settings ? 'bg-primary/20 border-primary' : 'bg-surface-light border-border'}`}
                                  onClick={() => setOptions(p => ({ ...p, settings: !p.settings }))}
                                >
                                    {options.settings ? <CheckSquare className="text-primary mr-3"/> : <Square className="text-muted mr-3"/>}
                                    <div className="flex items-start gap-2">
                                        <Globe size={16} className="mt-1 text-primary"/>
                                        <div>
                                            <div className="font-bold text-sm text-body">全局设置 (Global Settings)</div>
                                            <div className="text-xs text-muted">包含游戏规则、Prompt模版和默认值 (不含模型配置)。</div>
                                        </div>
                                    </div>
                                </div>

                                <div 
                                  className={`flex items-center p-3 rounded border cursor-pointer transition-colors ${options.modelInterface ? 'bg-primary/20 border-primary' : 'bg-surface-light border-border'}`}
                                  onClick={() => setOptions(p => ({ ...p, modelInterface: !p.modelInterface }))}
                                >
                                    {options.modelInterface ? <CheckSquare className="text-primary mr-3"/> : <Square className="text-muted mr-3"/>}
                                    <div className="flex items-start gap-2">
                                        <Cpu size={16} className="mt-1 text-primary"/>
                                        <div>
                                            <div className="font-bold text-sm text-body">模型接口 (Model Interface)</div>
                                            <div className="text-xs text-muted">包含 API Keys 及全局模型配置参数。</div>
                                        </div>
                                    </div>
                                </div>

                                <div 
                                  className={`flex items-center p-3 rounded border cursor-pointer transition-colors ${options.globalContext ? 'bg-primary/20 border-primary' : 'bg-surface-light border-border'}`}
                                  onClick={() => setOptions(p => ({ ...p, globalContext: !p.globalContext }))}
                                >
                                    {options.globalContext ? <CheckSquare className="text-primary mr-3"/> : <Square className="text-muted mr-3"/>}
                                    <div className="flex items-start gap-2">
                                        <MessageSquare size={16} className="mt-1 text-primary"/>
                                        <div>
                                            <div className="font-bold text-sm text-body">全局上下文工程 (Global Context)</div>
                                            <div className="text-xs text-muted">包含定义的全局系统指令和世界观设定。</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {state.appSettings.encryptSaveFiles && (
                                <div className="text-xs text-accent-teal flex items-center gap-1 bg-teal-900/20 p-2 rounded border border-teal-900/50">
                                    <Lock size={12}/> 
                                    <span>加密已启用。文件名即密钥，请务必牢记文件名！</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* LOAD MODE CONTENT */}
                    {config.type === 'load' && (
                        <>
                            {/* 1. Session Verification Logic */}
                            {!!currentDevPassword && (
                                <div className={`mb-4 p-3 rounded border transition-colors ${isLoadLocked ? 'bg-warning-base/20 border-warning-base/50' : 'bg-success-base/20 border-success-base/50'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        {isLoadLocked ? <Lock size={16} className="text-warning-fg"/> : <Unlock size={16} className="text-success-fg"/>}
                                        <span className={`text-xs font-bold ${isLoadLocked ? 'text-warning-fg' : 'text-success-fg'}`}>
                                            {isLoadLocked ? "当前会话已锁定 (Session Locked)" : "验证通过 (Verified)"}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-muted mb-2 leading-relaxed">
                                        请输入当前开发者密码以启用加载功能，或者重置游戏以加载新存档。
                                    </div>
                                    <Input 
                                        type="password" 
                                        value={loadPasswordInput}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLoadPasswordInput(e.target.value)}
                                        placeholder="输入当前开发者密码..."
                                        className={`text-xs h-8 bg-surface-highlight ${isLoadLocked ? 'border-warning-base/50' : 'border-success-base/50'}`}
                                    />
                                </div>
                            )}

                            {config.fileToLoad && (
                                <div className="mb-4 bg-surface-highlight p-3 rounded border border-border flex justify-between items-center">
                                    <div className="flex items-center gap-2 text-sm text-body overflow-hidden">
                                        <FileText size={16} className="shrink-0"/>
                                        <span className="font-mono truncate">{config.fileToLoad.name}</span>
                                    </div>
                                </div>
                            )}

                            {/* Regular Full Load Options */}
                            {!isImportMode && (
                                <div className={`space-y-4 mb-6 ${isLoadLocked ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                                    {/* Same Checkboxes as Save but for Load scope */}
                                    <div 
                                      className={`flex items-center p-3 rounded border cursor-pointer transition-colors ${options.progress ? 'bg-primary/20 border-primary' : 'bg-surface-light border-border'}`}
                                      onClick={() => setOptions(p => ({ ...p, progress: !p.progress }))}
                                    >
                                        {options.progress ? <CheckSquare className="text-primary mr-3"/> : <Square className="text-muted mr-3"/>}
                                        <div>
                                            <div className="font-bold text-sm text-body">游戏进度 (Game Progress)</div>
                                            <div className="text-xs text-muted">包含角色、世界、地图、背包等当前状态。</div>
                                        </div>
                                    </div>

                                    <div 
                                      className={`flex items-center p-3 rounded border cursor-pointer transition-colors ${options.settings ? 'bg-primary/20 border-primary' : 'bg-surface-light border-border'}`}
                                      onClick={() => setOptions(p => ({ ...p, settings: !p.settings }))}
                                    >
                                        {options.settings ? <CheckSquare className="text-primary mr-3"/> : <Square className="text-muted mr-3"/>}
                                        <div className="flex items-start gap-2">
                                            <Globe size={16} className="mt-1 text-primary"/>
                                            <div>
                                                <div className="font-bold text-sm text-body">全局设置 (Global Settings)</div>
                                                <div className="text-xs text-muted">包含游戏规则、Prompt模版和默认值。</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div 
                                      className={`flex items-center p-3 rounded border cursor-pointer transition-colors ${options.modelInterface ? 'bg-primary/20 border-primary' : 'bg-surface-light border-border'}`}
                                      onClick={() => setOptions(p => ({ ...p, modelInterface: !p.modelInterface }))}
                                    >
                                        {options.modelInterface ? <CheckSquare className="text-primary mr-3"/> : <Square className="text-muted mr-3"/>}
                                        <div className="flex items-start gap-2">
                                            <Cpu size={16} className="mt-1 text-primary"/>
                                            <div>
                                                <div className="font-bold text-sm text-body">模型接口 (Model Interface)</div>
                                                <div className="text-xs text-muted">包含 API Keys 及全局模型配置参数。</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div 
                                      className={`flex items-center p-3 rounded border cursor-pointer transition-colors ${options.globalContext ? 'bg-primary/20 border-primary' : 'bg-surface-light border-border'}`}
                                      onClick={() => setOptions(p => ({ ...p, globalContext: !p.globalContext }))}
                                    >
                                        {options.globalContext ? <CheckSquare className="text-primary mr-3"/> : <Square className="text-muted mr-3"/>}
                                        <div className="flex items-start gap-2">
                                            <MessageSquare size={16} className="mt-1 text-primary"/>
                                            <div>
                                                <div className="font-bold text-sm text-body">全局上下文工程 (Global Context)</div>
                                                <div className="text-xs text-muted">包含定义的全局系统指令和世界观设定。</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Import Mode Content */}
                            {isImportMode && (
                                <div className={`flex flex-col h-[60vh] ${isLoadLocked ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                                    <div className="flex-1 overflow-y-auto bg-surface-highlight/30 rounded border border-border p-2 custom-scrollbar mb-4">
                                        <div className="flex justify-between items-center mb-2 px-2">
                                            <span className="text-xs font-bold text-muted">文件包含 {parsedImportChars.length} 个角色</span>
                                            <button onClick={selectAllImport} className="text-xs text-primary hover:underline">
                                                {selectedImportIds.size === parsedImportChars.length ? "取消全选" : "全选"}
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {parsedImportChars.map(c => (
                                                <div 
                                                    key={c.id}
                                                    onClick={() => toggleImportSelection(c.id)}
                                                    className={`p-2 rounded border cursor-pointer flex items-center gap-2 transition-colors ${selectedImportIds.has(c.id) ? 'bg-primary/20 border-primary' : 'bg-surface border-border hover:border-highlight'}`}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedImportIds.has(c.id) ? 'bg-primary border-primary text-white' : 'border-muted'}`}>
                                                        {selectedImportIds.has(c.id) && <CheckSquare size={12}/>}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold truncate">{c.name}</div>
                                                        <div className="text-[9px] text-muted truncate">{c.id}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-3 bg-surface-highlight p-3 rounded border border-border">
                                        <Label className="flex items-center gap-2 text-xs"><BrainCircuit size={14}/> 记忆导入设置</Label>
                                        
                                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={importSettings.keepMemory}
                                                onChange={e => setImportSettings({...importSettings, keepMemory: e.target.checked})}
                                                className="accent-primary"
                                            />
                                            <span>保留角色记忆 (Keep Memory)</span>
                                        </label>
                                        
                                        {importSettings.keepMemory && (
                                            <div className="flex items-center gap-2 text-xs ml-6 animate-in fade-in slide-in-from-top-1">
                                                <span>提取最近</span>
                                                <Input 
                                                    type="number" 
                                                    className="w-12 h-6 text-center"
                                                    value={importSettings.memoryRounds}
                                                    onChange={e => setImportSettings({...importSettings, memoryRounds: parseInt(e.target.value) || 0})}
                                                />
                                                <span>轮历史作为前世记忆</span>
                                            </div>
                                        )}
                                        <div className="text-[10px] text-muted leading-tight">
                                            若勾选，系统将从源文件的历史记录中提取相关记忆，并追加到角色描述中。
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Footer Buttons */}
                    <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border">
                        <Button variant="secondary" onClick={onClose}>取消 (Cancel)</Button>
                        <Button 
                            onClick={handleConfirm} 
                            disabled={isLoadLocked || (config.type === 'load' && !config.dataToLoad && !isImportMode)}
                            className={config.type === 'save' ? 'bg-primary hover:bg-primary-hover' : 'bg-success-base hover:bg-success-base/80'}
                        >
                            {config.type === 'save' ? <Download size={16} className="mr-2"/> : <Upload size={16} className="mr-2"/>}
                            {config.type === 'save' ? "确认保存" : (isImportMode ? `导入选中 (${selectedImportIds.size})` : "确认加载")}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
