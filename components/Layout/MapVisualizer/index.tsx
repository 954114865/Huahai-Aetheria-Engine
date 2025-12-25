
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GameState } from '../../../types';
import { MapRenderer } from './MapRenderer';
import { useMapCamera } from './useMapCamera';
import { useMapInteraction } from './useMapInteraction';
import { Maximize, Minimize, Navigation, PlusCircle, Lock, Crosshair } from 'lucide-react';

interface MapVisualizerProps {
    state: GameState;
    onLocationSelect: (locId: string) => void;
    viewingLocationId?: string | null;
    onCreateLocation?: (x: number, y: number) => void;
}

export const MapVisualizer: React.FC<MapVisualizerProps> = ({ state, onLocationSelect, viewingLocationId, onCreateLocation }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
    
    const isMapLocked = state.appSettings.lockedFeatures?.mapView || false;
    
    // 1. Camera Logic
    const { camera, cameraRef, updateCamera, resetView, getZ } = useMapCamera(state, isMapLocked);

    // 2. Interaction Logic
    const { 
        isCreatingLocation, 
        setIsCreatingLocation, 
        handleMouseDown, 
        handleMouseUp 
    } = useMapInteraction({
        canvasRef,
        cameraRef,
        updateCamera,
        isMapLocked,
        state,
        getZ,
        dimensions,
        onLocationSelect,
        onCreateLocation
    });

    // 3. Renderer Instance
    const renderer = useMemo(() => new MapRenderer(), []);

    // Resize Observer
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentBoxSize) {
                    setDimensions({ 
                        width: entry.contentBoxSize[0].inlineSize, 
                        height: entry.contentBoxSize[0].blockSize 
                    });
                }
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [isExpanded]);

    // Reactive Render Logic (Replaces Infinite Loop)
    // We explicitly extract state.map to ensure we only re-render when MAP data changes,
    // ignoring unrelated state changes like Time or Logs.
    const mapState = state.map;

    const renderFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no transparency
        if (!ctx) return;

        // Cache grid if needed (renderer handles diffing internally)
        renderer.cacheGrid(state);

        // OPTIMIZATION: Cap DPR at 1.5 for performance on high-DPI mobile screens
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        
        // Only resize if dimensions actually changed to avoid layout thrashing
        const targetWidth = Math.floor(dimensions.width * dpr);
        const targetHeight = Math.floor(dimensions.height * dpr);

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            ctx.scale(dpr, dpr);
        } else {
            // Ensure transform is reset if we didn't resize/clear
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0); 
        }

        renderer.render(
            ctx, 
            dimensions.width, 
            dimensions.height, 
            cameraRef.current, 
            state, 
            viewingLocationId,
            getZ
        );
    }, [dimensions, camera, mapState, viewingLocationId, renderer, getZ]); // Depend on mapState, not full state

    // Trigger Render on specific dependencies
    useEffect(() => {
        renderFrame();
    }, [renderFrame]);

    // UI & Styles
    // Compass rotation: Invert yaw so compass points North relative to camera
    const compassRotation = -(camera.yaw * 180 / Math.PI);
    const normalContainerClass = "relative w-full h-64 bg-black overflow-hidden border-b border-slate-800";
    const expandedContainerClass = "fixed inset-0 z-[200] bg-slate-950 flex flex-col touch-none"; 
    const cursorClass = isCreatingLocation ? "cursor-copy" : "cursor-crosshair";

    const MapContent = (
        <div className={isExpanded ? expandedContainerClass : normalContainerClass} style={{ touchAction: 'none' }}>
            {/* Lock Overlay */}
            {isMapLocked && (
                <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                    <Lock size={64} className="text-white opacity-20" />
                </div>
            )}

            {/* Compass HUD - Simple White Arrow */}
            <div 
                className="absolute left-4 z-10 pointer-events-none filter drop-shadow-md transition-transform duration-100 ease-linear will-change-transform" 
                style={{ 
                    transform: `rotate(${compassRotation}deg)`,
                    // Use env(safe-area-inset-top) to avoid status bar overlap in expanded mode
                    top: isExpanded ? 'calc(env(safe-area-inset-top) + 16px)' : '16px'
                }}
                title="North"
            >
                <svg 
                    width="42" 
                    height="42" 
                    viewBox="0 0 24 24" 
                    fill="white" 
                    stroke="rgba(0,0,0,0.3)" 
                    strokeWidth="1" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                >
                    <polygon points="12 2 19 21 12 17 5 21 12 2" />
                </svg>
            </div>

            {/* Controls HUD */}
            <div 
                className={`absolute z-10 flex gap-2 transition-all ${isExpanded ? 'right-4' : 'right-2'}`}
                style={{
                    // Dynamic top padding for safe area
                    top: isExpanded ? 'calc(env(safe-area-inset-top) + 16px)' : '8px'
                }}
            >
                 {onCreateLocation && (
                     <button 
                        onClick={() => setIsCreatingLocation(!isCreatingLocation)} 
                        className={`p-1.5 rounded border shadow-lg transition-colors ${isCreatingLocation ? 'bg-yellow-600 text-white border-yellow-400' : 'bg-slate-800/80 hover:bg-indigo-600 text-white border-slate-600'}`}
                        title="Add Custom Location"
                        disabled={isMapLocked}
                        style={{ opacity: isMapLocked ? 0.5 : 1, cursor: isMapLocked ? 'not-allowed' : 'pointer' }}
                    >
                        <PlusCircle size={16}/>
                    </button>
                 )}
                 <button 
                    onClick={resetView} 
                    className="p-1.5 bg-slate-800/80 hover:bg-indigo-600 text-white rounded border border-slate-600 shadow-lg transition-colors" 
                    title="Reset View"
                    disabled={isMapLocked}
                    style={{ opacity: isMapLocked ? 0.5 : 1, cursor: isMapLocked ? 'not-allowed' : 'pointer' }}
                >
                    <Navigation size={16}/>
                </button>
                 <button 
                    onClick={() => setIsExpanded(!isExpanded)} 
                    className="p-1.5 bg-slate-800/80 hover:bg-indigo-600 text-white rounded border border-slate-600 shadow-lg transition-colors" 
                    title={isExpanded ? "Minimize Map" : "Maximize Map"}
                    disabled={isMapLocked}
                    style={{ opacity: isMapLocked ? 0.5 : 1, cursor: isMapLocked ? 'not-allowed' : 'pointer' }}
                >
                    {isExpanded ? <Minimize size={16}/> : <Maximize size={16}/>}
                </button>
            </div>

            {isExpanded && (
                <div 
                    className="absolute left-2 z-10 bg-black/60 px-2 py-1 rounded text-xs text-slate-300 pointer-events-none"
                    style={{
                        bottom: 'calc(env(safe-area-inset-bottom) + 8px)'
                    }}
                >
                    <b>Controls:</b> Click: Select | Left Drag/1-Finger: Rotate | Right Drag/2-Finger: Pan/Zoom
                </div>
            )}

            <div ref={containerRef} className="w-full h-full overflow-hidden touch-none">
                <canvas 
                    ref={canvasRef} 
                    className={`w-full h-full block outline-none ${cursorClass}`} 
                    style={{ touchAction: 'none' }}
                    tabIndex={0} 
                    onMouseDown={handleMouseDown} 
                    onMouseUp={handleMouseUp} 
                    onContextMenu={e => e.preventDefault()}
                />
            </div>

            {!isExpanded && (
                <div className="absolute bottom-2 right-2 pointer-events-none text-[10px] text-slate-500 font-mono shadow-black drop-shadow-md flex items-center gap-2 bg-black/40 px-2 rounded">
                    <Crosshair size={10}/> 
                    <span>{camera.pan.x.toFixed(0)}, {camera.pan.y.toFixed(0)}, {camera.pan.z.toFixed(0)}</span>
                </div>
            )}
        </div>
    );

    if (isExpanded) return createPortal(MapContent, document.body);
    return MapContent;
};
