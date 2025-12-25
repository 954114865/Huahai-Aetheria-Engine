
import React, { useRef, useEffect, useState } from 'react';
import { Button } from './Button';
import { Check, Clock } from 'lucide-react';
import { Window } from './Window';

interface WorldTimePickerProps {
    initialTime: string; // YYYY:MM:DD:HH:MM:SS
    onConfirm: (timeStr: string) => void;
    onCancel: () => void;
}

const ScrollColumn: React.FC<{
    label: string;
    range: number;
    min?: number;
    value: number;
    onChange: (val: number) => void;
}> = ({ label, range, min = 0, value, onChange }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const itemHeight = 40; // Height of each item in pixels

    // Generate array from min to min+range-1
    const items = Array.from({ length: range }, (_, i) => i + min);

    // Handle Scroll to update value
    const handleScroll = () => {
        if (scrollRef.current) {
            const scrollTop = scrollRef.current.scrollTop;
            const index = Math.round(scrollTop / itemHeight);
            // Index maps to items[index] which is (min + index)
            const selectedValue = min + index;
            
            if (selectedValue !== value) {
                // Clamp
                const clampedIndex = Math.max(0, Math.min(range - 1, index));
                const finalValue = min + clampedIndex;
                if (finalValue !== value) onChange(finalValue);
            }
        }
    };

    // Initial scroll position
    useEffect(() => {
        if (scrollRef.current) {
            const index = value - min;
            scrollRef.current.scrollTop = index * itemHeight;
        }
    }, [value, min]); // Update if value changed externally

    return (
        <div className="flex flex-col items-center w-14">
            <span className="text-[10px] text-muted uppercase font-bold mb-1">{label}</span>
            <div className="relative h-40 w-full bg-surface-highlight border-y border-border overflow-hidden rounded">
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
                            {i.toString().padStart(2, '0')}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const WorldTimePicker: React.FC<WorldTimePickerProps> = ({ initialTime, onConfirm, onCancel }) => {
    const parse = (str: string) => {
        const parts = str.split(/[:\-\/ ]/).map(s => parseInt(s, 10));
        return {
            y: parts[0] || 2077,
            m: parts[1] || 1,
            d: parts[2] || 1,
            h: parts[3] || 0,
            min: parts[4] || 0,
            s: parts[5] || 0
        };
    };

    const [val, setVal] = useState(parse(initialTime));

    const handleConfirm = () => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        // Standardize output format
        const str = `${val.y}:${pad(val.m)}:${pad(val.d)}:${pad(val.h)}:${pad(val.min)}:${pad(val.s)}`;
        onConfirm(str);
    };

    return (
        <Window
            title={<span className="flex items-center gap-2"><Clock size={16}/> 设定触发时间点</span>}
            onClose={onCancel}
            maxWidth="max-w-lg"
            height="h-auto"
            zIndex={200}
            noPadding={true}
            footer={
                <div className="flex justify-between items-center w-full">
                    <div className="text-xs text-muted font-mono">
                        {val.y}:{val.m.toString().padStart(2,'0')}:{val.d.toString().padStart(2,'0')}:{val.h.toString().padStart(2,'0')}:{val.min.toString().padStart(2,'0')}:{val.s.toString().padStart(2,'0')}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={onCancel} size="sm">取消</Button>
                        <Button onClick={handleConfirm} size="sm" className="bg-primary hover:bg-primary-hover">
                            <Check size={14} className="mr-1"/> 确认
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="p-6 flex justify-center gap-1 bg-surface-light">
                <div className="w-16">
                    <ScrollColumn label="年" min={2000} range={200} value={val.y} onChange={v => setVal({...val, y: v})} />
                </div>
                <ScrollColumn label="月" min={1} range={12} value={val.m} onChange={v => setVal({...val, m: v})} />
                <ScrollColumn label="日" min={1} range={31} value={val.d} onChange={v => setVal({...val, d: v})} />
                <div className="w-px bg-border mx-1 h-32 self-center"></div>
                <ScrollColumn label="时" min={0} range={24} value={val.h} onChange={v => setVal({...val, h: v})} />
                <ScrollColumn label="分" min={0} range={60} value={val.min} onChange={v => setVal({...val, min: v})} />
                <ScrollColumn label="秒" min={0} range={60} value={val.s} onChange={v => setVal({...val, s: v})} />
            </div>
        </Window>
    );
};
