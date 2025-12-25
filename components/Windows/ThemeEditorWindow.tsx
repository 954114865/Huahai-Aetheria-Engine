
import React, { useState, useEffect } from 'react';
import { GameState, ThemeConfig } from '../../types';
import { Button, Label } from '../ui/Button';
import { Palette, Copy, Clipboard, CheckCircle, Save, Moon, Sun, Check, Droplets, RotateCcw, Heart, Zap, Activity, Feather, BookOpen } from 'lucide-react';
import { serializeTheme, deserializeTheme, applyThemeToRoot, DEFAULT_THEME_CONFIG } from '../../services/themeService';
import { Window } from '../ui/Window';

interface ThemeEditorWindowProps {
    winId: number;
    state: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    closeWindow: (id: number) => void;
}

const HUE_GROUPS = [
    { name: "Neutrals / Base", hues: ['slate', 'gray', 'zinc', 'neutral', 'stone'] },
    { name: "Warm", hues: ['red', 'orange', 'amber', 'yellow'] },
    { name: "Nature", hues: ['lime', 'green', 'emerald', 'teal'] },
    { name: "Cool", hues: ['cyan', 'sky', 'blue', 'indigo'] },
    { name: "Floral", hues: ['violet', 'purple', 'fuchsia', 'pink', 'rose'] }
];

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

type TargetField = 'baseHue' | 'primaryHue' | 'secondaryHue' | 'libidoHue' | 'dopamineHue' | 'endorphinHue' | 'oxytocinHue' | 'storyLogBgHue' | 'storyLogTextHue';
type SatField = 'baseSat' | 'primarySat' | 'secondarySat' | 'libidoSat' | 'dopamineSat' | 'endorphinSat' | 'oxytocinSat' | 'storyLogBgSat' | 'storyLogTextSat';

export const ThemeEditorWindow: React.FC<ThemeEditorWindowProps> = ({ winId, state, updateState, closeWindow }) => {
    
    // Removed duplicate defaultConfig definition. Using DEFAULT_THEME_CONFIG from service.

    const [config, setConfig] = useState<ThemeConfig>(state.appSettings.themeConfig || DEFAULT_THEME_CONFIG);
    const [activeMode, setActiveMode] = useState<'light' | 'dark'>(state.appSettings.storyLogLightMode ? 'light' : 'dark');
    const [editTarget, setEditTarget] = useState<TargetField>('baseHue');
    
    const [importStr, setImportStr] = useState("");
    const [showCopied, setShowCopied] = useState(false);
    const [resetConfirm, setResetConfirm] = useState(false);

    // Apply theme whenever local config changes (Live Preview)
    useEffect(() => {
        applyThemeToRoot(config, activeMode === 'light');
    }, [config, activeMode]);

    // Cleanup on unmount if cancelled (revert to saved state)
    useEffect(() => {
        const originalConfig = state.appSettings.themeConfig || DEFAULT_THEME_CONFIG;
        const originalMode = state.appSettings.storyLogLightMode;
        return () => {
            applyThemeToRoot(state.appSettings.themeConfig || DEFAULT_THEME_CONFIG, originalMode);
        };
    }, []); 

    const handleSave = () => {
        updateState(prev => ({
            ...prev,
            appSettings: { ...prev.appSettings, themeConfig: config, storyLogLightMode: activeMode === 'light' }
        }));
        closeWindow(winId);
    };

    const handleColorSelect = (hue: string, shade: number) => {
        const value = `${hue}-${shade}`;
        setConfig(prev => ({
            ...prev,
            [activeMode]: {
                ...prev[activeMode],
                [editTarget]: value
            }
        }));
    };

    const handleSatChange = (val: number) => {
        const satFieldMap: Record<TargetField, SatField> = {
            'baseHue': 'baseSat',
            'primaryHue': 'primarySat',
            'secondaryHue': 'secondarySat',
            'libidoHue': 'libidoSat',
            'dopamineHue': 'dopamineSat',
            'endorphinHue': 'endorphinSat',
            'oxytocinHue': 'oxytocinSat',
            'storyLogBgHue': 'storyLogBgSat',
            'storyLogTextHue': 'storyLogTextSat'
        };
        const satField = satFieldMap[editTarget];
        
        setConfig(prev => ({
            ...prev,
            [activeMode]: {
                ...prev[activeMode],
                [satField]: val
            }
        }));
    };

    const currentPalette = activeMode === 'light' ? config.light : config.dark;
    
    // Parse current value to highlight in grid
    const getCurrentSelection = () => {
        const val = currentPalette[editTarget];
        // Handle undefined for new fields by falling back to sensible defaults or previous defaults
        if (!val) {
            if (editTarget === 'libidoHue') return { hue: 'pink', shade: 500 };
            if (editTarget === 'dopamineHue') return { hue: 'yellow', shade: 500 };
            if (editTarget === 'endorphinHue') return { hue: 'orange', shade: 500 };
            if (editTarget === 'oxytocinHue') return { hue: 'teal', shade: 500 };
            if (editTarget === 'storyLogBgHue') return { hue: activeMode === 'light' ? 'orange' : 'slate', shade: activeMode === 'light' ? 50 : 900 };
            if (editTarget === 'storyLogTextHue') return { hue: activeMode === 'light' ? 'slate' : 'slate', shade: activeMode === 'light' ? 900 : 200 };
            return { hue: 'slate', shade: 500 };
        }

        // Handle legacy "slate" vs new "slate-900"
        const parts = val.split('-');
        if (parts.length >= 2 && !isNaN(parseInt(parts[parts.length-1]))) {
            return { hue: parts.slice(0, -1).join('-'), shade: parseInt(parts[parts.length-1]) };
        }
        // Legacy fallback defaults
        const defShade = editTarget === 'baseHue' ? (activeMode === 'light' ? 50 : 950) : (editTarget === 'primaryHue' ? (activeMode === 'light' ? 600 : 500) : 600);
        return { hue: val, shade: defShade };
    };

    const getCurrentSat = () => {
        switch (editTarget) {
            case 'baseHue': return currentPalette.baseSat ?? 1.0;
            case 'primaryHue': return currentPalette.primarySat ?? 1.0;
            case 'secondaryHue': return currentPalette.secondarySat ?? 1.0;
            case 'libidoHue': return currentPalette.libidoSat ?? 1.0;
            case 'dopamineHue': return currentPalette.dopamineSat ?? 1.0;
            case 'endorphinHue': return currentPalette.endorphinSat ?? 1.0;
            case 'oxytocinHue': return currentPalette.oxytocinSat ?? 1.0;
            case 'storyLogBgHue': return currentPalette.storyLogBgSat ?? 1.0;
            case 'storyLogTextHue': return currentPalette.storyLogTextSat ?? 1.0;
            default: return 1.0;
        }
    };

    const selection = getCurrentSelection();
    const currentSat = getCurrentSat();

    const handleCopy = () => {
        navigator.clipboard.writeText(serializeTheme(config));
        setShowCopied(true);
        setTimeout(() => setShowCopied(false), 2000);
    };

    const handleImport = () => {
        const imported = deserializeTheme(importStr);
        if (imported) {
            setConfig(imported);
            setImportStr("");
            alert("主题已导入！");
        }
    };

    const handleReset = () => {
        if (resetConfirm) {
            // Confirm logic executed
            setConfig(DEFAULT_THEME_CONFIG);
            setResetConfirm(false);
        } else {
            // First click
            setResetConfirm(true);
            setTimeout(() => setResetConfirm(false), 3000);
        }
    };

    const SelectItem = ({ target, label, subLabel, colorVar, icon }: { target: TargetField, label: string, subLabel: string, colorVar: string, icon?: React.ReactNode }) => (
        <div 
            onClick={() => setEditTarget(target)}
            className={`p-2 rounded border cursor-pointer transition-all flex items-center justify-between group ${editTarget === target ? 'bg-surface-highlight border-primary ring-1 ring-primary' : 'bg-surface border-border hover:border-muted'}`}
        >
            <div className="flex items-center gap-2">
                {icon && <div className={editTarget === target ? "text-primary" : "text-muted group-hover:text-body"}>{icon}</div>}
                <div>
                    <div className={`text-xs font-bold ${editTarget === target ? 'text-primary' : 'text-body'}`}>{label}</div>
                    <div className="text-[9px] text-muted">{subLabel}</div>
                </div>
            </div>
            <div className="w-4 h-4 rounded-full border border-border shadow-sm" style={{ backgroundColor: colorVar }} />
        </div>
    );

    return (
        <Window
            title="主题外观设置 (Advanced Theme)"
            icon={<Palette size={18}/>}
            onClose={() => closeWindow(winId)}
            maxWidth="max-w-6xl"
            height="h-[90vh] md:h-[80vh]"
            disableContentScroll={true}
            noPadding={true}
            footer={
                <div className="flex flex-col-reverse sm:flex-row justify-between items-center w-full gap-3">
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto items-center justify-center sm:justify-start">
                        <input 
                            className="bg-surface border border-border rounded px-2 text-xs font-mono text-body h-8 w-full sm:w-32 md:w-48"
                            placeholder='粘贴主题代码 (JSON)'
                            value={importStr}
                            onChange={e => setImportStr(e.target.value)}
                        />
                        <Button size="sm" variant="secondary" onClick={handleImport} disabled={!importStr} className="flex-1 sm:flex-none">
                            <Clipboard size={14} className="mr-1"/> 导入
                        </Button>
                        <Button size="sm" variant="secondary" onClick={handleCopy} className="flex-1 sm:flex-none">
                            {showCopied ? <CheckCircle size={14}/> : <Copy size={14}/>} {showCopied ? "已复制" : "导出"}
                        </Button>
                        <Button 
                            size="sm" 
                            variant="danger" 
                            onClick={handleReset} 
                            className={`flex-1 sm:flex-none transition-all ${resetConfirm ? 'animate-pulse font-bold bg-danger hover:bg-danger-hover text-white ring-2 ring-danger ring-offset-1 ring-offset-surface' : ''}`}
                        >
                            <RotateCcw size={14} className="mr-1"/> 
                            {resetConfirm ? "确认重置?" : "重置"}
                        </Button>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto justify-end">
                        <Button variant="secondary" onClick={() => closeWindow(winId)} className="flex-1 sm:flex-none">取消</Button>
                        <Button onClick={handleSave} className="bg-primary hover:bg-primary-hover text-primary-fg font-bold px-6 flex-1 sm:flex-none">
                            <Save size={16} className="mr-2"/> 应用并保存
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden h-full">
                {/* LEFT PANEL: Preview & Controls */}
                <div className="w-full md:w-80 border-r-0 border-b md:border-b-0 md:border-r border-border flex flex-col bg-surface p-4 gap-4 shrink-0 overflow-y-auto max-h-[40vh] md:max-h-full">
                    
                    {/* Mode Switcher */}
                    <div className="flex bg-surface-highlight p-1 rounded-lg border border-border shrink-0">
                        <button
                            onClick={() => setActiveMode('dark')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all ${activeMode === 'dark' ? 'bg-indigo-600 text-white shadow' : 'text-muted hover:text-body'}`}
                        >
                            <Moon size={14} /> 暗黑
                        </button>
                        <button
                            onClick={() => setActiveMode('light')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all ${activeMode === 'light' ? 'bg-amber-100 text-amber-900 shadow' : 'text-muted hover:text-body'}`}
                        >
                            <Sun size={14} /> 明亮
                        </button>
                    </div>

                    {/* Target Selectors */}
                    <div className="space-y-2 shrink-0">
                        <Label className="text-xs font-bold text-muted uppercase">基础配色 (Core)</Label>
                        <SelectItem target="baseHue" label="基础背景 (Base)" subLabel="应用背景、卡片底色" colorVar="var(--bg-app)" />
                        <SelectItem target="primaryHue" label="主色调 (Primary)" subLabel="核心按钮、高亮、重点" colorVar="var(--primary-base)" />
                        <SelectItem target="secondaryHue" label="辅色调 (Accent)" subLabel="次要按钮、信息提示" colorVar="var(--info-base)" />
                        
                        <Label className="text-xs font-bold text-muted uppercase mt-4">故事日志配色 (Story Log)</Label>
                        <div className="grid grid-cols-2 gap-2">
                            <SelectItem target="storyLogBgHue" label="日志背景" subLabel="Log Background" colorVar="var(--bg-story)" icon={<BookOpen size={12}/>} />
                            <SelectItem target="storyLogTextHue" label="日志字体" subLabel="Log Text Color" colorVar="var(--text-story)" icon={<BookOpen size={12}/>} />
                        </div>

                        <Label className="text-xs font-bold text-muted uppercase mt-4">语义配色 (Semantics)</Label>
                        <div className="grid grid-cols-2 gap-2">
                            <SelectItem target="libidoHue" label="力比多" subLabel="快感/Sensual" colorVar="var(--libido-base)" icon={<Heart size={12}/>} />
                            <SelectItem target="dopamineHue" label="多巴胺" subLabel="快乐/Reward" colorVar="var(--dopamine-base)" icon={<Zap size={12}/>} />
                            <SelectItem target="endorphinHue" label="内啡肽" subLabel="紧张/Relief" colorVar="var(--endorphin-base)" icon={<Activity size={12}/>} />
                            <SelectItem target="oxytocinHue" label="催产素" subLabel="宁静/Calm" colorVar="var(--oxytocin-base)" icon={<Feather size={12}/>} />
                        </div>
                    </div>

                    {/* Saturation Slider */}
                    <div className="bg-surface-highlight/30 p-2 md:p-3 rounded border border-border shrink-0 mt-auto">
                        <div className="flex justify-between items-center mb-2">
                            <Label className="flex items-center gap-2 text-xs">
                                <Droplets size={12}/> 饱和度 (Saturation)
                            </Label>
                            <span className="text-xs font-mono font-bold">{Math.round(currentSat * 100)}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted">0%</span>
                            <input 
                                type="range" 
                                min="0" max="2" step="0.05"
                                className="flex-1 accent-primary h-2 bg-surface rounded-lg appearance-none cursor-pointer"
                                value={currentSat}
                                onChange={e => handleSatChange(parseFloat(e.target.value))}
                            />
                            <span className="text-[10px] text-muted">200%</span>
                        </div>
                        <div className="text-[9px] text-muted mt-1 text-center">
                            *当前仅调节 {editTarget.replace('Hue', '')} 的饱和度
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL: Full Palette Grid */}
                <div className="flex-1 bg-surface-light overflow-y-auto custom-scrollbar relative">
                    <div className="pb-12">
                        {HUE_GROUPS.map(group => (
                            <div key={group.name} className="relative">
                                {/* Sticky Header */}
                                <h3 className="text-xs font-bold text-muted uppercase tracking-wider px-4 md:px-6 py-3 border-b border-border/50 sticky top-0 bg-surface-light/95 backdrop-blur-md z-30 flex items-center gap-2 shadow-sm">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                                    {group.name}
                                </h3>
                                
                                {/* Card Grid Layout */}
                                <div className="px-4 md:px-6 py-4">
                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                        {group.hues.map(hue => (
                                            <div key={hue} className="bg-surface border border-border rounded-lg p-3 shadow-sm hover:border-primary/50 transition-colors flex flex-col gap-2 group">
                                                {/* Card Header */}
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-bold text-body capitalize">{hue}</span>
                                                    {/* Preview Dot */}
                                                    <div 
                                                        className="w-3 h-3 rounded-full border border-border" 
                                                        style={{backgroundColor: `var(--color-${hue}-500)`}}
                                                    ></div>
                                                </div>
                                                
                                                {/* Swatches - Responsive Grid */}
                                                <div className="grid grid-cols-11 gap-1">
                                                    {SHADES.map(shade => {
                                                        const isSelected = selection.hue === hue && selection.shade === shade;
                                                        return (
                                                            <div
                                                                key={`${hue}-${shade}`}
                                                                onClick={() => handleColorSelect(hue, shade)}
                                                                className={`
                                                                    aspect-square rounded-md cursor-pointer transition-all
                                                                    flex items-center justify-center border
                                                                    ${isSelected 
                                                                        ? 'border-white ring-2 ring-primary shadow-lg scale-110 z-10' 
                                                                        : 'border-transparent hover:scale-105 hover:border-border'}
                                                                `}
                                                                style={{ backgroundColor: `var(--color-${hue}-${shade})` }}
                                                                title={`${hue}-${shade}`}
                                                            >
                                                                {isSelected && <Check className={`w-3 h-3 md:w-4 md:h-4 ${shade > 400 ? "text-white" : "text-black"}`} strokeWidth={3}/>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Window>
    );
};
