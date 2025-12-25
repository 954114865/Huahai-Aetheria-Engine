
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Grid, FolderOpen, Pencil, Eraser, Trash2, Check, Download } from 'lucide-react';
import { Window } from '../ui/Window';
import { BUILT_IN_IMAGES, LibraryImage } from '../../assets/imageLibrary';
import { useGame } from '../../hooks/useGame';

interface IconLibraryWindowProps {
    onClose: () => void;
    onSelect: (dataUrl: string) => void;
    zIndex?: number;
}

// --- Pixel Editor Sub-Component ---
const PixelEditor: React.FC<{ 
    onSave: (dataUrl: string) => void, 
    onClose: () => void,
    targetResolution: number 
}> = ({ onSave, onClose, targetResolution }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [color, setColor] = useState('#ffffff');
    const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
    
    // Grid Configuration
    const [gridSize, setGridSize] = useState<16 | 32 | 64>(32); // Default logical grid
    const [gridData, setGridData] = useState<string[][]>([]);
    
    const [isDrawing, setIsDrawing] = useState(false);

    // Initialize Grid
    useEffect(() => {
        resetGrid(gridSize);
    }, [gridSize]);

    const resetGrid = (size: number) => {
        const newGrid = Array(size).fill(null).map(() => Array(size).fill('transparent'));
        setGridData(newGrid);
        drawCanvas(newGrid);
    };

    // Draw the grid data to the visual canvas
    const drawCanvas = (data: string[][]) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const size = data.length;
        const cellSize = canvas.width / size;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw Checkerboard Background
        ctx.fillStyle = '#1e293b'; // Base dark
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#334155'; // Lighter square
        for(let y=0; y<size; y++) {
            for(let x=0; x<size; x++) {
                if ((x+y)%2 === 0) ctx.fillRect(x*cellSize, y*cellSize, cellSize, cellSize);
            }
        }

        // Draw Pixels
        for(let y=0; y<size; y++) {
            for(let x=0; x<size; x++) {
                const cellColor = data[y][x];
                if (cellColor !== 'transparent') {
                    ctx.fillStyle = cellColor;
                    ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
                }
            }
        }

        // Draw Grid Lines (Overlay)
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for(let i=0; i<=size; i++) {
            ctx.moveTo(i*cellSize, 0); ctx.lineTo(i*cellSize, canvas.height);
            ctx.moveTo(0, i*cellSize); ctx.lineTo(canvas.width, i*cellSize);
        }
        ctx.stroke();
    };

    // Handle user input to update grid data
    const paint = (clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const x = Math.floor((clientX - rect.left) * scaleX / (canvas.width / gridSize));
        const y = Math.floor((clientY - rect.top) * scaleY / (canvas.height / gridSize));
        
        if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
            // Optimization: Only update if changed
            if (gridData[y][x] !== (tool === 'pencil' ? color : 'transparent')) {
                const newGrid = [...gridData];
                newGrid[y] = [...newGrid[y]];
                newGrid[y][x] = tool === 'pencil' ? color : 'transparent';
                setGridData(newGrid);
                requestAnimationFrame(() => drawCanvas(newGrid));
            }
        }
    };

    const handleCanvasEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
        paint(e.clientX, e.clientY);
    };

    const handleTouchEvent = (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (e.cancelable) e.preventDefault();
        const touch = e.touches[0];
        if (touch) {
            paint(touch.clientX, touch.clientY);
        }
    };

    const handleExport = () => {
        // Create a temporary canvas at the target HIGH resolution
        const outCanvas = document.createElement('canvas');
        outCanvas.width = targetResolution;
        outCanvas.height = targetResolution;
        const ctx = outCanvas.getContext('2d');
        
        if (ctx) {
            // Disable smoothing for pixel art look
            ctx.imageSmoothingEnabled = false;
            
            const pixelSize = targetResolution / gridSize;

            gridData.forEach((row, y) => {
                row.forEach((col, x) => {
                    if (col !== 'transparent') {
                        ctx.fillStyle = col;
                        // Use Math.ceil to avoid sub-pixel gaps
                        ctx.fillRect(x * pixelSize, y * pixelSize, Math.ceil(pixelSize), Math.ceil(pixelSize));
                    }
                });
            });
            onSave(outCanvas.toDataURL('image/png'));
        }
    };

    return (
        <div className="flex flex-col h-full gap-4 p-1">
            <div className="flex gap-2 p-2 bg-surface-highlight rounded border border-border items-center justify-between flex-wrap">
                 <div className="flex gap-2 items-center">
                     <div className="flex bg-surface rounded p-0.5 border border-border">
                         <button onClick={() => setTool('pencil')} className={`p-2 rounded ${tool === 'pencil' ? 'bg-primary text-primary-fg' : 'bg-transparent text-muted'}`} title="铅笔"><Pencil size={16}/></button>
                         <button onClick={() => setTool('eraser')} className={`p-2 rounded ${tool === 'eraser' ? 'bg-primary text-primary-fg' : 'bg-transparent text-muted'}`} title="橡皮擦"><Eraser size={16}/></button>
                     </div>
                     <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-8 rounded cursor-pointer bg-transparent border-none"/>
                     
                     <div className="h-6 w-px bg-border mx-1"></div>
                     
                     <div className="flex bg-surface rounded p-0.5 border border-border">
                         <button onClick={() => setGridSize(16)} className={`px-2 h-8 flex items-center justify-center rounded text-xs font-bold ${gridSize === 16 ? 'bg-surface-highlight text-body' : 'text-muted'}`}>16x</button>
                         <button onClick={() => setGridSize(32)} className={`px-2 h-8 flex items-center justify-center rounded text-xs font-bold ${gridSize === 32 ? 'bg-surface-highlight text-body' : 'text-muted'}`}>32x</button>
                         <button onClick={() => setGridSize(64)} className={`px-2 h-8 flex items-center justify-center rounded text-xs font-bold ${gridSize === 64 ? 'bg-surface-highlight text-body' : 'text-muted'}`}>64x</button>
                     </div>
                 </div>
                 <button onClick={() => resetGrid(gridSize)} className="text-danger-fg hover:bg-danger/20 p-2 rounded" title="清空画布"><Trash2 size={16}/></button>
            </div>
            
            <div className="flex-1 flex items-center justify-center bg-black/50 rounded border border-border relative overflow-hidden select-none">
                {/* 320x320 is the CSS display size, internal resolution matches state */}
                <canvas 
                    ref={canvasRef}
                    width={640} // Higher internal res for crisp rendering on high DPI
                    height={640}
                    className="w-[320px] h-[320px] cursor-crosshair touch-none border border-slate-700 shadow-lg image-pixelated"
                    style={{ imageRendering: 'pixelated' }}
                    onMouseDown={() => setIsDrawing(true)}
                    onMouseUp={() => setIsDrawing(false)}
                    onMouseLeave={() => setIsDrawing(false)}
                    onMouseMove={(e) => isDrawing && handleCanvasEvent(e)}
                    onClick={handleCanvasEvent}
                    onTouchStart={(e) => { setIsDrawing(true); handleTouchEvent(e); }}
                    onTouchMove={(e) => { if(isDrawing) handleTouchEvent(e); }}
                    onTouchEnd={(e) => { setIsDrawing(false); if(e.cancelable) e.preventDefault(); }}
                />
            </div>
            
            <div className="flex justify-between items-center border-t border-border pt-2">
                <span className="text-[10px] text-muted">
                   输出尺寸: {targetResolution}x{targetResolution}px (自动适配设置)
                </span>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={onClose} size="sm">返回库</Button>
                    <Button onClick={handleExport} className="bg-success-base hover:bg-success-base/80" size="sm">
                        <Check size={14} className="mr-1"/> 完成绘制
                    </Button>
                </div>
            </div>
        </div>
    );
};

export const IconLibraryWindow: React.FC<IconLibraryWindowProps> = ({ onClose, onSelect, zIndex = 200 }) => {
    const { state } = useGame();
    const [mode, setMode] = useState<'presets' | 'draw'>('presets');
    const [selectedLibImg, setSelectedLibImg] = useState<LibraryImage | null>(null);
    const [userIcons, setUserIcons] = useState<LibraryImage[]>([]);

    // Determine target resolution from global settings (half of short edge)
    // Default to 896/2 = 448 if not set
    const maxShortEdge = state.appSettings.imageSettings?.maxShortEdge || 896;
    const targetResolution = Math.floor(maxShortEdge / 2);

    const handleSaveDrawing = (dataUrl: string) => {
        const newIcon: LibraryImage = {
            id: `user_${Date.now()}`,
            category: 'icon',
            label: '我的绘制',
            url: dataUrl
        };
        setUserIcons(prev => [...prev, newIcon]);
        // Auto select and confirm? Or just go back to library.
        // Let's go back to library and select it.
        setSelectedLibImg(newIcon);
        setMode('presets');
    };

    const confirmSelection = () => {
        if (selectedLibImg) {
            onSelect(selectedLibImg.url);
            onClose();
        }
    };

    return (
        <Window
            title={<span className="flex items-center gap-2"><Grid size={18}/> 图标库 (Icon Library)</span>}
            onClose={onClose}
            maxWidth="max-w-3xl"
            height="h-[600px] max-h-[90vh]"
            zIndex={zIndex} // Ensure it is above other modals
            noPadding={true}
            headerActions={
                <div className="flex bg-surface-highlight rounded p-0.5 border border-border shrink-0">
                    <button onClick={() => setMode('presets')} className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1 ${mode === 'presets' ? 'bg-primary text-primary-fg' : 'text-muted'}`}><FolderOpen size={12}/> 浏览</button>
                    <button onClick={() => setMode('draw')} className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1 ${mode === 'draw' ? 'bg-primary text-primary-fg' : 'text-muted'}`}><Pencil size={12}/> 绘制</button>
                </div>
            }
            footer={
               mode === 'presets' ? (
                    <div className="flex justify-between items-center w-full">
                        <div className="text-xs text-muted">
                            {selectedLibImg ? `已选: ${selectedLibImg.label}` : '请选择图片'}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={onClose}>取消</Button>
                            <Button onClick={confirmSelection} disabled={!selectedLibImg}>确认使用</Button>
                        </div>
                    </div>
               ) : null
            }
        >
            <div className="h-full p-4 overflow-y-auto bg-surface custom-scrollbar">
                {mode === 'presets' ? (
                    <div className="space-y-8">
                        {/* User Icons */}
                        {userIcons.length > 0 && (
                            <div className="bg-surface-light p-4 rounded-lg border border-border">
                                <h4 className="text-xs font-bold text-accent-teal uppercase mb-4 flex items-center gap-2"><FolderOpen size={14}/> 用户绘制 (User Created)</h4>
                                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
                                    {userIcons.map(img => (
                                        <div 
                                          key={img.id} 
                                          onClick={() => setSelectedLibImg(img)}
                                          className={`
                                              relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all group bg-black
                                              ${selectedLibImg?.id === img.id ? 'border-primary ring-2 ring-primary/50 shadow-lg scale-105' : 'border-border hover:border-highlight'}
                                          `}
                                        >
                                            <img src={img.url} className="w-full h-full object-cover pixelated" style={{ imageRendering: 'pixelated' }} alt={img.label}/>
                                            <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-center text-white py-0.5 truncate px-1">{img.label}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Default Icons */}
                        <div className="bg-surface-light p-4 rounded-lg border border-border">
                            <h4 className="text-xs font-bold text-muted uppercase mb-4 flex items-center gap-2"><FolderOpen size={14}/> 系统默认 (Built-in)</h4>
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
                                {BUILT_IN_IMAGES.map(img => (
                                    <div 
                                      key={img.id} 
                                      onClick={() => setSelectedLibImg(img)}
                                      className={`
                                          relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all group bg-black
                                          ${selectedLibImg?.id === img.id ? 'border-primary ring-2 ring-primary/50 shadow-lg scale-105' : 'border-border hover:border-highlight'}
                                      `}
                                    >
                                        <img src={img.url} className="w-full h-full object-cover pixelated" style={{ imageRendering: 'pixelated' }} alt={img.label}/>
                                        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-center text-white py-0.5 truncate px-1">{img.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center">
                        <PixelEditor 
                            onSave={handleSaveDrawing} 
                            onClose={() => setMode('presets')} 
                            targetResolution={targetResolution} 
                        />
                    </div>
                )}
            </div>
        </Window>
    );
};
