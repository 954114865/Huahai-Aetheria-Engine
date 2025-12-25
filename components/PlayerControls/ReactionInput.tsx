
import React, { useRef, useEffect } from 'react';
import { GameState } from '../../types';
import { Button, TextArea } from '../ui/Button';
import { AlertCircle, MessageSquare } from 'lucide-react';
import { LogEntry } from '../../types';

interface ReactionInputProps {
    reactionRequest: {
        isOpen: boolean;
        message: string;
        title: string;
        charId: string;
        resolve: (response: string | null) => void;
    };
    state: GameState;
    playerInput: string;
    setPlayerInput: (val: string) => void;
    onRespondToReaction?: (response: string | null) => void;
    onAddLog?: (text: string, overrides?: Partial<LogEntry>) => void;
}

export const ReactionInput: React.FC<ReactionInputProps> = ({ 
    reactionRequest, state, playerInput, setPlayerInput, onRespondToReaction, onAddLog 
}) => {
    const reactorName = state.characters[reactionRequest.charId]?.name || "未知角色";
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const isWindowsDesktop = () => {
        const ua = navigator.userAgent;
        return !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    };

    // Auto Focus
    useEffect(() => {
        if (isWindowsDesktop()) {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        }
    }, [reactionRequest]);
    
    const handleReactionSubmit = () => {
        if (onRespondToReaction) {
            // Allow empty input -> defaults to empty string which means "No Action" in logs
            const responseText = playerInput.trim();
            onRespondToReaction(responseText);
            setPlayerInput(""); 
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!isWindowsDesktop()) return;

        // Enter to Send
        if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            // Allow submission even if empty
            handleReactionSubmit();
        }
        // Ctrl+Enter to Newline
        else if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            const target = e.target as HTMLTextAreaElement;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const val = target.value;
            const newVal = val.substring(0, start) + "\n" + val.substring(end);
            setPlayerInput(newVal);
            // Move cursor after update
            setTimeout(() => {
                target.selectionStart = target.selectionEnd = start + 1;
            }, 0);
        }
    };

    return (
        <div className="min-h-[180px] bg-surface border-t border-warning-base/30 flex flex-col shadow-[0_-4px_20px_rgba(var(--warning-base),0.1)] relative z-10 animate-in slide-in-from-bottom-2 text-body">
            <div className="bg-warning-base/10 border-b border-warning-base/30 p-2 flex items-start gap-2">
                <AlertCircle size={16} className="text-warning-fg shrink-0 mt-0.5"/>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-warning-fg uppercase tracking-wider">需要反应 (Reaction Needed)</span>
                        <span className="text-[10px] text-warning-fg/70 font-mono">[{reactorName}]</span>
                    </div>
                    <p className="text-xs text-body leading-relaxed bg-surface-light p-2 rounded border border-border whitespace-pre-wrap max-h-20 overflow-y-auto">
                        {reactionRequest.message}
                    </p>
                </div>
            </div>

            <div className="flex-1 p-2 flex gap-2 items-start">
                <TextArea 
                    ref={inputRef}
                    className="flex-1 h-full min-h-[60px] rounded-lg p-2 text-xs focus:ring-2 focus:ring-warning-base outline-none resize-none bg-surface-light border-warning-base/30 text-body"
                    placeholder={`输入 ${reactorName} 的反应台词或行动描述... `}
                    value={playerInput}
                    onChange={e => setPlayerInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus={isWindowsDesktop()}
                />
                <Button 
                    className="h-full min-h-[60px] w-20 bg-warning-base hover:bg-warning-hover flex flex-col gap-1 justify-center items-center border-transparent text-white shadow-lg"
                    onClick={handleReactionSubmit}
                    disabled={false}
                >
                    <MessageSquare size={16} className="fill-current"/>
                    <span className="text-[10px] font-bold">提交</span>
                </Button>
            </div>
        </div>
    );
};
