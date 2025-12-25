
import React, { useRef, useEffect, useState } from 'react';
import { Button } from './Button';
import { Check, Clock } from 'lucide-react';
import { Window } from './Window';

interface DurationPickerProps {
    initialDuration: { y: number, m: number, d: number, h: number, min: number, s: number };
    onConfirm: (duration: { y: number, m: number, d: number, h: number, min: number, s: number }) => void;
    onCancel: () => void;
}

const ScrollColumn: React.FC<{
    label: string;
    range: number;
    value: number;
    onChange: (val: number) => void;
}> = ({ label, range, value, onChange }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const itemHeight = 40; // Height of each item in pixels

    // Generate array 0 to range-1
    const items = Array.from({ length: range }, (_, i) => i);

    // Handle Scroll to update value
    const handleScroll = () => {
        if (scrollRef.current) {
            const scrollTop = scrollRef.current.scrollTop;
            const selectedIndex = Math.round(scrollTop / itemHeight);
            if (selectedIndex !== value) {
                // Clamp to valid range
                const clamped = Math.max(0, Math.min(range - 1, selectedIndex));
                if (clamped !== value) onChange(clamped);
            }
        }
    };

    // Initial scroll position
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = value * itemHeight;
        }
    }, []); // Run once on mount

    return (
        <div className="flex flex-col items-center w-14">
            <span className="text-[10px] text-muted uppercase font-bold mb-1">{label}</span>
            <div className="relative h-40 w-full bg-surface-highlight/50 border-y border-border overflow-hidden rounded">
                {/* Highlight Overlay */}
                <div className="absolute top-[40px] left-0 right-0 h-[40px] bg-primary/20 border-y border-primary/50 pointer-events-none z-10"></div>
                
                <div 
                    ref={scrollRef}
                    className="h-full overflow-y-scroll scrollbar-hide snap-y snap-mandatory"
                    onScroll={handleScroll}
                    style={{ paddingTop: '40px', paddingBottom: '40px' }} // Pad to center first/last
                >
                    {items.map(i => (
                        <div 
                            key={i} 
                            className={`h-[40px] flex items-center justify-center snap-center text-sm font-mono transition-colors ${i === value ? 'text-highlight font-bold scale-110' : 'text-muted'}`}
                        >
                            {i}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const DurationPicker: React.FC<DurationPickerProps> = ({ initialDuration, onConfirm, onCancel }) => {
    const [val, setVal] = useState(initialDuration);

    return (
        <Window
            title={<span className="flex items-center gap-2 text-primary"><Clock size={16}/> 设定本轮流逝时间</span>}
            onClose={onCancel}
            maxWidth="max-w-md"
            height="h-auto"
            zIndex={200}
            noPadding={true}
            footer={
                <div className="flex justify-end gap-2 w-full">
                    <Button variant="secondary" onClick={onCancel} size="sm">取消</Button>
                    <Button onClick={() => onConfirm(val)} size="sm" className="bg-primary hover:bg-primary-hover text-white">
                        <Check size={14} className="mr-1"/> 确认
                    </Button>
                </div>
            }
        >
            <div className="p-6 flex justify-center gap-1 bg-surface-light/30">
                <ScrollColumn label="年" range={100} value={val.y} onChange={v => setVal({...val, y: v})} />
                <ScrollColumn label="月" range={12} value={val.m} onChange={v => setVal({...val, m: v})} />
                <ScrollColumn label="日" range={31} value={val.d} onChange={v => setVal({...val, d: v})} />
                <div className="w-px bg-border mx-1 h-32 self-center"></div>
                <ScrollColumn label="时" range={24} value={val.h} onChange={v => setVal({...val, h: v})} />
                <ScrollColumn label="分" range={60} value={val.min} onChange={v => setVal({...val, min: v})} />
                <ScrollColumn label="秒" range={60} value={val.s} onChange={v => setVal({...val, s: v})} />
            </div>
        </Window>
    );
};
