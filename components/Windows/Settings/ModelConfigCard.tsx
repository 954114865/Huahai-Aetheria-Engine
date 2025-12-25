
import React from 'react';
import { AIConfig, Provider, ReasoningEffort } from '../../../types';
import { Button, Input, Label } from '../../ui/Button';
import { Lock, Wifi, FileText, RefreshCw, Brain } from 'lucide-react';

interface ModelConfigCardProps {
    title: string;
    icon: React.ReactNode;
    description: string;
    config: AIConfig;
    onChange: (newConfig: AIConfig) => void;
    onTest: (configName: string) => void;
    onContextEdit: () => void;
    isLocked: boolean; // Acts as isEditable
    testingConnectionName: string | null;
    configName: string; 
    onSync?: () => void; 
    providerDefaults: Record<string, string>;
    accentColorClass?: string; 
}

export const ModelConfigCard: React.FC<ModelConfigCardProps> = ({
    title,
    icon,
    description,
    config,
    onChange,
    onTest,
    onContextEdit,
    isLocked,
    testingConnectionName,
    configName,
    onSync,
    providerDefaults,
    accentColorClass = "text-muted"
}) => {
    
    const cycleReasoning = () => {
        const cycle: ReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];
        const current = config.reasoningEffort || 'minimal';
        const nextIdx = (cycle.indexOf(current) + 1) % cycle.length;
        onChange({ ...config, reasoningEffort: cycle[nextIdx] });
    };

    const getReasoningStyle = (eff: ReasoningEffort) => {
        switch(eff) {
            case 'low': return 'bg-red-500/20 text-red-500 border-red-500/50';
            case 'medium': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50';
            case 'high': return 'bg-emerald-500/20 text-emerald-500 border-emerald-500/50';
            default: return 'bg-surface-light text-muted border-border';
        }
    };
    
    const getReasoningLabel = (eff: ReasoningEffort) => {
        switch(eff) {
            case 'low': return '低';
            case 'medium': return '中';
            case 'high': return '高';
            default: return '无';
        }
    };

    const currentEffort = config.reasoningEffort || 'minimal';

    return (
        <div className="bg-surface-highlight/30 p-4 rounded border border-border">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <Label className={`${accentColorClass} mb-1 flex items-center gap-2`}>
                        {icon} {title}
                        {!isLocked && <Lock size={12} className="text-muted"/>}
                    </Label>
                    <p className="text-xs text-muted">{description}</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onTest(configName)}
                        className="text-xs h-8 flex items-center gap-1"
                        disabled={!isLocked || testingConnectionName === configName}
                        title="发送测试消息"
                    >
                        <Wifi size={12} className={testingConnectionName === configName ? "animate-ping" : ""} /> 
                        <span className="hidden sm:inline">{testingConnectionName === configName ? "Testing..." : "连接测试"}</span>
                    </Button>
                    <Button 
                        size="sm" 
                        variant="secondary" 
                        onClick={onContextEdit} 
                        className="text-xs h-8 flex items-center gap-1"
                        disabled={!isLocked}
                        title={!isLocked ? "需解锁开发者模式" : "编辑模型专属上下文"}
                    >
                        <FileText size={12}/> <span className="hidden sm:inline">模型上下文</span>
                    </Button>
                    {onSync && (
                        <Button 
                            size="sm" 
                            variant="secondary" 
                            onClick={onSync} 
                            title="将此配置应用为全局默认并覆盖所有角色" 
                            className="text-xs h-8 flex items-center gap-1"
                            disabled={!isLocked}
                        >
                            <RefreshCw size={12}/> <span className="hidden sm:inline">强制应用到所有角色</span>
                        </Button>
                    )}
                </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <Label>Provider</Label>
                    <select 
                        className="w-full bg-surface border border-border rounded px-2 py-2 text-sm text-body disabled:opacity-50 disabled:cursor-not-allowed"
                        value={config.provider}
                        onChange={e => {
                            const newProvider = e.target.value as Provider;
                            onChange({
                                ...config, 
                                provider: newProvider,
                                model: providerDefaults[newProvider] || '' 
                            });
                        }}
                        disabled={!isLocked}
                    >
                        <option value={Provider.XAI}>xAI (Grok)</option>
                        <option value={Provider.GEMINI}>Google Gemini</option>
                        <option value={Provider.VOLCANO}>Volcengine</option>
                        <option value={Provider.OPENROUTER}>OpenRouter</option>
                        <option value={Provider.OPENAI}>OpenAI</option>
                        <option value={Provider.CLAUDE}>Anthropic (Claude)</option>
                    </select>
                </div>
                <div>
                    <Label>Model Name / Endpoint ID</Label>
                    <Input 
                        value={config.model || ''} 
                        onChange={e => onChange({...config, model: e.target.value})} 
                        placeholder={providerDefaults[config.provider] || "e.g. grok-beta"} 
                        disabled={!isLocked}
                    />
                </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                <div className="w-full sm:flex-1">
                    <Label>Temperature (创意度)</Label>
                    <div className="flex items-center gap-3">
                        <input 
                            type="range" 
                            min="0" max="2" step="0.1"
                            className="flex-1 accent-primary disabled:opacity-50"
                            value={config.temperature ?? 1.0}
                            onChange={e => onChange({...config, temperature: parseFloat(e.target.value) || 0})}
                            disabled={!isLocked}
                        />
                        <Input 
                            type="number" 
                            className="w-16 text-center h-8"
                            value={config.temperature ?? 1.0}
                            onChange={e => {
                                const val = parseFloat(e.target.value);
                                onChange({...config, temperature: isNaN(val) ? 0 : val});
                            }}
                            step="0.1"
                            disabled={!isLocked}
                        />
                    </div>
                </div>

                <div className="flex flex-row sm:flex-col items-center justify-between sm:justify-center gap-2 sm:gap-1 shrink-0 w-full sm:w-auto border-t sm:border-t-0 border-border/30 pt-3 sm:pt-0 mt-2 sm:mt-0">
                    <Label className="text-xs sm:text-[10px] mb-0 sm:mb-1">思考强度 (Reasoning)</Label>
                    <button
                        onClick={cycleReasoning}
                        disabled={!isLocked}
                        className={`h-8 w-20 sm:w-16 rounded border text-xs font-bold transition-all flex items-center justify-center gap-1 ${getReasoningStyle(currentEffort)} ${!isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-110 active:scale-95'}`}
                        title="切换思考/推理强度 (Reasoning Effort)"
                    >
                        <Brain size={12}/>
                        {getReasoningLabel(currentEffort)}
                    </button>
                </div>
            </div>
        </div>
    );
};
