
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input, Label } from '../ui/Button';
import { X, Upload, Check, Loader2, Image as ImageIcon, Trash2, Crop, Maximize2, Zap, Grid, RefreshCw, RotateCcw } from 'lucide-react';
import { processImage } from '../../services/imageUtils';
import { GameImage, ImageSettings } from '../../types';
import { useGame } from '../../hooks/useGame';
import { IconLibraryWindow } from '../Windows/IconLibraryWindow';

interface ImageUploadModalProps {
    onClose: () => void;
    onConfirm: (image: GameImage) => void;
    initialImage?: GameImage;
    initialUrl?: string; // New: Support direct URL string for avatars
}

const DEFAULT_SETTINGS: ImageSettings = {
    maxShortEdge: 896,
    maxLongEdge: 4480,
    compressionQuality: 0.8
};

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export const ImageUploadModal: React.FC<ImageUploadModalProps> = ({ onClose, onConfirm, initialImage, initialUrl }) => {
    const game = useGame();
    const imageSettings = game.state.appSettings.imageSettings || DEFAULT_SETTINGS;
    // Get Native Chooser setting
    const useNativeChooser = game.state.appSettings.useNativeChooser || false;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null); 
    const imgRef = useRef<HTMLImageElement>(null);
    const lastTouchDistance = useRef<number | null>(null);

    // Initialize source and preview. Source keeps the original full-res data.
    const [sourceUrl, setSourceUrl] = useState<string | null>(initialImage?.base64 || initialUrl || null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(initialImage?.base64 || initialUrl || null);
    
    const [description, setDescription] = useState(initialImage?.description || "");
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // High Quality Toggle (Default: Off to save tokens)
    const [isHighQualityMode, setIsHighQualityMode] = useState(false);

    // Library State
    const [showLibrary, setShowLibrary] = useState(false);

    // View State
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });

    // Crop Mode State
    const [isCropping, setIsCropping] = useState(false);
    const [pendingCropStart, setPendingCropStart] = useState(false);
    const [aspectRatio, setAspectRatio] = useState<number | null>(null); // null = Free
    
    // Coordinates relative to the container-left-top
    const [cropRect, setCropRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
    const [imgRect, setImgRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 }); // Cached displayed image rect
    
    // Resize State
    const [isResizing, setIsResizing] = useState(false);
    const resizeStart = useRef({ startX: 0, startY: 0, startRect: { x: 0, y: 0, w: 0, h: 0 }, dir: '' });

    // Internal function to calculate current visual rect of image
    const updateImgRect = () => {
        if (!containerRef.current || !imgRef.current) return;
        
        const imgBounds = imgRef.current.getBoundingClientRect();
        const containerBounds = containerRef.current.getBoundingClientRect();

        setImgRect({
            x: imgBounds.left - containerBounds.left,
            y: imgBounds.top - containerBounds.top,
            w: imgBounds.width,
            h: imgBounds.height
        });
    };

    // Update imgRect whenever view changes
    useEffect(() => {
        updateImgRect();
    }, [scale, position, previewUrl, isCropping]);

    // Internal function to calculate and set initial crop rect based on current view
    const initCropUI = () => {
        if (!containerRef.current || !imgRef.current) return;
        
        // 1. Get precise image dimensions on screen
        const imgBounds = imgRef.current.getBoundingClientRect();
        const containerBounds = containerRef.current.getBoundingClientRect();

        const currentImgRect = {
            x: imgBounds.left - containerBounds.left,
            y: imgBounds.top - containerBounds.top,
            w: imgBounds.width,
            h: imgBounds.height
        };

        setImgRect(currentImgRect);
        
        // Initial Crop = Centered square-ish or full image
        const initW = currentImgRect.w * 0.8;
        const initH = currentImgRect.h * 0.8;
        
        setCropRect({
            x: currentImgRect.x + (currentImgRect.w - initW) / 2,
            y: currentImgRect.y + (currentImgRect.h - initH) / 2,
            w: initW,
            h: initH
        });
        
        setAspectRatio(null); // Default to Free
        setIsCropping(true);
        setIsDragging(false);
    };

    // Reset view when image loads
    useEffect(() => {
        if (previewUrl && containerRef.current) {
            const img = new Image();
            img.onload = () => {
                const container = containerRef.current!;
                const scaleW = container.clientWidth / img.width;
                const scaleH = container.clientHeight / img.height;
                const fitScale = Math.min(scaleW, scaleH) * 0.9;
                setScale(fitScale);
                setPosition({ x: 0, y: 0 });
                
                // If we were waiting for the source image to load to start cropping
                if (pendingCropStart) {
                    setPendingCropStart(false);
                    // Defer slightly to allow DOM paint/transform update
                    setTimeout(initCropUI, 100);
                }
            };
            img.src = previewUrl;
        }
    }, [previewUrl]);

    // Handle Global Resize Moves (Crop Box)
    useEffect(() => {
        const handleWinMove = (e: MouseEvent | TouchEvent) => {
            if (isResizing && isCropping && containerRef.current) {
                e.preventDefault();
                e.stopPropagation();

                const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
                const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
                
                const deltaX = clientX - resizeStart.current.startX;
                const deltaY = clientY - resizeStart.current.startY;
                
                const { startRect, dir } = resizeStart.current;
                let newX = startRect.x;
                let newY = startRect.y;
                let newW = startRect.w;
                let newH = startRect.h;

                // --- Aspect Ratio Enforcement Logic ---
                // If dragging corner AND ratio is set, enforce ratio.
                // If dragging edge, reset ratio to free.
                
                if (aspectRatio !== null && dir.length === 2) {
                    // Corner drag with locked ratio
                    // Strategy: Use width change to drive height change, preserving ratio
                    
                    if (dir.includes('e')) {
                        newW = startRect.w + deltaX;
                    } else { // west
                        newW = startRect.w - deltaX;
                    }
                    
                    // Enforce min width first
                    newW = Math.max(20, newW);
                    
                    // Calculate H based on ratio
                    newH = newW / aspectRatio;

                    // Re-calculate X/Y based on new dimensions and anchor point
                    if (dir.includes('w')) newX = startRect.x + startRect.w - newW;
                    else newX = startRect.x; // east anchors left

                    if (dir.includes('n')) newY = startRect.y + startRect.h - newH;
                    else newY = startRect.y; // south anchors top
                    
                } else {
                    // Free resize or Edge resize
                    if (dir.length === 1 && aspectRatio !== null) {
                        setAspectRatio(null); // Unlock ratio on edge drag
                    }

                    if (dir.includes('e')) newW = startRect.w + deltaX;
                    if (dir.includes('w')) {
                        newX = startRect.x + deltaX;
                        newW = startRect.w - deltaX;
                    }
                    if (dir.includes('s')) newH = startRect.h + deltaY;
                    if (dir.includes('n')) {
                        newY = startRect.y + deltaY;
                        newH = startRect.h - deltaY;
                    }
                }

                // Enforce Min Size
                if (newW < 20) {
                    if (dir.includes('w')) newX = startRect.x + startRect.w - 20;
                    newW = 20;
                }
                if (newH < 20) {
                    if (dir.includes('n')) newY = startRect.y + startRect.h - 20;
                    newH = 20;
                }

                setCropRect({ x: newX, y: newY, w: newW, h: newH });
            }
        };

        const handleWinUp = () => {
            if (isResizing) setIsResizing(false);
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleWinMove);
            window.addEventListener('touchmove', handleWinMove, { passive: false });
            window.addEventListener('mouseup', handleWinUp);
            window.addEventListener('touchend', handleWinUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleWinMove);
            window.removeEventListener('touchmove', handleWinMove);
            window.removeEventListener('mouseup', handleWinUp);
            window.removeEventListener('touchend', handleWinUp);
        };
    }, [isResizing, isCropping, imgRect, aspectRatio]);


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (useNativeChooser && !file.type.startsWith('image/')) {
            alert(`文件类型错误 (${file.type})。请选择图片文件。`);
            e.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = ev.target?.result as string;
            setSourceUrl(result);
            setPreviewUrl(result); // Reset preview to source
            setIsCropping(false);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = -e.deltaY * 0.005;
        const newScale = Math.max(0.1, Math.min(50, scale + delta));
        setScale(newScale);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isResizing) return;
        setIsDragging(true);
        dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isResizing) return;
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.current.x,
            y: e.clientY - dragStart.current.y
        });
    };

    const handleInteractionEnd = () => {
        setIsDragging(false);
        lastTouchDistance.current = null;
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (isResizing) return;
        
        if (e.touches.length === 1) {
            setIsDragging(true);
            dragStart.current = { x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y };
        } else if (e.touches.length === 2) {
            setIsDragging(false);
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastTouchDistance.current = Math.sqrt(dx * dx + dy * dy);
        }
    };
    
    const handleTouchMove = (e: React.TouchEvent) => {
        if (isResizing) return;
        
        if (e.cancelable && (isDragging || e.touches.length === 2)) {
            e.preventDefault();
        }

        if (e.touches.length === 1 && isDragging) {
            setPosition({
                x: e.touches[0].clientX - dragStart.current.x,
                y: e.touches[0].clientY - dragStart.current.y
            });
        } else if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (lastTouchDistance.current) {
                const delta = dist - lastTouchDistance.current;
                const newScale = Math.max(0.1, Math.min(50, scale + delta * 0.01));
                setScale(newScale);
            }
            lastTouchDistance.current = dist;
        }
    };

    const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, dir: string) => {
        e.stopPropagation();
        e.preventDefault(); 
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        
        resizeStart.current = {
            startX: clientX,
            startY: clientY,
            startRect: { ...cropRect },
            dir
        };
        setIsResizing(true);
        // Force update imgRect before resize starts to ensure accuracy
        updateImgRect();
    };

    const getFitRect = (ratio: number) => {
        const { w: imgW, h: imgH, x: imgX, y: imgY } = imgRect;
        let w = imgW;
        let h = imgH;

        if (imgW / imgH > ratio) {
            w = imgH * ratio;
        } else {
            h = imgW / ratio;
        }

        // Center the crop box on image
        return {
            x: imgX + (imgW - w) / 2,
            y: imgY + (imgH - h) / 2,
            w,
            h
        };
    };

    const handleRatioClick = (nominalRatio: number) => {
        if (!isCropping) return;
        const isImgPortrait = imgRect.w < imgRect.h;
        let targetRatio = nominalRatio;
        
        // Toggle orientation if clicking same ratio
        if (aspectRatio !== null && Math.abs(aspectRatio - targetRatio) < 0.01) {
            targetRatio = 1 / targetRatio;
        }
        setAspectRatio(targetRatio);
        setCropRect(getFitRect(targetRatio));
    };

    const startCropping = () => {
        if (sourceUrl && sourceUrl !== previewUrl) {
            setPreviewUrl(sourceUrl);
            setPendingCropStart(true);
        } else {
            initCropUI();
        }
    };

    const applyCrop = () => {
        if (!previewUrl || !cropRect.w || !cropRect.h) return;
        
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Recalculate scale based on current live imgRect
            // imgRect might have changed due to pan/zoom
            // NOTE: imgRect is kept up to date by useEffect
            
            const scaleX = img.width / imgRect.w;
            const scaleY = img.height / imgRect.h;

            const cropX = (cropRect.x - imgRect.x) * scaleX;
            const cropY = (cropRect.y - imgRect.y) * scaleY;
            const cropW = cropRect.w * scaleX;
            const cropH = cropRect.h * scaleY;

            canvas.width = cropW;
            canvas.height = cropH;

            // Fill black background in case crop goes outside image
            ctx.fillStyle = "black";
            ctx.fillRect(0,0, cropW, cropH);

            ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            
            // Set preview to the new cropped version
            setPreviewUrl(canvas.toDataURL('image/png'));
            setIsCropping(false);
            
            // Reset View
            setScale(1); 
            setPosition({x:0, y:0});
        };
        img.src = previewUrl;
    };

    const handleConfirm = async () => {
        if (!previewUrl) return;
        setIsProcessing(true);
        setError(null);
        try {
            const baseShortEdge = imageSettings.maxShortEdge;
            const effectiveShortEdge = isHighQualityMode ? baseShortEdge : Math.floor(baseShortEdge / 2);

            const processSettings = {
                ...imageSettings,
                maxShortEdge: effectiveShortEdge
            };

            const processedBase64 = await processImage(previewUrl, processSettings);
            const finalDesc = description.trim();
            const newImage: GameImage = {
                id: initialImage?.id || `img_${Date.now()}`,
                base64: processedBase64, 
                mimeType: 'image/png', // Always use PNG to support transparency
                description: finalDesc
            };
            onConfirm(newImage);
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRevert = () => {
        if (sourceUrl) {
            setPreviewUrl(sourceUrl);
            setIsCropping(false);
            setScale(1);
            setPosition({x:0, y:0});
        }
    };

    // Library Handler
    const handleLibrarySelect = (url: string) => {
        setSourceUrl(url); // Update source to lib image
        setPreviewUrl(url);
        setShowLibrary(false);
    };

    const Handle = ({ dir, className }: { dir: string, className: string }) => (
        <div 
            className={`absolute w-8 h-8 -m-3 z-20 pointer-events-auto flex items-center justify-center touch-none ${className}`}
            onMouseDown={(e) => handleResizeStart(e, dir)}
            onTouchStart={(e) => handleResizeStart(e, dir)}
        >
            <div className="w-4 h-4 bg-white border border-slate-500 rounded-full shadow-md hover:bg-primary/20 transition-colors"></div>
        </div>
    );

    const containerClasses = previewUrl 
        ? "bg-black/80 border-border/50" 
        : "bg-surface/10 border-2 border-dashed border-primary/30 hover:bg-surface/20 hover:border-primary/50 transition-colors";

    return createPortal(
        <div className="fixed inset-0 bg-overlay z-[9999] flex items-center justify-center p-6 animate-in fade-in"
             onClick={(e) => {
                 if (e.target === e.currentTarget) onClose();
             }}
        >
            {showLibrary && (
                <IconLibraryWindow 
                    onClose={() => setShowLibrary(false)}
                    onSelect={handleLibrarySelect}
                    zIndex={10000}
                />
            )}

            <div className="w-full max-w-5xl glass-panel p-6 relative flex flex-col max-h-[90vh]">
                <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-highlight"><X size={20}/></button>
                
                <h3 className="text-lg font-bold text-highlight mb-4 flex items-center gap-2">
                    <ImageIcon size={20} className="text-primary"/> 
                    {initialImage || initialUrl ? "图片预览 / 编辑" : "添加图片"}
                </h3>
                
                <div className="flex flex-col lg:flex-row gap-6 h-full p-4 md:p-6 overflow-y-auto lg:overflow-hidden custom-scrollbar">
                    
                    <div className={`shrink-0 lg:flex-1 min-w-0 flex flex-col rounded-lg overflow-hidden border relative group min-h-[300px] h-[40vh] lg:h-auto ${containerClasses}`}>
                        
                        {/* Overlay Controls */}
                        <div className="absolute top-2 left-2 z-30 flex gap-2 flex-wrap pointer-events-none w-[95%]">
                            {isCropping ? (
                                <div className="pointer-events-auto flex gap-2 bg-black/60 p-1 rounded backdrop-blur-md">
                                    <div className="flex text-xs text-white overflow-hidden border border-slate-600 rounded">
                                        <button onClick={() => { setAspectRatio(null); }} className={`px-2 py-1 ${aspectRatio === null ? 'bg-primary font-bold' : 'hover:bg-white/20'}`}>Free</button>
                                        <button onClick={() => handleRatioClick(1)} className={`px-2 py-1 ${aspectRatio === 1 ? 'bg-primary font-bold' : 'hover:bg-white/20'}`}>1:1</button>
                                        <button onClick={() => handleRatioClick(4/3)} className={`px-2 py-1 flex items-center gap-1 ${Math.abs((aspectRatio || 0) - 4/3) < 0.01 || Math.abs((aspectRatio || 0) - 3/4) < 0.01 ? 'bg-primary font-bold' : 'hover:bg-white/20'}`}>
                                            4:3 {aspectRatio && Math.abs(aspectRatio - 3/4) < 0.01 && <RefreshCw size={8}/>}
                                        </button>
                                        <button onClick={() => handleRatioClick(16/9)} className={`px-2 py-1 flex items-center gap-1 ${Math.abs((aspectRatio || 0) - 16/9) < 0.01 || Math.abs((aspectRatio || 0) - 9/16) < 0.01 ? 'bg-primary font-bold' : 'hover:bg-white/20'}`}>
                                            16:9 {aspectRatio && Math.abs(aspectRatio - 9/16) < 0.01 && <RefreshCw size={8}/>}
                                        </button>
                                    </div>
                                    <Button size="sm" onClick={applyCrop} className="h-6 text-xs bg-success-base hover:bg-success-base/80 shadow-lg">
                                        <Check size={12} className="mr-1"/> 确认
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={() => setIsCropping(false)} className="h-6 text-xs shadow-lg">
                                        取消
                                    </Button>
                                </div>
                            ) : (
                                previewUrl && (
                                    <div className="pointer-events-auto flex gap-2">
                                        <Button size="sm" variant="secondary" onClick={startCropping} className="h-7 text-xs bg-black/50 border-slate-600 text-white hover:bg-primary hover:border-primary backdrop-blur-sm" title="从原图重新裁切">
                                            <Crop size={12} className="mr-1"/> 裁切
                                        </Button>
                                        <Button size="sm" variant="secondary" onClick={() => { setScale(1); setPosition({x:0,y:0}); }} className="h-7 text-xs bg-black/50 border-slate-600 text-white hover:bg-white/20 backdrop-blur-sm">
                                            <Maximize2 size={12} className="mr-1"/> 适应
                                        </Button>
                                    </div>
                                )
                            )}
                        </div>

                        <div className="absolute top-2 right-2 z-30">
                            {previewUrl && !isCropping && (
                                <div className="flex gap-2 pointer-events-auto">
                                    <button onClick={handleRevert} className="bg-black/60 text-white p-2 rounded hover:bg-white/20 transition-colors backdrop-blur-sm" title="还原到原图">
                                        <RotateCcw size={16}/>
                                    </button>
                                    <button onClick={() => setPreviewUrl(null)} className="bg-black/60 text-white p-2 rounded hover:bg-red-600 transition-colors backdrop-blur-sm" title="清除">
                                        <Trash2 size={16}/>
                                    </button>
                                    <button onClick={() => fileInputRef.current?.click()} className="bg-black/60 text-white p-2 rounded hover:bg-primary transition-colors backdrop-blur-sm" title="更换图片">
                                        <Upload size={16}/>
                                    </button>
                                </div>
                            )}
                        </div>

                        <div 
                            ref={containerRef}
                            className={`w-full h-full relative overflow-hidden ${isDragging ? 'cursor-grabbing' : (isCropping ? 'cursor-move' : 'cursor-grab')} flex items-center justify-center`}
                            style={{ touchAction: 'none' }}
                            onWheel={handleWheel}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleInteractionEnd}
                            onMouseLeave={handleInteractionEnd}
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleInteractionEnd}
                            onTouchCancel={handleInteractionEnd}
                        >
                            {previewUrl ? (
                                <>
                                    <img 
                                        ref={imgRef}
                                        src={previewUrl} 
                                        alt="Preview"
                                        className="transition-transform duration-75 ease-linear origin-center pointer-events-none select-none max-w-none max-h-none"
                                        style={{ 
                                            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                                            opacity: isCropping ? 0.5 : 1
                                        }}
                                        draggable={false}
                                        onDragStart={(e) => e.preventDefault()}
                                    />
                                    
                                    {isCropping && (
                                        <>
                                            <div 
                                                className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] z-10 box-border"
                                                style={{
                                                    left: cropRect.x,
                                                    top: cropRect.y,
                                                    width: cropRect.w,
                                                    height: cropRect.h
                                                }}
                                            >
                                                <div className="w-full h-full grid grid-cols-3 grid-rows-3 pointer-events-none">
                                                    {[...Array(9)].map((_, i) => <div key={i} className="border border-white/20"/>)}
                                                </div>
                                                <Handle dir="nw" className="-top-2 -left-2 cursor-nw-resize"/>
                                                <Handle dir="ne" className="-top-2 -right-2 cursor-ne-resize"/>
                                                <Handle dir="sw" className="-bottom-2 -left-2 cursor-sw-resize"/>
                                                <Handle dir="se" className="-bottom-2 -right-2 cursor-se-resize"/>
                                                <Handle dir="n" className="-top-2 left-1/2 -translate-x-1/2 cursor-n-resize"/>
                                                <Handle dir="s" className="-bottom-2 left-1/2 -translate-x-1/2 cursor-s-resize"/>
                                                <Handle dir="w" className="top-1/2 -left-2 -translate-y-1/2 cursor-w-resize"/>
                                                <Handle dir="e" className="top-1/2 -right-2 -translate-y-1/2 cursor-e-resize"/>
                                            </div>

                                            <div
                                                className="absolute overflow-hidden z-0 pointer-events-none"
                                                style={{
                                                    left: cropRect.x,
                                                    top: cropRect.y,
                                                    width: cropRect.w,
                                                    height: cropRect.h
                                                }}
                                            >
                                                <img 
                                                    src={previewUrl} 
                                                    alt="CropView"
                                                    className="max-w-none max-h-none"
                                                    style={{
                                                        width: imgRect.w,
                                                        height: imgRect.h,
                                                        transform: `translate(${imgRect.x - cropRect.x}px, ${imgRect.y - cropRect.y}px)`
                                                    }}
                                                />
                                            </div>
                                        </>
                                    )}
                                </>
                            ) : (
                                <div 
                                    className="text-center text-muted flex flex-col items-center gap-4 cursor-pointer w-full h-full justify-center pointer-events-auto"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <div className="p-4 bg-surface-highlight/50 rounded-full">
                                        <Upload size={40} className="text-primary"/>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-sm font-bold text-highlight">点击上传图片</span>
                                        <span className="text-[10px] text-muted">支持 JPG/PNG (自动压缩优化)</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <input 
                            key={useNativeChooser ? 'native-upload-input' : 'restricted-upload-input'}
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            {...(useNativeChooser ? {} : { accept: "image/*" })}
                            onChange={handleFileChange}
                        />
                    </div>

                    <div className="w-full lg:w-80 flex flex-col gap-4 shrink-0 lg:overflow-y-auto min-h-0 lg:max-h-full pb-4">
                        {error && (
                            <div className="text-xs text-danger-fg bg-danger/10 p-3 rounded border border-danger/20 flex items-start gap-2">
                                <X size={14} className="mt-0.5 shrink-0"/>
                                <span>错误: {error}</span>
                            </div>
                        )}

                        <div className="bg-surface-light p-4 rounded border border-border flex-1 flex flex-col">
                            <Label className="text-primary mb-2 block">图片描述 (提示词前缀)</Label>
                            <div className="relative">
                                <Input 
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="例如: 一个拿着红色滑板的机器人..."
                                    className="text-sm pb-8"
                                    autoFocus={!initialImage && !initialUrl} 
                                />
                            </div>
                            <p className="text-[10px] text-muted mt-2 leading-relaxed">
                                此描述将作为提示词发送给 AI。<br/>
                                在保存时，图片将根据全局设置 ({imageSettings.maxShortEdge}px / {imageSettings.maxLongEdge}px) 自动缩放和压缩。
                            </p>

                            <div className="mt-4 pt-3 border-t border-border/50">
                                <label className="flex items-center gap-2 cursor-pointer select-none group">
                                    <input 
                                        type="checkbox" 
                                        checked={isHighQualityMode}
                                        onChange={e => setIsHighQualityMode(e.target.checked)}
                                        className="accent-primary w-4 h-4 cursor-pointer"
                                    />
                                    <div className="flex-1">
                                        <div className={`text-xs font-bold transition-colors ${isHighQualityMode ? 'text-primary' : 'text-muted group-hover:text-body'}`}>
                                            启用高清上传 (High Quality)
                                        </div>
                                        <div className="text-[9px] text-muted mt-0.5">
                                            {isHighQualityMode 
                                                ? "使用全局设置的完整分辨率 (消耗较多Token)" 
                                                : "分辨率限制减半 (节省Token, 适合概览图)"}
                                        </div>
                                    </div>
                                    {isHighQualityMode && <Zap size={14} className="text-primary animate-pulse"/>}
                                </label>
                            </div>
                            
                            <div className="mt-4 pt-3 border-t border-border/50">
                                 <Button variant="secondary" onClick={() => setShowLibrary(true)} className="w-full flex items-center justify-center gap-2 text-xs">
                                     <Grid size={14}/> 打开图标库 / 像素画
                                 </Button>
                            </div>
                        </div>

                        <div className="mt-auto flex flex-col gap-3 pt-2">
                            <Button onClick={handleConfirm} disabled={!previewUrl || isProcessing || isCropping} className="w-full h-12 text-base font-bold bg-primary hover:bg-primary-hover text-white">
                                {isProcessing ? <><Loader2 size={18} className="animate-spin mr-2"/> 处理中...</> : <><Check size={18} className="mr-2"/> {(initialImage || initialUrl) ? "保存修改" : "确认添加"}</>}
                            </Button>
                            <Button variant="secondary" onClick={onClose} className="w-full">
                                取消
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};