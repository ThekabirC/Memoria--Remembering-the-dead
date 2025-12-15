
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    Upload, Play, Pause, Download, Settings2, 
    Wand2, Video as VideoIcon, Image as ImageIcon, Sparkles, X, 
    RefreshCcw, Film, RotateCw, Clock, ArrowRightLeft, Shuffle, Crop,
    LayoutGrid, MonitorPlay, Trash2, Undo2, FileUp, MoreHorizontal,
    MousePointerClick, RectangleHorizontal, Square, Check, Move
} from 'lucide-react';
import Timeline from './components/Timeline';
import Player from './components/Player';
import { Slide, AspectRatio } from './types';
import * as GeminiService from './services/geminiService';
import { BeamsBackground } from './components/ui/beams-background';
import { Dropzone, DropzoneContent, DropzoneEmptyState } from './components/ui/dropzone';

// Generate ID
const uid = () => Math.random().toString(36).substring(2, 9);

type CropRect = { x: number; y: number; w: number; h: number };

const App: React.FC = () => {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [previousSlidesOrder, setPreviousSlidesOrder] = useState<Slide[] | null>(null);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'editor' | 'master'>('editor');
  
  // Global Settings
  const [globalDuration, setGlobalDuration] = useState(4);
  const [globalTransition, setGlobalTransition] = useState(1.5); 
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.RATIO_16_9);

  // Modals / Panels
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  
  // Cropping State
  const [isCropping, setIsCropping] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [activeDragHandle, setActiveDragHandle] = useState<string | null>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{ mouseX: number, mouseY: number, rect: CropRect } | null>(null);

  // Drag and Drop State for Master View
  const [draggedSlideIndex, setDraggedSlideIndex] = useState<number | null>(null);
  
  // File Drop State
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Computed
  const totalDuration = slides.reduce((acc, s) => acc + s.duration, 0);
  const selectedSlide = slides.find(s => s.id === selectedSlideId);

  // Determine Render Resolution based on Aspect Ratio
  const renderDimensions = aspectRatio === AspectRatio.RATIO_1_1 
      ? { width: 1080, height: 1080 } 
      : { width: 1280, height: 720 };

  // Playback Loop
  const tick = useCallback((time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    const delta = (time - lastTimeRef.current) / 1000;
    lastTimeRef.current = time;

    if (isPlaying) {
      setCurrentTime(prev => {
        const next = prev + delta;
        if (next >= totalDuration) {
          setIsPlaying(false);
          return 0; // Loop
        }
        return next;
      });
      animationFrameRef.current = requestAnimationFrame(tick);
    }
  }, [isPlaying, totalDuration]);

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(tick);
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, tick]);


  // --- Actions ---

  const processFiles = (files: FileList | File[]) => {
      const newSlides: Slide[] = Array.from(files).map((file: File) => ({
        id: uid(),
        url: URL.createObjectURL(file),
        type: file.type.startsWith('video') ? 'video' : 'image',
        duration: globalDuration, // Apply global default
        transitionDuration: globalTransition, // Apply global default
        name: file.name,
        originalFile: file,
        rotation: 0
      }));
      setSlides(prev => [...prev, ...newSlides]);
      if (!selectedSlideId && newSlides.length > 0) setSelectedSlideId(newSlides[0].id);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
    if (e.target) e.target.value = '';
  };

  const handleDropzoneDrop = (files: File[]) => {
      processFiles(files);
  };

  const handleFileDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingFile(false);
      
      // If dropping internal slides in master view, ignore here
      if (e.dataTransfer.types.includes('application/x-memoria-slide')) return;

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processFiles(e.dataTransfer.files);
      }
  };

  const handleGlobalDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      if (!e.dataTransfer.types.includes('Files')) return;
      setIsDraggingFile(true);
  };

  const handleGlobalDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      // Only set false if we are leaving the window bounds
      if (e.clientY <= 0 || e.clientX <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
          setIsDraggingFile(false);
      }
  };

  const handleGlobalDurationChange = (val: number) => {
    setGlobalDuration(val);
    setSlides(prev => prev.map(s => ({ ...s, duration: val })));
  };

  const handleGlobalTransitionChange = (val: number) => {
    setGlobalTransition(val);
    setSlides(prev => prev.map(s => ({ ...s, transitionDuration: val })));
  };

  const updateSlide = (id: string, updates: Partial<Slide>) => {
      setSlides(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleSelectSlide = (id: string) => {
      setSelectedSlideId(id);
      
      // Calculate start time for this slide to seek
      let startTime = 0;
      let targetSlide: Slide | undefined;

      for (const slide of slides) {
          if (slide.id === id) {
              targetSlide = slide;
              break;
          }
          startTime += slide.duration;
      }

      if (targetSlide) {
           // Advance to where transition ends to show the full image
           // Logic: current time stamp + transition time
           // Ensure we don't exceed the slide duration
           const offset = Math.min(targetSlide.transitionDuration, targetSlide.duration - 0.1);
           setCurrentTime(startTime + offset);
      } else {
           setCurrentTime(startTime);
      }
  };

  const handleRestore = async () => {
    if (!selectedSlide || selectedSlide.type !== 'image') return;
    setIsProcessingAI(true);
    try {
      const blob = await fetch(selectedSlide.url).then(r => r.blob());
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        try {
            const restoredUrl = await GeminiService.restoreImage(base64);
            setSlides(prev => prev.map(s => s.id === selectedSlide.id ? {
                ...s,
                url: restoredUrl,
                isRestored: true
            } : s));
        } catch (err) {
            console.error(err);
            alert("Restoration failed. Please try again.");
        } finally {
            setIsProcessingAI(false);
        }
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      setIsProcessingAI(false);
    }
  };

  const handleRotate = () => {
      if (!selectedSlide) return;
      const currentRotation = selectedSlide.rotation || 0;
      const newRotation = (currentRotation + 90) % 360;
      updateSlide(selectedSlide.id, { rotation: newRotation });
  };

  const handleDownloadSlide = () => {
      if (!selectedSlide) return;
      const a = document.createElement('a');
      a.href = selectedSlide.url;
      a.download = selectedSlide.name || `slide-${selectedSlide.id}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  };

  const handleRandomizeOrder = () => {
      if (slides.length < 2) return;
      
      setPreviousSlidesOrder([...slides]);

      const shuffled = [...slides];
      // Fisher-Yates shuffle
      for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      
      setSlides(shuffled);
      setCurrentTime(0);
      setIsPlaying(false);
  };

  const handleUndoRandomize = () => {
      if (previousSlidesOrder) {
          setSlides(previousSlidesOrder);
          setPreviousSlidesOrder(null);
          setCurrentTime(0);
          setIsPlaying(false);
      }
  };

  // --- Drag and Drop for Master View ---
  
  const handleDragStart = (e: React.DragEvent, index: number) => {
      e.dataTransfer.setData('application/x-memoria-slide', 'true');
      setDraggedSlideIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault(); 
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      if (draggedSlideIndex === null || draggedSlideIndex === dropIndex) return;
      
      if (!e.dataTransfer.types.includes('application/x-memoria-slide')) return;

      const newSlides = [...slides];
      const [movedSlide] = newSlides.splice(draggedSlideIndex, 1);
      newSlides.splice(dropIndex, 0, movedSlide);
      
      setSlides(newSlides);
      setDraggedSlideIndex(null);
  };

  const enterEditor = (slideId: string) => {
      handleSelectSlide(slideId);
      setViewMode('editor');
  };

  // --- New Cropping Logic ---

  const initiateCrop = () => {
      setIsCropping(true);
      setCropRect(null); // Reset to ensure we calculate fresh based on displayed image
      setActiveDragHandle(null);
  };

  const onCropImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      // Initialize crop rect to 80% of image size, centered
      const w = img.clientWidth * 0.8;
      const h = img.clientHeight * 0.8;
      const x = (img.clientWidth - w) / 2;
      const y = (img.clientHeight - h) / 2;
      setCropRect({ x, y, w, h });
  };

  const handleCropMouseDown = (e: React.MouseEvent, handle: string) => {
      if (!cropRect) return;
      e.preventDefault();
      e.stopPropagation();
      
      setActiveDragHandle(handle);
      dragStartRef.current = {
          mouseX: e.clientX,
          mouseY: e.clientY,
          rect: { ...cropRect }
      };
  };

  const handleCropMouseMove = (e: React.MouseEvent) => {
      if (!activeDragHandle || !dragStartRef.current || !cropRect || !cropImgRef.current) return;
      e.preventDefault();

      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      const startRect = dragStartRef.current.rect;
      
      const imgW = cropImgRef.current.clientWidth;
      const imgH = cropImgRef.current.clientHeight;

      let newRect = { ...startRect };

      if (activeDragHandle === 'move') {
          newRect.x = Math.max(0, Math.min(startRect.x + dx, imgW - startRect.w));
          newRect.y = Math.max(0, Math.min(startRect.y + dy, imgH - startRect.h));
      } else {
          // Resize Logic
          const isWest = activeDragHandle.includes('w');
          const isEast = activeDragHandle.includes('e');
          const isNorth = activeDragHandle.includes('n');
          const isSouth = activeDragHandle.includes('s');

          if (isWest) {
              const proposedX = Math.max(0, startRect.x + dx);
              const maxDelta = startRect.w - 20; // Min width 20px
              const actualDx = Math.min(dx, maxDelta);
              newRect.x = startRect.x + actualDx;
              newRect.w = startRect.w - actualDx;
              if (newRect.x < 0) {
                  newRect.w += newRect.x;
                  newRect.x = 0;
              }
          }
          if (isEast) {
              newRect.w = Math.max(20, Math.min(startRect.w + dx, imgW - startRect.x));
          }
          if (isNorth) {
              const maxDelta = startRect.h - 20; // Min height 20px
              const actualDy = Math.min(dy, maxDelta);
              newRect.y = startRect.y + actualDy;
              newRect.h = startRect.h - actualDy;
              if (newRect.y < 0) {
                  newRect.h += newRect.y;
                  newRect.y = 0;
              }
          }
          if (isSouth) {
              newRect.h = Math.max(20, Math.min(startRect.h + dy, imgH - startRect.y));
          }
      }

      setCropRect(newRect);
  };

  const handleCropMouseUp = () => {
      setActiveDragHandle(null);
      dragStartRef.current = null;
  };

  const performCrop = () => {
      if (!selectedSlide || !cropImgRef.current || !cropRect) return;

      const img = cropImgRef.current;
      const scaleX = img.naturalWidth / img.clientWidth;
      const scaleY = img.naturalHeight / img.clientHeight;

      const canvas = document.createElement('canvas');
      canvas.width = cropRect.w * scaleX;
      canvas.height = cropRect.h * scaleY;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return;

      ctx.drawImage(
          img,
          cropRect.x * scaleX,
          cropRect.y * scaleY,
          cropRect.w * scaleX,
          cropRect.h * scaleY,
          0, 0,
          canvas.width,
          canvas.height
      );

      const croppedUrl = canvas.toDataURL('image/png');
      updateSlide(selectedSlide.id, { url: croppedUrl, rotation: 0 }); // Reset rotation on crop
      setIsCropping(false);
  };

  const handleVeoAnimation = async () => {
    if (!selectedSlide || selectedSlide.type !== 'image') return;
    setIsProcessingAI(true);
    try {
        const blob = await fetch(selectedSlide.url).then(r => r.blob());
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result as string;
            try {
                const videoUrl = await GeminiService.generateVeoVideo(base64, "Subtle cinematic motion, bringing the photo to life", "16:9");
                const newSlide: Slide = {
                    id: uid(),
                    url: videoUrl,
                    type: 'video',
                    duration: 5,
                    transitionDuration: globalTransition,
                    name: `Animated - ${selectedSlide.name}`,
                    isGenerated: true,
                    rotation: 0
                };
                
                const idx = slides.findIndex(s => s.id === selectedSlideId);
                const newSlides = [...slides];
                newSlides.splice(idx + 1, 0, newSlide);
                setSlides(newSlides);
                setSelectedSlideId(newSlide.id);
            } catch (err) {
                console.error(err);
                alert("Video generation failed. Please ensure you have a valid API key.");
            } finally {
                setIsProcessingAI(false);
            }
        };
        reader.readAsDataURL(blob);
    } catch (e) {
        setIsProcessingAI(false);
    }
  };
  
  const startExport = () => {
      if(slides.length === 0) return;
      setIsExporting(true);
      setCurrentTime(0);
      setIsPlaying(true);
      
      // Wait a bit to ensure the canvas has rendered frame 0
      setTimeout(() => {
          const canvas = document.getElementById('player-canvas') as HTMLCanvasElement;
          if(!canvas) {
              console.error("Canvas not found");
              setIsExporting(false);
              return;
          }
          
          const stream = canvas.captureStream(30);
          
          let mimeType = 'video/webm';
          if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
              mimeType = 'video/webm;codecs=vp9';
          } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
              mimeType = 'video/webm;codecs=vp8';
          }

          const recorder = new MediaRecorder(stream, { 
              mimeType,
              videoBitsPerSecond: 8000000 // 8 Mbps
          });
          
          const chunks: Blob[] = [];
          recorder.ondataavailable = e => {
              if (e.data.size > 0) chunks.push(e.data);
          };
          
          recorder.onstop = () => {
              const blob = new Blob(chunks, { type: 'video/webm' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `memoria-export-${aspectRatio === AspectRatio.RATIO_1_1 ? 'square' : 'widescreen'}.webm`;
              a.click();
              setIsExporting(false);
          };
          
          recorder.start();
          mediaRecorderRef.current = recorder;
      }, 200);
  };

  // Stop export when playback ends
  useEffect(() => {
      if (isExporting && !isPlaying && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
           setTimeout(() => {
               mediaRecorderRef.current?.stop();
           }, 500);
      }
  }, [isPlaying, isExporting]);


  return (
    <div 
        className="flex flex-col h-screen w-full relative"
        onDragOver={handleGlobalDragOver}
        onDragLeave={handleGlobalDragLeave}
        onDrop={handleFileDrop}
        onMouseUp={handleCropMouseUp}
        onMouseMove={isCropping ? handleCropMouseMove : undefined}
    >
      {/* Background Component */}
      <BeamsBackground className="absolute inset-0 z-0 pointer-events-none" />
      
      {/* File Drop Overlay */}
      {isDraggingFile && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md border-4 border-[#f8ff96]/50 m-4 rounded-3xl flex items-center justify-center pointer-events-none transition-all">
              <div className="glass-panel p-10 rounded-3xl shadow-2xl flex flex-col items-center">
                  <FileUp className="text-[#f8ff96] w-20 h-20 mb-6" />
                  <h3 className="text-3xl font-bold text-white tracking-tight">Drop files to add</h3>
              </div>
          </div>
      )}

      {/* Top Bar */}
      <header className="h-16 glass-panel border-b border-white/5 flex items-center justify-between px-8 z-20 shrink-0 relative">
        <div className="flex items-center gap-3">
            <h1 className="text-3xl text-white font-logo tracking-wide font-bold">Memoria</h1>
        </div>

        <div className="flex items-center gap-4">
             {/* View Toggle */}
             <div className="flex bg-white/5 p-1 rounded-full border border-white/10">
                <button
                    onClick={() => setViewMode('editor')}
                    className={`py-1.5 px-4 rounded-full text-xs font-medium transition-all flex items-center gap-2
                    ${viewMode === 'editor' ? 'bg-white/10 text-white shadow-sm border border-white/5' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    <MonitorPlay size={14} />
                    Editor
                </button>
                <button
                    onClick={() => setViewMode('master')}
                    className={`py-1.5 px-4 rounded-full text-xs font-medium transition-all flex items-center gap-2
                    ${viewMode === 'master' ? 'bg-white/10 text-white shadow-sm border border-white/5' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    <LayoutGrid size={14} />
                    Grid
                </button>
             </div>

             <div className="h-6 w-px bg-white/10 mx-2"></div>

             <button 
                onClick={() => fileInputRef.current?.click()}
                className="glass-button flex items-center gap-2 px-6 py-2.5 rounded-full text-white font-medium text-xs tracking-wide"
             >
                <Upload size={14} />
                <span>Add Media</span>
             </button>

             <button 
                onClick={startExport}
                disabled={isExporting || slides.length === 0}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full transition-all font-medium text-xs tracking-wide shadow-lg
                    ${isExporting ? 'bg-[#3b3d20] text-[#f8ff96] cursor-wait' : 'bg-gradient-to-r from-[#f8ff96] to-[#e0e885] hover:shadow-[#f8ff96]/40 text-black disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none'}`}
             >
                <Download size={14} />
                <span>{isExporting ? 'Rendering...' : 'Export Video'}</span>
             </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden z-10">
        
        {viewMode === 'editor' ? (
            <>
                <div className="flex-1 flex flex-col relative min-w-0">
                    
                    {/* Global Settings Bar - Floating Effect */}
                    <div className="absolute top-6 left-6 right-6 z-10 flex justify-center pointer-events-none">
                        <div className="glass-panel rounded-full px-8 py-2.5 flex items-center gap-6 pointer-events-auto shadow-2xl backdrop-blur-md">
                             {/* Duration */}
                             <div className="flex items-center gap-3">
                                <Clock size={16} className="text-white/80" />
                                <div className="flex flex-col w-28">
                                    <div className="flex justify-between items-center text-xs font-medium text-white mb-1.5 tracking-wide">
                                        <span>Duration</span>
                                        <span className="text-[#f8ff96] ml-2">{globalDuration}s</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="1" max="15" step="0.5"
                                        value={globalDuration}
                                        onChange={(e) => handleGlobalDurationChange(Number(e.target.value))}
                                        className="w-full h-1 bg-white/10 rounded-lg small-thumb cursor-pointer hover:bg-white/20 transition-colors"
                                    />
                                </div>
                             </div>

                             <div className="h-6 w-px bg-white/10"></div>

                             {/* Transition */}
                             <div className="flex items-center gap-3">
                                <ArrowRightLeft size={16} className="text-white/80" />
                                <div className="flex flex-col w-28">
                                    <div className="flex justify-between items-center text-xs font-medium text-white mb-1.5 tracking-wide">
                                        <span>Transition</span>
                                        <span className="text-[#f8ff96] ml-2">{globalTransition}s</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" max="3" step="0.25"
                                        value={globalTransition}
                                        onChange={(e) => handleGlobalTransitionChange(Number(e.target.value))}
                                        className="w-full h-1 bg-white/10 rounded-lg small-thumb cursor-pointer hover:bg-white/20 transition-colors"
                                    />
                                </div>
                             </div>

                             <div className="h-6 w-px bg-white/10"></div>

                             {/* Aspect Ratio */}
                             <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/5">
                                <button 
                                    onClick={() => setAspectRatio(AspectRatio.RATIO_16_9)}
                                    className={`p-1.5 rounded-md transition-all ${aspectRatio === AspectRatio.RATIO_16_9 ? 'bg-white/20 text-[#f8ff96] shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                    title="16:9 Widescreen"
                                >
                                    <RectangleHorizontal size={16} />
                                </button>
                                <button 
                                    onClick={() => setAspectRatio(AspectRatio.RATIO_1_1)}
                                    className={`p-1.5 rounded-md transition-all ${aspectRatio === AspectRatio.RATIO_1_1 ? 'bg-white/20 text-[#f8ff96] shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                    title="1:1 Square"
                                >
                                    <Square size={16} />
                                </button>
                             </div>

                             <div className="h-6 w-px bg-white/10"></div>

                             {/* Randomize */}
                             <div className="flex items-center gap-1">
                                 <button 
                                    onClick={handleRandomizeOrder}
                                    className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-all"
                                    title="Randomize Order"
                                 >
                                    <Shuffle size={16} />
                                 </button>

                                 {previousSlidesOrder && (
                                     <button 
                                        onClick={handleUndoRandomize}
                                        className="p-2 rounded-full hover:bg-white/10 text-[#f8ff96] hover:text-[#dce673] transition-all"
                                        title="Undo Randomize"
                                    >
                                        <Undo2 size={16} />
                                    </button>
                                 )}
                             </div>
                        </div>
                    </div>

                    {/* Left/Center: Player Stage */}
                    <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                        
                        {slides.length > 0 ? (
                            <div className="relative group flex items-center justify-center w-full h-full max-h-[70vh]">
                                <div className={`relative shadow-2xl shadow-black/50 overflow-hidden transition-all duration-300 ${aspectRatio === AspectRatio.RATIO_1_1 ? 'aspect-square h-full' : 'aspect-video w-full max-w-5xl'}`}>
                                    <Player 
                                        slides={slides} 
                                        currentTime={currentTime} 
                                        isPlaying={isPlaying}
                                        width={renderDimensions.width}
                                        height={renderDimensions.height}
                                    />
                                    {/* Transport Controls Overlay */}
                                    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-8 glass-panel px-8 py-2.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 hover:bg-black/80 shadow-lg border border-white/10">
                                        <span className="text-xs font-mono text-white/70">{new Date(currentTime * 1000).toISOString().substr(14, 5)}</span>
                                        
                                        <button 
                                            onClick={() => setIsPlaying(!isPlaying)}
                                            className="w-10 h-10 rounded-full bg-white text-black hover:scale-110 transition-transform flex items-center justify-center shadow-lg shadow-white/20"
                                        >
                                            {isPlaying ? <Pause fill="currentColor" size={16} /> : <Play fill="currentColor" size={16} className="ml-0.5" />}
                                        </button>

                                        <span className="text-xs font-mono text-white/70">{new Date(totalDuration * 1000).toISOString().substr(14, 5)}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center space-y-4 max-w-[500px] w-full scale-90 origin-center">
                                <Dropzone
                                    maxSize={1024 * 1024 * 50} // 50MB
                                    onDrop={handleDropzoneDrop}
                                    accept={{ 'image/*': [], 'video/*': [] }}
                                    maxFiles={500}
                                >
                                    <DropzoneEmptyState>
                                         <div className="w-20 h-20 bg-white/5 rounded-[1.5rem] flex items-center justify-center mx-auto border border-white/10 backdrop-blur-sm animate-float mb-4">
                                            <ImageIcon className="text-white" size={32} />
                                        </div>
                                        <p className="text-lg font-medium tracking-tight text-white mb-1">Create a memory</p>
                                        <p className="text-white/40 text-xs font-medium tracking-wide mb-6">Drag and drop your photos here to begin.</p>
                                    </DropzoneEmptyState>
                                    <DropzoneContent />
                                </Dropzone>
                            </div>
                        )}
                        
                        {/* Export & AI Overlays */}
                        {isExporting && (
                            <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center text-center backdrop-blur-sm">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#f8ff96] mb-6"></div>
                                <h3 className="text-2xl font-bold text-white">Rendering Video</h3>
                                <p className="text-gray-400 mt-2 text-sm">Please keep this tab open.</p>
                            </div>
                        )}
                        
                         {isProcessingAI && (
                            <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center text-center backdrop-blur-sm">
                                <div className="animate-pulse rounded-full h-20 w-20 bg-gradient-to-tr from-[#f8ff96] to-[#e0e885] mb-6 flex items-center justify-center shadow-lg shadow-[#f8ff96]/30">
                                    <Sparkles className="text-black animate-spin-slow w-8 h-8" />
                                </div>
                                <h3 className="text-2xl font-bold text-white">Enhancing</h3>
                                <p className="text-gray-400 mt-2 text-sm">Applying AI magic to your memory.</p>
                            </div>
                        )}

                        {/* Professional Cropping Modal */}
                        {isCropping && selectedSlide && (
                            <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 backdrop-blur-xl select-none">
                                 <h3 className="text-white text-lg mb-4 font-medium flex items-center gap-2">
                                     <Crop size={20} className="text-[#f8ff96]" /> Crop & Frame
                                 </h3>
                                 
                                 {/* Image Container */}
                                 <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden">
                                     <div className="relative shadow-2xl inline-block">
                                         {/* The visible image */}
                                         <img 
                                            ref={cropImgRef}
                                            src={selectedSlide.url} 
                                            alt="Crop target" 
                                            className="max-h-[70vh] max-w-[80vw] object-contain block pointer-events-none"
                                            draggable={false}
                                            onLoad={onCropImageLoad}
                                         />

                                         {/* Dark Overlay (Outside) */}
                                         {cropRect && (
                                             <>
                                                {/* Top */}
                                                <div style={{ height: cropRect.y, left: 0, right: 0, top: 0 }} className="absolute bg-black/70 backdrop-blur-[1px]" />
                                                {/* Bottom */}
                                                <div style={{ top: cropRect.y + cropRect.h, left: 0, right: 0, bottom: 0 }} className="absolute bg-black/70 backdrop-blur-[1px]" />
                                                {/* Left */}
                                                <div style={{ top: cropRect.y, height: cropRect.h, left: 0, width: cropRect.x }} className="absolute bg-black/70 backdrop-blur-[1px]" />
                                                {/* Right */}
                                                <div style={{ top: cropRect.y, height: cropRect.h, left: cropRect.x + cropRect.w, right: 0 }} className="absolute bg-black/70 backdrop-blur-[1px]" />

                                                {/* Crop Box */}
                                                <div 
                                                    style={{ 
                                                        left: cropRect.x, 
                                                        top: cropRect.y, 
                                                        width: cropRect.w, 
                                                        height: cropRect.h 
                                                    }} 
                                                    className="absolute ring-1 ring-white/80 shadow-[0_0_0_1px_rgba(0,0,0,0.5)] cursor-move group"
                                                    onMouseDown={(e) => handleCropMouseDown(e, 'move')}
                                                >
                                                    {/* Rule of Thirds Grid */}
                                                    <div className="w-full h-full grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40 group-hover:opacity-60 transition-opacity">
                                                        <div className="border-r border-b border-white/50"></div>
                                                        <div className="border-r border-b border-white/50"></div>
                                                        <div className="border-b border-white/50"></div>
                                                        <div className="border-r border-b border-white/50"></div>
                                                        <div className="border-r border-b border-white/50"></div>
                                                        <div className="border-b border-white/50"></div>
                                                        <div className="border-r border-white/50"></div>
                                                        <div className="border-r border-white/50"></div>
                                                        <div className=""></div>
                                                    </div>

                                                    {/* Corner Handles */}
                                                    <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-2 border-l-2 border-white bg-transparent cursor-nw-resize" onMouseDown={(e) => handleCropMouseDown(e, 'nw')} />
                                                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-2 border-r-2 border-white bg-transparent cursor-ne-resize" onMouseDown={(e) => handleCropMouseDown(e, 'ne')} />
                                                    <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-2 border-l-2 border-white bg-transparent cursor-sw-resize" onMouseDown={(e) => handleCropMouseDown(e, 'sw')} />
                                                    <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-2 border-r-2 border-white bg-transparent cursor-se-resize" onMouseDown={(e) => handleCropMouseDown(e, 'se')} />
                                                    
                                                    {/* Edge Handles (Invisible touch targets) */}
                                                    <div className="absolute top-0 left-4 right-4 h-2 -mt-1 cursor-n-resize" onMouseDown={(e) => handleCropMouseDown(e, 'n')} />
                                                    <div className="absolute bottom-0 left-4 right-4 h-2 -mb-1 cursor-s-resize" onMouseDown={(e) => handleCropMouseDown(e, 's')} />
                                                    <div className="absolute left-0 top-4 bottom-4 w-2 -ml-1 cursor-w-resize" onMouseDown={(e) => handleCropMouseDown(e, 'w')} />
                                                    <div className="absolute right-0 top-4 bottom-4 w-2 -mr-1 cursor-e-resize" onMouseDown={(e) => handleCropMouseDown(e, 'e')} />

                                                    {/* Center Move Icon (Visual hint) */}
                                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                                                        <Move className="text-white/50 drop-shadow-md" size={32} />
                                                    </div>
                                                </div>
                                             </>
                                         )}
                                     </div>
                                 </div>

                                 <div className="flex gap-4 mt-8">
                                     <button 
                                        onClick={() => setIsCropping(false)}
                                        className="glass-button px-8 py-3 rounded-full text-white text-sm font-medium"
                                     >
                                         Cancel
                                     </button>
                                     <button 
                                        onClick={performCrop}
                                        className="px-8 py-3 rounded-full bg-[#f8ff96] text-black hover:bg-[#e0e885] transition-colors font-medium text-sm shadow-lg shadow-[#f8ff96]/20 flex items-center gap-2"
                                     >
                                         <Check size={16} /> Apply Crop
                                     </button>
                                 </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Timeline moved here: Inside left column, below player */}
                    <Timeline 
                        slides={slides} 
                        selectedSlideId={selectedSlideId}
                        onSelectSlide={handleSelectSlide}
                        onReorder={(from, to) => {
                            const newSlides = [...slides];
                            const [moved] = newSlides.splice(from, 1);
                            newSlides.splice(to, 0, moved);
                            setSlides(newSlides);
                        }}
                        onDelete={(id) => {
                            setSlides(prev => prev.filter(s => s.id !== id));
                            if (selectedSlideId === id) setSelectedSlideId(null);
                        }}
                    />
                </div>

                {/* Right Sidebar: Properties */}
                <div className="w-80 glass-panel border-l border-white/5 p-8 overflow-y-auto flex flex-col gap-8 z-10 shrink-0 backdrop-blur-md">
                    
                    {/* Selected Slide Properties */}
                    {selectedSlide ? (
                        <div className="flex-1 space-y-8 animate-fadeIn">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-[#f8ff96]"></span>
                                Selected Media
                            </h2>

                            {/* Preview Box */}
                            <div className="aspect-video bg-black/40 rounded-2xl overflow-hidden border border-white/10 relative flex items-center justify-center group">
                                <div 
                                    style={{ transform: `rotate(${selectedSlide.rotation || 0}deg)`, transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}
                                    className="w-full h-full flex items-center justify-center p-2"
                                >
                                    {selectedSlide.type === 'video' ? (
                                        <video src={selectedSlide.url} className="max-w-full max-h-full object-contain rounded" />
                                    ) : (
                                        <img src={selectedSlide.url} alt="preview" className="max-w-full max-h-full object-contain rounded shadow-2xl" />
                                    )}
                                </div>
                            </div>
                            <div className="text-center">
                                <p className="text-xs text-gray-400 font-mono truncate px-4">{selectedSlide.name}</p>
                            </div>

                            {/* Actions */}
                            <div className="space-y-4">
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleRotate}
                                        className="glass-button flex-1 py-3 rounded-full text-gray-200 flex items-center justify-center gap-2 text-xs font-medium"
                                        title="Rotate 90°"
                                    >
                                        <RotateCw size={14} />
                                        Rotate
                                    </button>

                                    {selectedSlide.type === 'image' && (
                                        <button
                                            onClick={initiateCrop}
                                            className="glass-button flex-1 py-3 rounded-full text-gray-200 flex items-center justify-center gap-2 text-xs font-medium"
                                            title="Crop Image"
                                        >
                                            <Crop size={14} />
                                            Crop
                                        </button>
                                    )}
                                </div>
                                
                                <button
                                    onClick={handleDownloadSlide}
                                    className="glass-button w-full py-3 text-gray-200 rounded-full flex items-center justify-center gap-2 text-xs font-medium"
                                >
                                    <Download size={14} />
                                    Download File
                                </button>
                            </div>

                            {/* AI Tools */}
                            <div className="border-t border-white/10 pt-8 space-y-4">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-[#f8ff96] mb-4 flex items-center gap-2">
                                    <Sparkles size={12} /> AI Enhancements
                                </h3>
                                
                                {selectedSlide.type === 'image' && (
                                    <div className="grid grid-cols-1 gap-4">
                                        <button 
                                            onClick={handleRestore}
                                            className="glass-button w-full py-3.5 text-gray-200 rounded-full flex items-center justify-center gap-2 text-xs font-medium transition-all"
                                        >
                                            <RefreshCcw size={14} />
                                            Restore Image
                                        </button>
                                        
                                        <button 
                                            onClick={handleVeoAnimation}
                                            className="glass-button w-full py-3.5 text-gray-200 rounded-full flex items-center justify-center gap-2 text-xs font-medium transition-all"
                                        >
                                            <Film size={14} />
                                            Animate with Veo
                                        </button>
                                    </div>
                                )}
                                {selectedSlide.type === 'video' && (
                                    <p className="text-xs text-gray-600 text-center italic">No AI actions available for video clips yet.</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-white/5 to-transparent border border-white/10 flex items-center justify-center mb-6 shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]">
                                <MousePointerClick className="text-white/20" size={24} />
                            </div>
                            <p className="text-xs font-medium text-white/30 tracking-widest uppercase">Select media to customize</p>
                        </div>
                    )}
                </div>
            </>
        ) : (
            // --- Slide Master View (Grid) ---
            <div className="w-full h-full bg-transparent p-12 overflow-y-auto">
                 <div className="max-w-7xl mx-auto">
                    <h2 className="text-lg font-bold text-white mb-8 flex items-center gap-3 tracking-tight">
                        <LayoutGrid className="text-white/80" size={20} />
                        Slide Master
                        <span className="text-sm font-normal text-gray-500 ml-4 py-1 px-3 glass-button rounded-full">Drag to reorder • Double click to edit</span>
                    </h2>
                    
                    {slides.length === 0 ? (
                         <div className="flex flex-col items-center justify-center h-96 text-white/20 border-2 border-dashed border-white/10 rounded-3xl bg-white/5">
                             <p className="text-lg font-medium tracking-wide">No media added</p>
                         </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 pb-20">
                            {slides.map((slide, index) => (
                                <div
                                   key={slide.id}
                                   draggable
                                   onDragStart={(e) => handleDragStart(e, index)}
                                   onDragOver={handleDragOver}
                                   onDrop={(e) => handleDrop(e, index)}
                                   onDoubleClick={() => enterEditor(slide.id)}
                                   onClick={() => handleSelectSlide(slide.id)}
                                   className={`
                                       relative group aspect-square rounded-2xl overflow-hidden cursor-move transition-all duration-300
                                       ${selectedSlideId === slide.id ? 'ring-2 ring-[#f8ff96] shadow-2xl shadow-[#f8ff96]/20 scale-105 z-10' : 'ring-1 ring-white/10 hover:ring-white/30 hover:scale-105 bg-white/5'}
                                       ${draggedSlideIndex === index ? 'opacity-30' : 'opacity-100'}
                                   `}
                                >
                                    {/* Content */}
                                    <div className="w-full h-full p-4 flex items-center justify-center">
                                        {slide.type === 'video' ? (
                                            <video src={slide.url} className="w-full h-full object-contain pointer-events-none rounded shadow-lg" />
                                        ) : (
                                            <img src={slide.url} alt={slide.name} className="w-full h-full object-contain pointer-events-none rounded shadow-lg" />
                                        )}
                                    </div>

                                    {/* Overlay Actions - Reordered to be behind badges */}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px] z-10">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setSlides(prev => prev.filter(s => s.id !== slide.id)); }}
                                            className="p-3 bg-red-500/80 rounded-full text-white hover:bg-red-500 transition-colors shadow-lg transform hover:scale-110"
                                            title="Delete"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>

                                    {/* Badge Index - z-20 to sit above hover overlay */}
                                    <div 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const newPos = prompt(`Move slide ${index + 1} to position (1-${slides.length}):`, String(index + 1));
                                            if (newPos !== null) {
                                                const target = parseInt(newPos, 10);
                                                if (!isNaN(target) && target >= 1 && target <= slides.length && target !== index + 1) {
                                                    const newSlides = [...slides];
                                                    const [moved] = newSlides.splice(index, 1);
                                                    newSlides.splice(target - 1, 0, moved);
                                                    setSlides(newSlides);
                                                }
                                            }
                                        }}
                                        className="absolute top-3 left-3 w-7 h-7 bg-black/60 hover:bg-[#f8ff96] hover:text-black text-white text-xs font-bold rounded-full flex items-center justify-center backdrop-blur-md border border-white/10 z-20 cursor-pointer transition-colors"
                                        title="Click to move"
                                    >
                                        {index + 1}
                                    </div>

                                    {/* AI Badge - z-20 to sit above hover overlay */}
                                    {(slide.isRestored || slide.isGenerated) && (
                                        <div className="absolute top-3 right-3 bg-[#f8ff96] text-black p-1.5 rounded-full shadow-lg z-20">
                                            <Sparkles size={12} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                 </div>
            </div>
        )}

        <input 
            type="file" 
            multiple 
            accept="image/*,video/*" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload}
        />

      </div>
    </div>
  );
};

export default App;
