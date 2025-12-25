
import React, { useState } from 'react';
import { Button, Input, Label } from '../ui/Button';
import { Lock, AlertTriangle } from 'lucide-react';
import { Window } from '../ui/Window';

interface PasswordChallengeModalProps {
    message: string;
    onConfirm: (pwd: string) => void;
    onCancel: () => void;
    expectedPassword?: string;
}

export const PasswordChallengeModal: React.FC<PasswordChallengeModalProps> = ({ 
    message, 
    onConfirm, 
    onCancel, 
    expectedPassword 
}) => {
    const [input, setInput] = useState("");
    const [error, setError] = useState("");

    const handleConfirm = () => {
        if (expectedPassword && input !== expectedPassword) {
            setError("密码错误 (Incorrect Password)");
            return;
        }
        setError("");
        onConfirm(input);
    };

    return (
        <Window
            title={<span className="flex items-center gap-2 text-danger-fg"><Lock size={18}/> 安全验证</span>}
            onClose={onCancel}
            maxWidth="max-w-md"
            height="h-auto"
            zIndex={200}
            noPadding={true}
        >
            <div className="p-6 flex flex-col gap-4">
                <div className="flex items-start gap-3 bg-surface-highlight/50 p-3 rounded border border-border">
                    <AlertTriangle size={20} className="text-warning-fg shrink-0 mt-0.5"/>
                    <div className="text-sm font-mono leading-relaxed text-body whitespace-pre-wrap">
                        {message}
                    </div>
                </div>

                <div>
                    <Label className="text-danger-fg">开发者密码 (Developer Password)</Label>
                    <Input 
                        type="password" 
                        autoFocus
                        placeholder="请输入密码..."
                        className={`border-danger/30 focus:border-danger ${error ? 'border-danger ring-1 ring-danger' : ''}`}
                        value={input}
                        onChange={(e) => { setInput(e.target.value); setError(""); }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleConfirm();
                        }}
                    />
                    {error && <div className="text-danger-fg text-xs font-bold mt-2 animate-pulse">{error}</div>}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="secondary" onClick={onCancel}>取消</Button>
                    <Button onClick={handleConfirm} className="bg-danger hover:bg-danger-hover text-white border-transparent">
                        验证
                    </Button>
                </div>
            </div>
        </Window>
    );
};
