
import React, { useState, useMemo } from 'react';
import { GameState, LogEntry } from '../../types';
import { Button } from '../ui/Button';
import { BookOpen, Trash2, CheckCircle, Flag, CornerDownRight, ChevronRight, ChevronDown } from 'lucide-react';
import { Window } from '../ui/Window';

interface StoryEditWindowProps {
    winId: number;
    state: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    closeWindow: (id: number) => void;
}

export const StoryEditWindow: React.FC<StoryEditWindowProps> = ({ winId, state, updateState, closeWindow }) => {
    const [expandedRound, setExpandedRound] = useState<number | null>(null);
    const [mark1, setMark1] = useState<number | null>(null);
    const [mark2, setMark2] = useState<number | null>(null);
    const [deleteStep, setDeleteStep] = useState(0);

    // Group logs by round
    const rounds = useMemo(() => {
        const groups = new Map<number, LogEntry[]>();
        state.world.history.forEach(log => {
            if (!groups.has(log.round)) {
                groups.set(log.round, []);
            }
            groups.get(log.round)?.push(log);
        });
        
        // Convert to array and sort descending
        const roundList = Array.from(groups.keys()).sort((a, b) => b - a).map(rNum => {
            const logs = groups.get(rNum) || [];
            // Find first meaningful content for preview
            const firstContent = logs.find(l => l.type === 'narrative' || l.type === 'action')?.content 
                || logs.find(l => l.type === 'system')?.content 
                || "(空)";
            
            return {
                roundNum: rNum,
                preview: firstContent,
                logs: logs
            };
        });
        
        return roundList;
    }, [state.world.history]);

    const handleMark = (rNum: number) => {
        if (mark1 === null) {
            setMark1(rNum);
        } else if (mark2 === null) {
            // Set mark2, ensure ordered visually if needed, but logic handles it
            setMark2(rNum);
        } else {
            // Both set. Replace logic based on position relative to existing marks.
            // Sort current marks
            const [min, max] = [mark1, mark2].sort((a, b) => a - b);
            
            if (rNum < max) {
                // "Before latter" -> Replace former (min)
                // New pair: rNum, max
                setMark1(rNum);
                setMark2(max);
            } else {
                // "After former" (rNum > min) -> Replace latter (max)
                // New pair: min, rNum
                setMark1(min);
                setMark2(rNum);
            }
        }
        // Reset delete confirm if selection changes
        setDeleteStep(0);
    };

    const isMarked = (rNum: number) => rNum === mark1 || rNum === mark2;
    
    const isSelected = (rNum: number) => {
        if (mark1 !== null && mark2 !== null) {
            const min = Math.min(mark1, mark2);
            const max = Math.max(mark1, mark2);
            return rNum >= min && rNum <= max;
        }
        return rNum === mark1 || rNum === mark2;
    };

    const getSelectionCount = () => {
        if (mark1 === null) return 0;
        if (mark2 === null) return 1;
        return Math.abs(mark1 - mark2) + 1;
    };

    const handleJump = (rNum: number) => {
        closeWindow(winId);
        // Defer scroll to allow window close render cycle
        setTimeout(() => {
            const el = document.getElementById(`round-start-${rNum}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                // Fallback: try finding first log of that round
                // We don't have log ID here easily without scanning logs again, 
                // but StoryLog uses stable IDs if generated correctly.
                // Assuming StoryLog generates `round-start-X` for system logs.
            }
        }, 100);
    };

    const handleDelete = () => {
        if (deleteStep === 0) {
            setDeleteStep(1);
            setTimeout(() => setDeleteStep(0), 3000); // Reset after 3s
            return;
        }

        if (mark1 === null) return;
        
        let min = mark1;
        let max = mark1;
        
        if (mark2 !== null) {
            min = Math.min(mark1, mark2);
            max = Math.max(mark1, mark2);
        }

        updateState(prev => {
            // 1. Filter history
            const newHistory = prev.world.history.filter(l => l.round < min || l.round > max);
            
            // 2. Reconcile Round State based on the *new* end of history
            let newRoundState = { ...prev.round };
            
            if (newHistory.length > 0) {
                const lastLog = newHistory[newHistory.length - 1];
                
                if (lastLog.snapshot) {
                    // Perfect restoration from snapshot
                    newRoundState = {
                        ...lastLog.snapshot,
                        isPaused: true, // Force pause to prevent chaos
                        autoAdvanceCount: 0 // Stop auto-play
                    };
                } else {
                    // Legacy fallback if snapshot missing
                    newRoundState = {
                        ...newRoundState,
                        roundNumber: lastLog.round,
                        turnIndex: lastLog.turnIndex,
                        activeCharId: undefined, // Reset active char to prevent stuck state
                        isPaused: true,
                        autoAdvanceCount: 0
                    };
                }
            } else {
                // Reset if history is completely cleared
                newRoundState = {
                    ...newRoundState,
                    roundNumber: 1,
                    turnIndex: 0,
                    phase: 'init',
                    currentOrder: [],
                    activeCharId: undefined,
                    isPaused: true,
                    autoAdvanceCount: 0
                };
            }

            return {
                ...prev,
                world: {
                    ...prev.world,
                    history: newHistory
                },
                round: newRoundState
            };
        });

        setMark1(null);
        setMark2(null);
        setDeleteStep(0);
        setExpandedRound(null);
    };

    const toggleExpand = (rNum: number) => {
        setExpandedRound(expandedRound === rNum ? null : rNum);
    };

    return (
        <Window
            title="故事编辑 (Story Editor)"
            icon={<BookOpen size={18}/>}
            onClose={() => closeWindow(winId)}
            maxWidth="max-w-4xl"
            height="h-[80vh]"
            zIndex={200}
            noPadding={true}
            disableContentScroll={true}
            footer={
                <div className="flex justify-between items-center w-full px-2">
                    <div className="text-xs text-muted">
                        已选择: <span className="font-bold text-primary">{getSelectionCount()}</span> 轮
                    </div>
                    <div className="flex gap-2">
                         <Button variant="secondary" onClick={() => { setMark1(null); setMark2(null); setDeleteStep(0); }}>取消选择</Button>
                         <Button 
                            onClick={handleDelete} 
                            disabled={mark1 === null}
                            variant={deleteStep === 1 ? 'danger' : 'secondary'}
                            className={`min-w-[100px] transition-all ${deleteStep === 1 ? 'animate-pulse' : ''}`}
                         >
                            {deleteStep === 1 ? <><Trash2 size={14} className="mr-1"/> 确认?</> : "删除选中"}
                         </Button>
                    </div>
                </div>
            }
        >
            <div className="flex flex-col h-full bg-surface-light/30">
                <div className="p-3 bg-surface border-b border-border text-xs text-muted shrink-0">
                    <p>点击「标记」选择起始和结束轮次，系统将自动选中中间所有轮次。</p>
                    <p className="text-[10px] text-primary mt-1 opacity-80">注意：删除最近的轮次将自动把游戏状态（时间、回合数等）回滚到剩余历史的最后时刻。</p>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                    {rounds.map(round => {
                        const selected = isSelected(round.roundNum);
                        const marked = isMarked(round.roundNum);
                        const expanded = expandedRound === round.roundNum;

                        return (
                            <div 
                                key={round.roundNum} 
                                className={`
                                    rounded-lg border transition-all overflow-hidden
                                    ${selected ? 'bg-primary/10 border-primary/50' : 'bg-surface border-border'}
                                `}
                            >
                                {/* Header */}
                                <div className="flex items-center p-2 gap-3">
                                    {/* Mark Toggle */}
                                    <button 
                                        onClick={() => handleMark(round.roundNum)}
                                        className={`
                                            w-8 h-8 flex items-center justify-center rounded transition-colors shrink-0
                                            ${marked ? 'bg-primary text-primary-fg shadow-sm' : 'bg-surface-highlight text-muted hover:text-body hover:bg-surface-light border border-border'}
                                        `}
                                        title={marked ? "取消标记" : "标记此轮"}
                                    >
                                        <Flag size={14} className={marked ? "fill-current" : ""}/>
                                    </button>

                                    {/* Info Area (Click to Expand) */}
                                    <div 
                                        className="flex-1 min-w-0 cursor-pointer group"
                                        onClick={() => toggleExpand(round.roundNum)}
                                    >
                                        <div className="flex justify-between items-center mb-0.5">
                                            <span className="text-xs font-bold text-highlight font-mono">Round {round.roundNum}</span>
                                            <div className="text-muted group-hover:text-primary transition-colors">
                                                {expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                                            </div>
                                        </div>
                                        <div className="text-[10px] text-muted truncate pr-2 opacity-80 group-hover:opacity-100">
                                            {round.preview}
                                        </div>
                                    </div>

                                    {/* Jump Button */}
                                    <button 
                                        onClick={() => handleJump(round.roundNum)}
                                        className="w-8 h-8 flex items-center justify-center rounded bg-surface-highlight hover:bg-accent-teal hover:text-white text-muted transition-colors shrink-0 border border-border"
                                        title="跳转到此轮"
                                    >
                                        <CornerDownRight size={14}/>
                                    </button>
                                </div>

                                {/* Expanded Content */}
                                {expanded && (
                                    <div className="border-t border-border/50 bg-black/10 p-2 space-y-1 animate-in slide-in-from-top-1">
                                        {round.logs.map(log => (
                                            <div key={log.id} className="text-[10px] text-muted flex gap-2">
                                                <span className="shrink-0 opacity-50 w-4 text-center">{log.turnIndex}</span>
                                                <span className="break-words line-clamp-2">{log.content}</span>
                                            </div>
                                        ))}
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
