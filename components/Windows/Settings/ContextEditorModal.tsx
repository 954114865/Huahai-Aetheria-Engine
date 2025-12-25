
import React, { useState, useRef } from 'react';
import { GlobalContextMessage } from '../../../types';
import { Button, TextArea, Label } from '../../ui/Button';
import { Trash, Plus, FileText, GripVertical, ArrowDown, ChevronRight, ChevronDown, Check, Copy, Clipboard, CheckCircle, AlertCircle } from 'lucide-react';
import { Window } from '../../ui/Window';

interface ContextEditorModalProps {
    title: string;
    messages: GlobalContextMessage[];
    onMessagesChange: (msgs: GlobalContextMessage[]) => void;
    onClose: () => void;
}

export const ContextEditorModal: React.FC<ContextEditorModalProps> = ({ title, messages, onMessagesChange, onClose }) => {
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null); // Track expanded item
    
    // Import/Export State
    const [importStr, setImportStr] = useState("");
    const [showCopied, setShowCopied] = useState(false);
    const [clearConfirm, setClearConfirm] = useState(false);

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const handleUpdate = (idx: number, field: keyof GlobalContextMessage, val: any) => {
        const newMsgs = [...messages];
        newMsgs[idx] = { ...newMsgs[idx], [field]: val };
        onMessagesChange(newMsgs);
    };

    const handleAdd = () => {
        const newIdx = messages.length;
        // Default role is now 'model' (Assistant) instead of 'system'
        onMessagesChange([...messages, { role: 'model', content: '' }]);
        setExpandedIndex(newIdx); // Auto expand new item
    };
    
    // Insert empty after specific index
    const handleInsertAfter = (idx: number) => {
        const newMsgs = [...messages];
        // Default role is now 'model' (Assistant)
        newMsgs.splice(idx + 1, 0, { role: 'model', content: '' });
        onMessagesChange(newMsgs);
        setExpandedIndex(idx + 1); // Auto expand new item
    };

    const handleRemove = (idx: number) => {
        onMessagesChange(messages.filter((_, i) => i !== idx));
        if (expandedIndex === idx) setExpandedIndex(null);
    };

    // --- IO Functions ---
    const handleExport = () => {
        const text = messages.map(msg => {
            // Map 'model' to 'assistant' for export format readability
            const tag = msg.role === 'model' ? 'assistant' : msg.role;
            return `<${tag}>\n${msg.content.trim()}\n</${tag}>`;
        }).join('\n\n');
        navigator.clipboard.writeText(text);
        setShowCopied(true);
        setTimeout(() => setShowCopied(false), 2000);
    };

    const parseImportString = (str: string): GlobalContextMessage[] => {
        // Regex to capture tags: <user>...</user>, <assistant>...</assistant>, <system>...</system>
        // Support 'model' tag as alias for assistant just in case
        const regex = /<(user|model|assistant|system)>([\s\S]*?)<\/\1>/gi;
        const newMsgs: GlobalContextMessage[] = [];
        let match;
        
        while ((match = regex.exec(str)) !== null) {
            let roleStr = match[1].toLowerCase();
            // Map 'assistant' back to internal 'model' type
            if (roleStr === 'assistant') roleStr = 'model';
            
            // Validate against allowed types
            if (roleStr === 'user' || roleStr === 'model' || roleStr === 'system') {
                 newMsgs.push({ role: roleStr as any, content: match[2].trim() });
            }
        }
        return newMsgs;
    };

    const handleImport = () => {
        if (!importStr.trim()) return;
        const newMsgs = parseImportString(importStr);
        
        if (newMsgs.length > 0) {
            // Append to existing
            onMessagesChange([...messages, ...newMsgs]);
            setImportStr("");
            alert(`成功导入 ${newMsgs.length} 条消息 (追加到底部)。`);
        } else {
            alert("未识别到有效格式的消息。请使用 <user>...</user> 等标签包裹内容。");
        }
    };

    const handleInsertImport = (idx: number) => {
        if (!importStr.trim()) {
            alert("请先在顶部文本框中粘贴要导入的内容。");
            return;
        }

        const newMsgs = parseImportString(importStr);
        
        if (newMsgs.length > 0) {
            const updatedMsgs = [...messages];
            // Insert after current index
            updatedMsgs.splice(idx + 1, 0, ...newMsgs);
            onMessagesChange(updatedMsgs);
            setImportStr("");
            // Auto expand the first inserted item
            setExpandedIndex(idx + 1); 
            // alert(`成功插入 ${newMsgs.length} 条消息。`);
        } else {
            alert("未识别到有效格式的消息。请确保格式如 <user>内容</user>。");
        }
    };

    const handleClear = () => {
        if (clearConfirm) {
            onMessagesChange([]);
            setClearConfirm(false);
        } else {
            setClearConfirm(true);
            setTimeout(() => setClearConfirm(false), 3000);
        }
    };

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent, index: number) => {
        dragItem.current = index;
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragEnter = (e: React.DragEvent, index: number) => {
        dragOverItem.current = index;
    };

    const handleDragEnd = () => {
        const draggedIdx = dragItem.current;
        const droppedIdx = dragOverItem.current;

        if (draggedIdx !== null && droppedIdx !== null && draggedIdx !== droppedIdx) {
            const newMsgs = [...messages];
            const itemToMove = newMsgs[draggedIdx];
            newMsgs.splice(draggedIdx, 1);
            newMsgs.splice(droppedIdx, 0, itemToMove);
            onMessagesChange(newMsgs);
            
            // Fix expanded index if moved
            if (expandedIndex === draggedIdx) setExpandedIndex(droppedIdx);
            else if (expandedIndex === droppedIdx && draggedIdx < droppedIdx) setExpandedIndex(expandedIndex - 1);
            else if (expandedIndex === droppedIdx && draggedIdx > droppedIdx) setExpandedIndex(expandedIndex + 1);
        }

        dragItem.current = null;
        dragOverItem.current = null;
        setDraggedIndex(null);
    };

    const getRoleColor = (role: string) => {
        if (role === 'system') return 'bg-danger/20 text-danger-fg border-danger/30';
        if (role === 'user') return 'bg-info/20 text-info-fg border-info/30';
        return 'bg-success/20 text-success-fg border-success/30';
    };

    return (
        <Window
            title={<span className="flex items-center gap-2"><FileText size={18} className="text-primary"/> {title}</span>}
            onClose={onClose}
            maxWidth="max-w-3xl"
            height="h-[85vh]"
            zIndex={200}
            noPadding={true}
            footer={
                <div className="flex justify-between w-full">
                     <Button size="sm" variant="secondary" onClick={handleAdd}><Plus size={14} className="mr-1"/> 添加消息 (底部)</Button>
                     <Button onClick={onClose}><Check size={14} className="mr-1"/> 完成</Button>
                </div>
            }
        >
            <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6">
                
                {/* 1. Staging Area (Now scrolls with content) */}
                <div className="mb-6">
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-end px-1">
                            <Label className="text-xs text-muted font-bold flex items-center gap-2">
                                <Clipboard size={14}/> 导入缓冲区
                            </Label>
                            <div className="text-[10px] text-muted flex items-center gap-1 opacity-70">
                                <AlertCircle size={10}/>
                                <span>XML 格式: <code>&lt;user&gt;</code>, <code>&lt;assistant&gt;</code>, <code>&lt;system&gt;</code></span>
                            </div>
                        </div>
                        
                        <TextArea 
                            className="w-full h-24 text-xs font-mono bg-black/20 border-border/50 focus:border-primary backdrop-blur-sm resize-y text-body placeholder:text-muted/50"
                            placeholder={'在此粘贴 XML 格式消息...\n示例:\n<system>你是一个助手。</system>\n<user>你好</user>'}
                            value={importStr}
                            onChange={e => setImportStr(e.target.value)}
                        />
                        
                        <div className="flex gap-2">
                            <Button size="sm" variant="secondary" onClick={handleImport} disabled={!importStr} className="flex-1 h-8 bg-surface/40 hover:bg-surface/60 border-border/50">
                                <Clipboard size={14} className="mr-1"/> 导入(追加)
                            </Button>
                            <Button size="sm" variant="secondary" onClick={handleExport} className="flex-1 h-8 bg-surface/40 hover:bg-surface/60 border-border/50">
                                {showCopied ? <CheckCircle size={14} className="text-success-fg"/> : <Copy size={14}/>} {showCopied ? "已复制" : "导出"}
                            </Button>
                            <Button 
                                size="sm" 
                                variant="danger" 
                                onClick={handleClear} 
                                className={`h-8 transition-all ${clearConfirm ? 'w-24 bg-danger text-white' : 'w-10 bg-surface/40 hover:bg-danger/20 text-muted hover:text-danger-fg border-border/50'}`}
                                title="清空列表"
                            >
                                {clearConfirm ? "确认?" : <Trash size={14}/>}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="border-b border-border/30 mb-6 mx-1"></div>

                {/* 2. Message List */}
                <div className="space-y-3 pb-4">
                    {messages.length === 0 && (
                        <div className="text-center text-muted text-xs italic py-12 border-2 border-dashed border-border/30 rounded-lg bg-surface/10">
                            暂无上下文消息。请使用上方工具栏导入或点击底部按钮添加。
                        </div>
                    )}
                    
                    {messages.map((msg, idx) => {
                        const isExpanded = expandedIndex === idx;
                        return (
                            <div 
                                key={idx} 
                                className={`
                                    bg-surface/40 backdrop-blur-md border rounded transition-all 
                                    ${draggedIndex === idx ? 'border-primary opacity-50' : isExpanded ? 'border-primary/50 ring-1 ring-primary/20 bg-surface/60' : 'border-border/50 hover:border-border hover:bg-surface/50'}
                                `}
                                draggable
                                onDragStart={(e) => handleDragStart(e, idx)}
                                onDragEnter={(e) => handleDragEnter(e, idx)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => e.preventDefault()}
                            >
                                {/* Header (Always Visible) */}
                                <div 
                                    className={`flex items-center gap-2 p-2 cursor-pointer select-none ${isExpanded ? 'border-b border-border/30' : ''}`}
                                    onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                                >
                                    {/* Drag Handle */}
                                    <div className="cursor-move text-muted hover:text-body px-1" title="拖拽排序" onClick={e => e.stopPropagation()}>
                                        <GripVertical size={14}/>
                                    </div>

                                    {/* Expand Icon */}
                                    <div className="text-muted">
                                        {isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                                    </div>

                                    {/* Role Badge */}
                                    <div className={`text-[9px] px-2 py-0.5 rounded border font-mono uppercase font-bold w-16 text-center ${getRoleColor(msg.role)}`}>
                                        {msg.role}
                                    </div>

                                    {/* Content Preview */}
                                    <div className="flex-1 min-w-0 text-xs text-body truncate font-mono opacity-80 pl-1">
                                        {msg.content || <span className="text-muted italic">(空内容)</span>}
                                    </div>

                                    {/* Actions (Always visible for quick access) */}
                                    <div className="flex gap-1 items-center pr-1" onClick={e => e.stopPropagation()}>
                                        <button 
                                            onClick={() => handleInsertImport(idx)} 
                                            className="text-muted hover:text-primary p-1.5 rounded hover:bg-white/5 border border-transparent hover:border-primary/30 transition-colors"
                                            title="从缓冲区插入到此处"
                                        >
                                            <Clipboard size={12}/>
                                        </button>
                                        <div className="w-px h-3 bg-border/50 mx-0.5"></div>
                                        <button 
                                            onClick={() => handleInsertAfter(idx)} 
                                            className="text-muted hover:text-success-fg p-1.5 rounded hover:bg-white/5 transition-colors"
                                            title="在下方插入空行"
                                        >
                                            <ArrowDown size={12}/>
                                        </button>
                                        <button 
                                            onClick={() => handleRemove(idx)} 
                                            className="text-muted hover:text-danger-fg p-1.5 rounded hover:bg-white/5 transition-colors"
                                            title="删除"
                                        >
                                            <Trash size={12}/>
                                        </button>
                                    </div>
                                </div>

                                {/* Body (Expandable) */}
                                {isExpanded && (
                                    <div className="p-3 animate-in slide-in-from-top-1 fade-in duration-200">
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted">角色 (Role):</span>
                                                <select
                                                    className="bg-black/20 border border-border/50 rounded px-2 py-1 text-xs text-body focus:border-primary outline-none cursor-pointer"
                                                    value={msg.role}
                                                    onChange={e => handleUpdate(idx, 'role', e.target.value)}
                                                >
                                                    <option value="user">User</option>
                                                    <option value="model">Assistant</option>
                                                    <option value="system">System</option>
                                                </select>
                                            </div>
                                            <TextArea
                                                className="min-h-[120px] resize-y font-mono text-xs w-full p-2 bg-black/20 border-border/50 focus:border-primary"
                                                value={msg.content}
                                                onChange={e => handleUpdate(idx, 'content', e.target.value)}
                                                placeholder="输入上下文内容..."
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </Window>
    );
};
