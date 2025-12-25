
import React, { useState } from 'react';
import { Character, MailItem, GameState } from '../../types';
import { Copy, FileText, ChevronDown, ChevronRight, MessageSquareQuote, Mail, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';

interface LetterHistoryProps {
    char: Character;
    updateState: (updater: (current: GameState) => GameState) => void;
    addLog: (text: string) => void;
}

export const LetterHistory: React.FC<LetterHistoryProps> = ({ char, updateState, addLog }) => {
    const history = char.mailHistory || [];
    const [expandedId, setExpandedId] = useState<string | null>(history.length > 0 ? history[0].id : null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    const handleDelete = (mailId: string) => {
        if (deleteConfirmId === mailId) {
            updateState(prev => {
                const newChars = { ...prev.characters };
                const targetChar = newChars[char.id];
                if (targetChar && targetChar.mailHistory) {
                    targetChar.mailHistory = targetChar.mailHistory.filter(m => m.id !== mailId);
                }
                return { ...prev, characters: newChars };
            });
            setDeleteConfirmId(null);
            addLog(`系统: 已删除与 [${char.name}] 的一封书信记录。`);
        } else {
            setDeleteConfirmId(mailId);
            setTimeout(() => setDeleteConfirmId(prev => prev === mailId ? null : prev), 3000);
        }
    };

    const copyToClipboard = (mail: MailItem) => {
        let text = "";
        
        // Dynamic Copy: Iterate over actual parsed response keys
        Object.entries(mail.responseParsed).forEach(([sectionKey, sectionValue]) => {
            // Skip non-data fields
            if (sectionKey === 'intro' || sectionKey === '语言' || typeof sectionValue !== 'object' || sectionValue === null) {
                return;
            }

            // Try to find matching template definition for nice labels
            const templatePara = mail.templateSnapshot.paragraphs.find(p => p.key === sectionKey);
            const separator = templatePara 
                ? templatePara.separator.replace(/\\t/g, '\t').replace(/\\n/g, '\n') 
                : '\t'; // Default to tab for Excel compatibility
            
            const paraLabel = templatePara ? templatePara.label : sectionKey;

            // Prepare Keys and Values
            const keys = Object.keys(sectionValue);
            const values = Object.values(sectionValue);

            // Row 1: [Empty/Separator] [Field Label 1] [Field Label 2] ...
            // Allows column alignment when pasted
            const headerRow = separator + keys.map(k => {
                const frag = templatePara?.fragments.find(f => f.key === k);
                return frag ? frag.label : k;
            }).join(separator);

            // Row 2: [Paragraph Label] [Value 1] [Value 2] ...
            const dataRow = paraLabel + separator + values.map(v => {
                // Sanitize values: remove newlines within cells to maintain row integrity in simple CSV/TSV copy
                return String(v || "").replace(/[\r\n]+/g, " ");
            }).join(separator);
            
            text += headerRow + "\n" + dataRow + "\n";
        });

        if (!text.trim()) {
            alert("没有可复制的结构化数据。");
            return;
        }

        navigator.clipboard.writeText(text).then(() => {
            alert("已复制表格数据到剪贴板！\n您可以直接在 Excel 中按 Ctrl+V 粘贴，数据将自动分列对齐。");
        });
    };

    if (history.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-muted">
                <FileText size={48} className="mb-4 opacity-20"/>
                <p>暂无书信往来。</p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {history.map(mail => {
                const isExpanded = expandedId === mail.id;
                return (
                    <div key={mail.id} className="bg-surface border border-border rounded-lg overflow-hidden transition-all shadow-sm">
                        
                        {/* Header */}
                        <div 
                            className={`p-3 flex items-center justify-between cursor-pointer hover:bg-surface-highlight transition-colors ${isExpanded ? 'bg-surface-highlight border-b border-border' : ''}`}
                            onClick={() => toggleExpand(mail.id)}
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                {isExpanded ? <ChevronDown size={16} className="text-muted shrink-0"/> : <ChevronRight size={16} className="text-muted shrink-0"/>}
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-bold text-body truncate">{mail.userRequest.split('\n')[0].substring(0, 50)}...</span>
                                    <span className="text-[10px] text-muted font-mono">
                                        {new Date(mail.timestamp).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                            
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDelete(mail.id); }}
                                className={`p-1.5 rounded transition-all flex items-center justify-center shrink-0 ml-2 ${deleteConfirmId === mail.id ? 'bg-red-600 text-white w-16' : 'text-muted hover:text-danger-fg hover:bg-surface-light'}`}
                                title="删除记录"
                            >
                                {deleteConfirmId === mail.id ? <span className="text-[10px] font-bold">确认?</span> : <Trash2 size={14}/>}
                            </button>
                        </div>

                        {/* Content */}
                        {isExpanded && (
                            <div className="p-4 bg-surface-light animate-in slide-in-from-top-2">
                                {/* Prompt Review (Collapsible) */}
                                <div className="mb-4 bg-black/5 rounded border border-border overflow-hidden">
                                    <details className="group">
                                        <summary className="flex items-center justify-between p-2 cursor-pointer bg-surface/50 hover:bg-surface transition-colors select-none">
                                            <div className="flex items-center gap-2 text-[10px] text-accent-teal font-bold uppercase">
                                                <Mail size={12}/> 
                                                <span>你的信件</span>
                                            </div>
                                            <ChevronDown size={14} className="text-muted transition-transform group-open:rotate-180"/>
                                        </summary>
                                        <div className="p-3 border-t border-border animate-in fade-in slide-in-from-top-1">
                                            <p className="text-xs text-body whitespace-pre-wrap leading-relaxed">{mail.userRequest}</p>
                                        </div>
                                    </details>
                                </div>

                                {/* Conversational Intro */}
                                {mail.intro && (
                                    <div className="mb-4 p-3 bg-indigo-900/10 rounded border border-indigo-500/20">
                                        <div className="flex items-center gap-2 text-primary mb-1">
                                            <MessageSquareQuote size={14}/>
                                            <span className="text-[10px] font-bold uppercase">回复 (Intro)</span>
                                        </div>
                                        <p className="text-xs text-primary/80 whitespace-pre-wrap leading-relaxed font-serif italic">
                                            "{mail.intro}"
                                        </p>
                                    </div>
                                )}

                                {/* Structured Response (Dynamic Parsing) */}
                                <div className="space-y-4">
                                    {Object.entries(mail.responseParsed).map(([sectionKey, sectionValue]) => {
                                        // Filter out non-content keys
                                        if (sectionKey === 'intro' || sectionKey === '语言' || typeof sectionValue !== 'object' || sectionValue === null) {
                                            return null;
                                        }

                                        // Try to find matching template definition for nice labels
                                        const templatePara = mail.templateSnapshot.paragraphs.find(p => p.key === sectionKey);
                                        const sectionLabel = templatePara ? templatePara.label : sectionKey;
                                        const displayKey = templatePara ? `(${sectionKey})` : '(New Key)';

                                        return (
                                            <div key={sectionKey} className="border-l-2 border-accent-teal/30 pl-3">
                                                <h4 className="text-xs font-bold text-accent-teal mb-2">
                                                    {sectionLabel} <span className="text-[9px] text-muted font-mono font-normal">{displayKey}</span>
                                                </h4>
                                                
                                                {/* Grid View of Fields */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                    {Object.entries(sectionValue).map(([fieldKey, fieldValue]) => {
                                                        // Try to find matching fragment label
                                                        const templateFrag = templatePara?.fragments.find(f => f.key === fieldKey);
                                                        const fieldLabel = templateFrag ? templateFrag.label : fieldKey;

                                                        return (
                                                            <div key={fieldKey} className="bg-surface p-2 rounded border border-border flex flex-col">
                                                                <span className="text-[9px] text-muted mb-1 truncate" title={fieldKey}>{fieldLabel}</span>
                                                                <span className="text-xs text-body whitespace-pre-wrap break-words">{String(fieldValue || "N/A")}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Actions */}
                                <div className="mt-4 pt-3 border-t border-border flex justify-end gap-2">
                                    <Button size="sm" variant="secondary" onClick={() => copyToClipboard(mail)} className="text-xs">
                                        <Copy size={14} className="mr-2"/> 复制表格数据
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
