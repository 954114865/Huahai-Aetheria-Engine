
import React, { useState, useRef, useEffect } from 'react';
import { Button } from './Button';
import { Upload, Grid, Image as ImageIcon, Check, Pencil, Eraser, Trash2, FolderOpen } from 'lucide-react';
import { BUILT_IN_IMAGES, LibraryImage } from '../../assets/imageLibrary';
import { Window } from './Window';
import { useGame } from '../../hooks/useGame';

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  className?: string;
}

// --- Pixel Editor Component (Internal Content) ---
const PixelEditor: React.FC<{ onSave: (dataUrl: string) => void, onClose: () => void }> = ({ onSave, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [color, setColor] = useState('#ffffff');
    const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
    const [brushSize, setBrushSize] = useState<1 | 2 | 3>(1);
    const [grid, setGrid] = useState<string[][]>(Array(16).fill(Array(16).fill('transparent')));
    const [isDrawing, setIsDrawing] = useState(false);

    // Initialize grid state independently
    useEffect(() => {
        const newGrid = Array(16).fill(null).map(() => Array(16).fill('transparent'));
        setGrid(newGrid);
    }, []);

    const drawPixel = (cx: number, cy: number) => {
        const newGrid = grid.map(row => [...row]);
        
        let startOffset = 0;
        let endOffset = 0;

        if (brushSize === 1) { startOffset = 0; endOffset = 0; }
        else if (brushSize === 2) { startOffset = 0; endOffset = 1; }
        else if (brushSize === 3) { startOffset = -1; endOffset = 1; }

        for (let dy = startOffset; dy <= endOffset; dy++) {
            for (let dx = startOffset; dx <= endOffset; dx++) {
                const x = cx + dx;
                const y = cy + dy;
                if (x >= 0 && x < 16 && y >= 0 && y < 16) {
                    newGrid[y][x] = tool === 'pencil' ? color : 'transparent';
                }
            }
        }
        setGrid(newGrid);
    };

    const handleDraw = (clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const x = Math.floor((clientX - rect.left) * scaleX / 20); // 320 / 16 = 20px per block visual
        const y = Math.floor((clientY - rect.top) * scaleY / 20);
        
        drawPixel(x, y);
    };

    const handleCanvasEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
        handleDraw(e.clientX, e.clientY);
    };

    const handleTouchEvent = (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (e.cancelable) e.preventDefault();
        const touch = e.touches[0];
        if (touch) {
            handleDraw(touch.clientX, touch.clientY);
        }
    };

    const exportImage = () => {
        const outCanvas = document.createElement('canvas');
        outCanvas.width = 64;
        outCanvas.height = 64;
        const ctx = outCanvas.getContext('2d');
        if (ctx) {
            ctx.imageSmoothingEnabled = false;
            grid.forEach((row, y) => {
                row.forEach((col, x) => {
                    if (col !== 'transparent') {
                        ctx.fillStyle = col;
                        ctx.fillRect(x * 4, y * 4, 4, 4); // Scale 16x16 -> 64x64
                    }
                });
            });
            onSave(outCanvas.toDataURL('image/png'));
        }
    };

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="flex gap-2 p-2 bg-surface-highlight rounded border border-border items-center justify-between flex-wrap">
                 <div className="flex gap-2 items-center">
                     <div className="flex bg-surface rounded p-0.5 border border-border">
                         <button onClick={() => setTool('pencil')} className={`p-2 rounded ${tool === 'pencil' ? 'bg-primary text-primary-fg' : 'bg-transparent text-muted'}`} title="铅笔"><Pencil size={16}/></button>
                         <button onClick={() => setTool('eraser')} className={`p-2 rounded ${tool === 'eraser' ? 'bg-primary text-primary-fg' : 'bg-transparent text-muted'}`} title="橡皮擦"><Eraser size={16}/></button>
                     </div>
                     <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-8 rounded cursor-pointer bg-transparent border-none"/>
                     
                     <div className="h-6 w-px bg-border mx-1"></div>
                     
                     <div className="flex bg-surface rounded p-0.5 border border-border">
                         <button onClick={() => setBrushSize(1)} className={`w-8 h-8 flex items-center justify-center rounded ${brushSize === 1 ? 'bg-surface-highlight text-body' : 'text-muted'}`} title="1x1">
                             <div className="w-1 h-1 bg-current"></div>
                         </button>
                         <button onClick={() => setBrushSize(2)} className={`w-8 h-8 flex items-center justify-center rounded ${brushSize === 2 ? 'bg-surface-highlight text-body' : 'text-muted'}`} title="2x2">
                             <div className="w-2 h-2 bg-current"></div>
                         </button>
                         <button onClick={() => setBrushSize(3)} className={`w-8 h-8 flex items-center justify-center rounded ${brushSize === 3 ? 'bg-surface-highlight text-body' : 'text-muted'}`} title="3x3">
                             <div className="w-3 h-3 bg-current"></div>
                         </button>
                     </div>
                 </div>
                 <button onClick={() => setGrid(Array(16).fill(null).map(() => Array(16).fill('transparent')))} className="text-danger-fg hover:bg-danger/20 p-2 rounded"><Trash2 size={16}/></button>
            </div>
            
            <div className="flex-1 flex items-center justify-center bg-black/50 rounded border border-border relative overflow-hidden select-none">
                <div 
                    className="grid grid-cols-16 w-[320px] h-[320px] border border-slate-600" 
                    style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(16, 1fr)',
                        gridTemplateRows: 'repeat(16, 1fr)',
                        backgroundImage: 'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
                        backgroundSize: '20px 20px',
                        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                    }}
                >
                    {grid.map((row, y) => row.map((cellColor, x) => (
                        <div 
                            key={`${x}-${y}`} 
                            style={{ backgroundColor: cellColor }} 
                            className="border-[0.5px] border-slate-700/20 pointer-events-none"
                        />
                    )))}
                </div>
                
                <canvas 
                    ref={canvasRef}
                    width={320}
                    height={320}
                    className="absolute w-[320px] h-[320px] cursor-crosshair opacity-0 touch-none"
                    style={{ touchAction: 'none' }}
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
            
            <div className="flex justify-end gap-2 border-t border-border pt-2">
                <Button variant="secondary" onClick={onClose}>返回</Button>
                <Button onClick={exportImage} className="bg-success-base hover:bg-success-base/80">保存图标</Button>
            </div>
        </div>
    );
};


export const ImageUploader: React.FC<ImageUploaderProps> = ({ value, onChange, className }) => {
  const { state } = useGame();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [mode, setMode] = useState<'library' | 'draw'>('library');
  const [selectedLibImg, setSelectedLibImg] = useState<LibraryImage | null>(null);

  // Simple in-memory session storage for user created icons
  const [userIcons, setUserIcons] = useState<LibraryImage[]>([]);

  // Check if native chooser override is enabled
  const useNativeChooser = state.appSettings.useNativeChooser || false;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate Type if using native chooser (since we force generic)
      if (useNativeChooser && !file.type.startsWith('image/')) {
          alert(`文件类型错误 (${file.type})。请选择图片文件。`);
          e.target.value = ''; // Reset input
          return;
      }
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        onChange(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const confirmLibrarySelection = () => {
      if (selectedLibImg) {
          onChange(selectedLibImg.url);
          setShowLibrary(false);
      }
  };
  
  const handleSaveDrawing = (dataUrl: string) => {
      const newIcon: LibraryImage = {
          id: `user_${Date.now()}`,
          category: 'icon',
          label: 'User Icon',
          url: dataUrl
      };
      setUserIcons(prev => [...prev, newIcon]);
      onChange(dataUrl);
      setShowLibrary(false);
      setMode('library');
  };

  return (
    <div className={`relative flex gap-4 items-center ${className}`}>
      
      {/* Hidden File Input */}
      {/* Key forces remount when mode changes. 
          If useNativeChooser is true, we SPREAD an empty object to REMOVE the accept attribute entirely. 
          Standard behavior preserves accept="image/*". */}
      <input 
        key={useNativeChooser ? 'native-chooser-mode' : 'standard-mode'}
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        {...(useNativeChooser ? {} : { accept: "image/*" })}
        onChange={handleFileChange}
      />
      
      {/* Preview Area */}
      <div 
        className="w-16 h-16 shrink-0 bg-surface-highlight rounded-lg overflow-hidden border-2 border-border group relative cursor-pointer hover:border-primary transition-colors"
        onClick={() => setShowLibrary(true)}
        title="点击打开图标库 / 编辑"
      >
        {value ? (
             <img src={value} className="w-full h-full object-cover pixelated" style={{ imageRendering: 'pixelated' }} alt="Preview" />
        ) : (
             <div className="w-full h-full flex items-center justify-center text-muted bg-surface">
                 <ImageIcon size={24}/>
             </div>
        )}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold transition-opacity">
            更换
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
          <Button 
            type="button" 
            variant="secondary" 
            size="sm"
            onClick={() => { setShowLibrary(true); setMode('library'); }}
            title="Open Built-in Library"
            className="flex items-center gap-2 w-32 justify-start"
          >
            <Grid size={14} /> 打开图库
          </Button>

          <Button 
            type="button" 
            variant="secondary" 
            size="sm"
            onClick={() => {
                if (fileInputRef.current) {
                    fileInputRef.current.value = ''; // Reset allows selecting same file again
                    fileInputRef.current.click();
                }
            }}
            title="Upload Local Image"
            className="flex items-center gap-2 w-32 justify-start"
          >
            <Upload size={14} /> 上传文件
          </Button>
      </div>

      {/* Library Modal using Window */}
      {showLibrary && (
          <Window
              title={<span className="flex items-center gap-2"><ImageIcon size={18}/> 图标库 (Icon Library)</span>}
              onClose={() => setShowLibrary(false)}
              maxWidth="max-w-2xl"
              height="h-[600px] max-h-[90vh]"
              zIndex={200} // High Z-Index to overlap other windows
              noPadding={true}
              headerActions={
                  <div className="flex bg-surface-highlight rounded p-0.5 border border-border shrink-0">
                      <button onClick={() => setMode('library')} className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1 ${mode === 'library' ? 'bg-primary text-primary-fg' : 'text-muted'}`}><FolderOpen size={12}/> 浏览</button>
                      <button onClick={() => setMode('draw')} className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1 ${mode === 'draw' ? 'bg-primary text-primary-fg' : 'text-muted'}`}><Pencil size={12}/> 绘制</button>
                  </div>
              }
              footer={
                 mode === 'library' ? (
                      <div className="flex justify-between items-center w-full">
                          <div className="text-xs text-muted">
                              {selectedLibImg ? `已选: ${selectedLibImg.label}` : '请选择图片'}
                          </div>
                          <div className="flex gap-2">
                              <Button variant="secondary" onClick={() => setShowLibrary(false)}>取消</Button>
                              <Button onClick={confirmLibrarySelection} disabled={!selectedLibImg}>确认使用</Button>
                          </div>
                      </div>
                 ) : null
              }
          >
              <div className="h-full p-4 overflow-y-auto bg-surface custom-scrollbar">
                  {mode === 'library' ? (
                      <div className="space-y-8">
                          {/* User Icons */}
                          <div className="bg-surface-light p-4 rounded-lg border border-border">
                              <h4 className="text-xs font-bold text-accent-teal uppercase mb-4 flex items-center gap-2"><FolderOpen size={14}/> 用户创建 (User Created)</h4>
                              {userIcons.length === 0 ? (
                                  <div className="text-xs text-muted italic p-4 text-center border border-dashed border-border rounded">暂无自制图标。请使用“绘制”功能创建。</div>
                              ) : (
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
                              )}
                          </div>

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
                          <PixelEditor onSave={handleSaveDrawing} onClose={() => setMode('library')} />
                      </div>
                  )}
              </div>
          </Window>
      )}
    </div>
  );
};
