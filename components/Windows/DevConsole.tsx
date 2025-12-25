
import React, { useState, useMemo } from 'react';
import { DebugLog } from '../../types';
import { X, Terminal, MessageSquare, ChevronRight, ChevronDown, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface DevConsoleProps {
    logs: DebugLog[];
    onClose: () => void;
}

export const DevConsole: React.FC<DevConsoleProps> = ({ logs, onClose }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const renderContent = (content: any) => {
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content.map((part, i) => {
                if (typeof part === 'string') return part;
                if (part && typeof part === 'object') {
                    if ('text' in part) return part.text;
                    return JSON.stringify(part);
                }
                return String(part);
            }).join('');
        }
        if (content && typeof content === 'object') {
             if ('text' in content) return content.text;
             return JSON.stringify(content);
        }
        return String(content || "");
    };

    const formatPrompt = (prompt: string) => {
        try {
            // Attempt to parse as JSON to check if it's a structured message array
            const parsed = JSON.parse(prompt);
            if (Array.isArray(parsed)) {
                return (
                    <div className="flex flex-col gap-2 mt-1">
                        {parsed.map((msg: any, idx: number) => (
                            <div key={idx} className="flex flex-col border border-border rounded overflow-hidden text-[10px]">
                                <div className={`px-2 py-1 font-bold uppercase ${msg.role === 'system' ? 'bg-danger/20 text-danger-fg' : msg.role === 'model' || msg.role === 'assistant' ? 'bg-secondary/20 text-secondary-fg' : 'bg-primary/20 text-primary-fg'}`}>
                                    {msg.role}
                                </div>
                                <div className="p-2 bg-surface-highlight whitespace-pre-wrap text-muted font-mono break-all">
                                    {renderContent(msg.parts || msg.content)}
                                </div>
                            </div>
                        ))}
                    </div>
                );
            }
        } catch (e) {
            // Not JSON, return plain text
        }
        return <pre className="whitespace-pre-wrap text-muted font-mono text-xs break-all">{prompt}</pre>;
    };

    // Memoize the reversed logs to prevent unnecessary re-calculations on every render
    const displayLogs = useMemo(() => [...logs].reverse(), [logs]);

    return (
        <div className="absolute bottom-0 left-0 w-full h-[60vh] glass-panel border-t border-border shadow-2xl z-[100] flex flex-col font-mono text-body">
             <div className="flex justify-between items-center p-2 bg-surface-highlight border-b border-border shrink-0">
                 <div className="flex items-center gap-2 text-success-fg px-2">
                     <Terminal size={16} />
                     <span className="text-xs font-bold">Developer Console - Raw AI Logs</span>
                 </div>
                 <button onClick={onClose} className="text-muted hover:text-highlight p-1"><X size={16}/></button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-2 bg-surface-light/50 custom-scrollbar">
                 {displayLogs.length === 0 && <div className="text-muted italic text-xs text-center py-4">No interaction logs yet.</div>}
                 
                 {displayLogs.map((log) => {
                     const isExpanded = expandedId === log.id;
                     const isError = log.response.startsWith("Error") || log.response.includes("Validation Failed");
                     
                     return (
                     <div key={log.id} className={`border border-border rounded mb-1 bg-surface shadow-sm flex flex-col transition-all overflow-hidden ${isExpanded ? 'ring-1 ring-primary' : ''}`}>
                         {/* Header - Always Visible */}
                         <div 
                            className={`flex justify-between items-center p-2 cursor-pointer hover:bg-surface-highlight ${isExpanded ? 'bg-surface-highlight border-b border-border' : ''}`}
                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                         >
                             <div className="flex items-center gap-3 overflow-hidden">
                                 {isExpanded ? <ChevronDown size={14} className="text-muted shrink-0"/> : <ChevronRight size={14} className="text-muted shrink-0"/>}
                                 
                                 <div className="flex items-center gap-2 shrink-0">
                                     {isError ? <AlertCircle size={14} className="text-danger-fg"/> : <CheckCircle size={14} className="text-success-fg"/>}
                                     <span className={`text-xs font-bold ${isError ? 'text-danger-fg' : 'text-primary'}`}>{log.characterName}</span>
                                 </div>
                                 
                                 <span className="text-[10px] text-muted flex items-center gap-1 shrink-0 font-mono">
                                     <Clock size={10}/> {new Date(log.timestamp).toLocaleTimeString()}
                                 </span>

                                 {!isExpanded && (
                                     <div className="text-[10px] text-muted truncate opacity-60 font-mono ml-2">
                                         {log.response.substring(0, 100).replace(/\n/g, ' ')}...
                                     </div>
                                 )}
                             </div>
                             <span className="text-[9px] uppercase tracking-wider text-faint font-mono shrink-0 ml-2">{log.id}</span>
                         </div>
                         
                         {/* Body - Only Rendered when Expanded */}
                         {isExpanded && (
                             <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border h-[400px]">
                                 {/* Left: Prompt */}
                                 <div className="flex flex-col h-full min-h-0">
                                     <div className="p-2 bg-surface-highlight/50 text-primary font-bold text-[10px] uppercase tracking-wider flex items-center gap-2 border-b border-border shrink-0">
                                         <MessageSquare size={12}/> Prompt Context
                                     </div>
                                     <div className="flex-1 overflow-y-auto p-3 bg-surface-light/50 custom-scrollbar">
                                         {formatPrompt(log.prompt)}
                                     </div>
                                 </div>

                                 {/* Right: Response */}
                                 <div className="flex flex-col h-full min-h-0">
                                     <div className="p-2 bg-surface-highlight/50 text-secondary-fg font-bold text-[10px] uppercase tracking-wider border-b border-border shrink-0">
                                         Raw Response
                                     </div>
                                     <pre className={`flex-1 overflow-y-auto p-3 whitespace-pre-wrap font-mono text-xs bg-surface-light/50 custom-scrollbar ${isError ? 'text-danger-fg' : 'text-muted'}`}>
                                         {log.response}
                                     </pre>
                                 </div>
                             </div>
                         )}
                     </div>
                 )})}
             </div>
        </div>
    );
}
