
import React, { useEffect, useRef } from 'react';
import { Slide } from '../types';
import { drawSlideToCanvas } from '../utils/videoUtils';

interface PlayerProps {
  slides: Slide[];
  currentTime: number;
  isPlaying: boolean;
  width?: number;
  height?: number;
}

const Player: React.FC<PlayerProps> = ({ 
  slides, 
  currentTime, 
  isPlaying,
  width = 1280,
  height = 720
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Hidden media elements for sourcing
  // We render all images/videos into the DOM but hidden, so the canvas can draw them.
  // For large slideshows (200+), lazy loading would be needed. For 50-200, browser cache handles it mostly okay.
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw immediately on updates
    drawSlideToCanvas(ctx, slides, currentTime, { width, height, fps: 30 });

    // Handle video playback syncing
    slides.forEach((slide) => {
       if (slide.type === 'video') {
           const vid = document.getElementById(`media-source-${slide.id}`) as HTMLVideoElement;
           if (vid) {
               // Calculate start time of this slide
               let startTime = 0;
               for(let s of slides) {
                   if (s.id === slide.id) break;
                   startTime += s.duration;
               }
               
               // If current global time is within this video slide's window
               if (currentTime >= startTime && currentTime < startTime + slide.duration) {
                   const seekTime = currentTime - startTime;
                   if (Math.abs(vid.currentTime - seekTime) > 0.5) {
                       vid.currentTime = seekTime;
                   }
                   if (isPlaying && vid.paused) vid.play().catch(e => console.log(e));
                   if (!isPlaying && !vid.paused) vid.pause();
               } else {
                   if (!vid.paused) vid.pause();
                   if (vid.currentTime !== 0) vid.currentTime = 0;
               }
           }
       }
    });

  }, [slides, currentTime, isPlaying, width, height]);

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10 flex items-center justify-center">
      <canvas 
        ref={canvasRef} 
        id="player-canvas"
        width={width} 
        height={height} 
        className="w-full h-full object-contain"
      />
      
      {/* Hidden Asset Store */}
      <div className="hidden">
        {slides.map(slide => (
            slide.type === 'video' ? (
                <video 
                    key={slide.id}
                    id={`media-source-${slide.id}`}
                    src={slide.url}
                    crossOrigin="anonymous"
                    muted // Muted for canvas drawing context usually, sound handled separately or ignored for simple MVP
                    playsInline
                />
            ) : (
                <img 
                    key={slide.id}
                    id={`media-source-${slide.id}`}
                    src={slide.url}
                    crossOrigin="anonymous"
                    alt={slide.name}
                />
            )
        ))}
      </div>
    </div>
  );
};

export default Player;
