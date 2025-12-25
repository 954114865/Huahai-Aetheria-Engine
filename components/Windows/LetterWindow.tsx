
import React, { useState } from 'react';
import { GameState, Character, DebugLog, LetterTemplate } from '../../types';
import { Button } from '../ui/Button';
import { X, Feather, Send, Clock, ArrowLeft } from 'lucide-react';
import { LetterComposer } from './LetterComposer';
import { LetterHistory } from './LetterHistory';
import { Window } from '../ui/Window';

interface LetterWindowProps {
    winId: number;
    charId: string;
    state: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    closeWindow: (id: number) => void;
    addDebugLog: (log: DebugLog) => void;
    addLog: (text: string, overrides?: any) => void; // Pass addLog for system notifications
}

type ViewMode = 'menu' | 'compose' | 'history';

export const LetterWindow: React.FC<LetterWindowProps> = ({ winId, charId, state, updateState, closeWindow, addDebugLog, addLog }) => {
    const [mode, setMode] = useState<ViewMode>('menu');
    const char = state.characters[charId];

    if (!char) return null;

    const handleSaveTemplate = (template: LetterTemplate) => {
        updateState(prev => {
            const saved = prev.appSettings.savedLetterTemplates || [];
            const existingIdx = saved.findIndex(t => t.id === template.id);
            let newSaved;
            if (existingIdx >= 0) {
                newSaved = [...saved];
                newSaved[existingIdx] = template;
            } else {
                newSaved = [...saved, template];
            }
            return {
                ...prev,
                appSettings: { ...prev.appSettings, savedLetterTemplates: newSaved }
            };
        });
    };

    const handleDeleteTemplate = (templateId: string) => {
        if (!confirm("确定删除此书信模板吗？")) return;
        updateState(prev => ({
            ...prev,
            appSettings: {
                ...prev.appSettings,
                savedLetterTemplates: (prev.appSettings.savedLetterTemplates || []).filter(t => t.id !== templateId)
            }
        }));
    };

    const getTitle = () => {
        if (mode === 'menu') return '书信';
        if (mode === 'compose') return '撰写书信';
        return '书信往来';
    };

    return (
        <Window
            title={
                <div className="flex items-center gap-2">
                    <Feather size={18} className="text-accent-teal"/> {getTitle()}
                    <span className="text-xs text-muted font-mono bg-surface px-2 py-0.5 rounded border border-border hidden sm:inline ml-2">
                        To: {char.name}
                    </span>
                </div>
            }
            onClose={() => closeWindow(winId)}
            maxWidth="max-w-4xl"
            height="h-[90vh]"
            disableContentScroll={true}
            noPadding={true}
            headerActions={
                mode !== 'menu' && (
                    <button onClick={() => setMode('menu')} className="text-muted hover:text-accent-teal mr-2 flex items-center gap-1 text-xs">
                        <ArrowLeft size={16}/> 返回菜单
                    </button>
                )
            }
        >
            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                
                {/* MENU MODE */}
                {mode === 'menu' && (
                    <div className="flex-1 w-full overflow-y-auto custom-scrollbar bg-surface-light">
                        <div className="flex flex-col items-center justify-center min-h-full gap-8 p-8 animate-in fade-in">
                            <div className="text-center space-y-2">
                                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto border-2 border-primary/20 mb-4">
                                    <Feather size={40} className="text-primary"/>
                                </div>
                                <h3 className="text-xl font-bold text-body">与 {char.name} 通信</h3>
                                <p className="text-sm text-muted max-w-xs mx-auto">
                                    发送自定义格式的书信以获取结构化信息，或查看历史回复。
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
                                <button 
                                    onClick={() => setMode('compose')}
                                    className="flex flex-col items-center gap-2 p-6 bg-surface hover:bg-surface-highlight border border-border hover:border-primary rounded-xl transition-all group"
                                >
                                    <Send size={32} className="text-muted group-hover:text-primary mb-2"/>
                                    <span className="font-bold text-body">发送书信</span>
                                    <span className="text-xs text-muted">撰写并定义返回格式</span>
                                </button>

                                <button 
                                    onClick={() => setMode('history')}
                                    className="flex flex-col items-center gap-2 p-6 bg-surface hover:bg-surface-highlight border border-border hover:border-primary rounded-xl transition-all group"
                                >
                                    <Clock size={32} className="text-muted group-hover:text-primary mb-2"/>
                                    <span className="font-bold text-body">查看历史</span>
                                    <span className="text-xs text-muted">浏览往来信件记录</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* COMPOSE MODE */}
                {mode === 'compose' && (
                    <LetterComposer 
                        char={char}
                        gameState={state}
                        updateState={updateState}
                        onSaveTemplate={handleSaveTemplate}
                        onDeleteTemplate={handleDeleteTemplate}
                        savedTemplates={state.appSettings.savedLetterTemplates || []}
                        addDebugLog={addDebugLog}
                        addLog={addLog}
                        onClose={() => closeWindow(winId)} // Pass close handler
                    />
                )}

                {/* HISTORY MODE */}
                {mode === 'history' && (
                    <LetterHistory 
                        char={char}
                        updateState={updateState}
                        addLog={addLog}
                    />
                )}

            </div>
        </Window>
    );
};
