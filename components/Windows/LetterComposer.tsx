import React, { useState, useEffect } from 'react';
import { GameState, Character, LetterTemplate, LetterParagraph, LetterFragment, DebugLog, GameImage } from '../../types';
import { Button, Input, TextArea, Label } from '../ui/Button';
import { Plus, Trash2, Save, FileText, Send, Layout, Type, Loader2, Play, Info } from 'lucide-react';
import { generateLetter } from '../../services/aiService';
import { ImageAttachmentList } from '../ui/ImageAttachmentList';
import { ImageUploadModal } from '../Modals/ImageUploadModal';
import { useImageAttachments } from '../../hooks/useImageAttachments';

interface LetterComposerProps {
    char: Character;
    gameState: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    onSaveTemplate: (t: LetterTemplate) => void;
    onDeleteTemplate: (id: string) => void;
    savedTemplates: LetterTemplate[];
    addDebugLog: (log: DebugLog) => void;
    addLog: (text: string, overrides?: any) => void;
    onClose: () => void;
}

export const LetterComposer: React.FC<LetterComposerProps> = ({ 
    char, gameState, updateState, onSaveTemplate, onDeleteTemplate, savedTemplates, addDebugLog, addLog, onClose 
}) => {
    const [prompt, setPrompt] = useState("");
    const [templateName, setTemplateName] = useState("新书信格式");
    const [currentTemplateId, setCurrentTemplateId] = useState<string>("");
    const [paragraphs, setParagraphs] = useState<LetterParagraph[]>([
        {
            id: 'p1',
            key: 'main_content',
            label: '主要内容',
            separator: '\\t',
            fragments: [
                { id: 'f1', key: 'reply', label: '回复内容' }
            ]
        }
    ]);
    
    // Use the hook
    const { 
        images: attachedImages, 
        setImages: setAttachedImages, 
        addImage, 
        removeImage, 
        isModalOpen, 
        openModal, 
        closeModal,
        editingImage,
        editImage
    } = useImageAttachments();

    // Template Management
    const loadTemplate = (t: LetterTemplate) => {
        setCurrentTemplateId(t.id);
        setTemplateName(t.name);
        setPrompt(t.prompt);
        // Deep copy to avoid reference issues
        setParagraphs(JSON.parse(JSON.stringify(t.paragraphs)));
    };

    const saveCurrentTemplate = () => {
        const newTemplate: LetterTemplate = {
            id: currentTemplateId || `lt_${Date.now()}`,
            name: templateName,
            prompt,
            paragraphs
        };
        onSaveTemplate(newTemplate);
        setCurrentTemplateId(newTemplate.id);
        alert("模板已保存！");
    };

    const deleteCurrentTemplate = () => {
        if (currentTemplateId) {
            onDeleteTemplate(currentTemplateId);
            setCurrentTemplateId("");
            setTemplateName("新书信格式");
            // Optionally reset prompt/paragraphs
        }
    };

    // Editor Handlers
    const addParagraph = () => {
        setParagraphs([...paragraphs, {
            id: `p_${Date.now()}`,
            key: `para_${paragraphs.length + 1}`,
            label: `段落 ${paragraphs.length + 1}`,
            separator: '\\t',
            fragments: []
        }]);
    };

    const removeParagraph = (idx: number) => {
        setParagraphs(paragraphs.filter((_, i) => i !== idx));
    };

    const updateParagraph = (idx: number, field: keyof LetterParagraph, val: any) => {
        const newP = [...paragraphs];
        newP[idx] = { ...newP[idx], [field]: val };
        setParagraphs(newP);
    };

    const addFragment = (pIdx: number) => {
        const newP = [...paragraphs];
        newP[pIdx].fragments.push({
            id: `f_${Date.now()}`,
            key: `key_${newP[pIdx].fragments.length + 1}`,
            label: `字段 ${newP[pIdx].fragments.length + 1}`
        });
        setParagraphs(newP);
    };

    const removeFragment = (pIdx: number, fIdx: number) => {
        const newP = [...paragraphs];
        newP[pIdx].fragments = newP[pIdx].fragments.filter((_, i) => i !== fIdx);
        setParagraphs(newP);
    };

    const updateFragment = (pIdx: number, fIdx: number, field: keyof LetterFragment, val: any) => {
        const newP = [...paragraphs];
        newP[pIdx].fragments[fIdx] = { ...newP[pIdx].fragments[fIdx], [field]: val };
        setParagraphs(newP);
    };

    // Send Handler (Background)
    const handleSend = () => {
        if (!prompt.trim()) {
            alert("请填写书信内容 (提示词)。");
            return;
        }

        // 1. Close Window Immediately
        onClose();
        
        // 2. Add System Log indicating send
        addLog(`系统: 已向 [${char.name}] 发送书信，等待回信中...`, { type: 'system' });

        // 3. Construct snapshot
        const currentTemplate: LetterTemplate = {
            id: `temp_snap_${Date.now()}`,
            name: templateName,
            prompt: "", // Prompt is stored in MailItem separately
            paragraphs: paragraphs
        };

        // 4. Trigger Async Request
        generateLetter(
            char,
            currentTemplate,
            prompt,
            gameState,
            addDebugLog,
            attachedImages // Pass images to AI
        ).then(response => {
            if (response) {
                // Save to Mail History in Global State
                updateState(prev => {
                    const newChars = { ...prev.characters };
                    const targetChar = newChars[char.id];
                    if (targetChar) {
                        const newMail = {
                            id: `mail_${Date.now()}`,
                            timestamp: Date.now(),
                            charId: char.id,
                            templateSnapshot: currentTemplate,
                            userRequest: prompt,
                            responseRaw: JSON.stringify(response),
                            responseParsed: response,
                            intro: response.intro || undefined,
                            attachedImages: attachedImages.length > 0 ? attachedImages : undefined
                        };
                        targetChar.mailHistory = [newMail, ...(targetChar.mailHistory || [])];
                    }
                    return { ...prev, characters: newChars };
                });
                
                // Notify User
                addLog(`系统: 收到 1 封来自 [${char.name}] 的书信。`, { type: 'system' });
            } else {
                addLog(`系统: [${char.name}] 的书信回复失败 (无响应)。`, { type: 'system' });
            }
        }).catch(e => {
            console.error(e);
            addLog(`系统: 书信发送失败: ${e.message}`, { type: 'system' });
        });
    };

    return (
        <div className="flex h-full flex-col md:flex-row min-h-0">
            {(isModalOpen || editingImage) && (
                <ImageUploadModal 
                    onClose={closeModal} 
                    onConfirm={addImage}
                    initialImage={editingImage}
                />
            )}

            {/* Left: Editor */}
            <div className="flex-1 flex flex-col min-w-0 border-r border-border bg-surface/30 min-h-0">
                <div className="p-4 border-b border-border flex justify-between items-center bg-surface-highlight shrink-0">
                    <div className="flex items-center gap-2 flex-1">
                        <Input 
                            value={templateName} 
                            onChange={e => setTemplateName(e.target.value)} 
                            className="h-8 w-40 font-bold"
                            placeholder="模板名称"
                        />
                        <select 
                            className="bg-surface border border-border rounded h-8 text-xs text-muted px-2 outline-none focus:border-accent-teal max-w-[150px]"
                            onChange={(e) => {
                                const t = savedTemplates.find(st => st.id === e.target.value);
                                if (t) loadTemplate(t);
                            }}
                            value={currentTemplateId || ""}
                        >
                            <option value="">加载模板...</option>
                            {savedTemplates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                        <Button size="sm" variant="secondary" onClick={saveCurrentTemplate} title="保存当前格式为模板">
                            <Save size={14}/>
                        </Button>
                        {currentTemplateId && (
                            <Button size="sm" variant="secondary" onClick={deleteCurrentTemplate} title="删除当前模板" className="text-danger-fg hover:text-red-300">
                                <Trash2 size={14}/>
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                    {/* Prompt Section */}
                    <div>
                        <Label className="text-accent-teal mb-2 block">发信内容 / 提示词 (Prompt)</Label>
                        <TextArea 
                            className="h-32 text-sm bg-surface-light w-full mb-2" 
                            placeholder="在这里写下你想问的内容，或者给角色的指示..."
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                        />
                        <ImageAttachmentList 
                            images={attachedImages}
                            onRemove={removeImage}
                            onAdd={openModal}
                            onImageClick={editImage}
                            maxImages={4}
                        />
                    </div>

                    {/* Format Editor Section */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <Label className="text-accent-teal block">回信格式定义 (Structure)</Label>
                            <Button size="sm" variant="secondary" onClick={addParagraph}>
                                <Plus size={14} className="mr-1"/> 添加段落
                            </Button>
                        </div>

                        <div className="space-y-4">
                            {paragraphs.map((para, pIdx) => (
                                <div key={para.id} className="bg-surface-light border border-border rounded-lg p-3">
                                    <div className="flex gap-2 items-center mb-3 pb-2 border-b border-border">
                                        <Layout size={16} className="text-muted shrink-0"/>
                                        <Input 
                                            className="h-7 text-xs w-24 border-transparent hover:border-border focus:border-accent-teal bg-transparent shrink-0" 
                                            value={para.key} 
                                            onChange={e => updateParagraph(pIdx, 'key', e.target.value)} 
                                            placeholder="JSON Key"
                                        />
                                        <Input 
                                            className="h-7 text-xs flex-1 border-transparent hover:border-border focus:border-accent-teal bg-transparent font-bold min-w-0" 
                                            value={para.label} 
                                            onChange={e => updateParagraph(pIdx, 'label', e.target.value)} 
                                            placeholder="段落标题"
                                        />
                                        <div className="flex items-center gap-1 text-[10px] text-muted bg-surface px-2 rounded border border-border shrink-0" title="复制数据时的分隔符。支持: \t (Tab), , (Comma), | (Pipe) 等">
                                            <span>分隔符:</span>
                                            <Input 
                                                className="h-6 w-8 text-center text-xs p-0 border-none bg-transparent focus:ring-0" 
                                                value={para.separator} 
                                                onChange={e => updateParagraph(pIdx, 'separator', e.target.value)} 
                                                placeholder="\t"
                                            />
                                            <Info size={10} className="text-faint"/>
                                        </div>
                                        <button onClick={() => removeParagraph(pIdx)} className="text-muted hover:text-danger-fg shrink-0"><Trash2 size={14}/></button>
                                    </div>

                                    <div className="space-y-2 pl-2">
                                        {para.fragments.map((frag, fIdx) => (
                                            <div key={frag.id} className="flex gap-2 items-center">
                                                <Type size={14} className="text-faint ml-2 shrink-0"/>
                                                <Input 
                                                    className="h-7 text-xs w-24 bg-surface border-border focus:border-accent-teal shrink-0" 
                                                    value={frag.key} 
                                                    onChange={e => updateFragment(pIdx, fIdx, 'key', e.target.value)} 
                                                    placeholder="Field Key"
                                                />
                                                <Input 
                                                    className="h-7 text-xs flex-1 bg-surface border-border focus:border-accent-teal min-w-0" 
                                                    value={frag.label} 
                                                    onChange={e => updateFragment(pIdx, fIdx, 'label', e.target.value)} 
                                                    placeholder="显示标签 / 提示"
                                                />
                                                <button onClick={() => removeFragment(pIdx, fIdx)} className="text-muted hover:text-danger-fg p-1 shrink-0"><Trash2 size={12}/></button>
                                            </div>
                                        ))}
                                        <Button size="sm" variant="ghost" onClick={() => addFragment(pIdx)} className="text-xs text-muted hover:text-accent-teal w-full justify-start pl-8">
                                            <Plus size={12} className="mr-1"/> 添加字段 (Fragment)
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-border bg-surface-highlight flex justify-end shrink-0">
                    <Button onClick={handleSend} className="bg-success-base hover:bg-success-base/80 font-bold px-6">
                        <Send size={16} className="mr-2"/> 发送书信 (后台)
                    </Button>
                </div>
            </div>

            {/* Right: Preview (Responsive: stacked on mobile, side on desktop) */}
            <div className="w-full md:w-64 bg-surface-light flex flex-col p-4 border-t md:border-t-0 md:border-l border-border shrink-0 h-48 md:h-auto overflow-hidden">
                <Label className="text-muted mb-4">格式预览 (Preview)</Label>
                <div className="flex-1 overflow-y-auto space-y-4 opacity-70 custom-scrollbar">
                    <div className="border border-border rounded p-2 border-dashed">
                        <div className="text-xs font-bold text-accent-teal mb-1">Intro (寒暄)</div>
                        <div className="text-[10px] text-muted">AI 将在此处生成一段非结构化的回复/开场白。</div>
                    </div>
                    {paragraphs.map(p => (
                        <div key={p.id} className="border border-border rounded p-2">
                            <div className="text-xs font-bold text-body mb-2 border-b border-border pb-1">{p.label}</div>
                            <div className="grid grid-cols-1 gap-1">
                                {p.fragments.map(f => (
                                    <div key={f.id} className="text-[10px] text-muted bg-surface-highlight p-1 rounded flex justify-between">
                                        <span>{f.label}</span>
                                        <span className="font-mono text-faint">[{f.key}]</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="text-[10px] text-faint mt-4 hidden md:block">
                    AI 将按照此结构生成回复。您可以直接复制结果到 Excel。
                </div>
            </div>
        </div>
    );
};