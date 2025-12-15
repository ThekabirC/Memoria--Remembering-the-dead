import React from 'react';
import { Slide } from '../types';
import { Trash2, ChevronLeft, ChevronRight, Wand2 } from 'lucide-react';

interface TimelineProps {
  slides: Slide[];
  selectedSlideId: string | null;
  onSelectSlide: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete: (id: string) => void;
}

const Timeline: React.FC<TimelineProps> = ({ 
  slides, 
  selectedSlideId, 
  onSelectSlide, 
  onReorder,
  onDelete 
}) => {
  
  const moveSlide = (index: number, direction: 'left' | 'right', e: React.MouseEvent) => {
    e.stopPropagation();
    if (direction === 'left' && index > 0) {
      onReorder(index, index - 1);
    } else if (direction === 'right' && index < slides.length - 1) {
      onReorder(index, index + 1);
    }
  };

  return (
    <div className="w-full h-36 glass-panel border-t border-white/5 p-4 overflow-x-auto custom-scrollbar z-20 shrink-0">
      <div className="flex space-x-4 min-w-max items-center h-full">
        {slides.map((slide, index) => (
          <div 
            key={slide.id}
            onClick={() => onSelectSlide(slide.id)}
            className={`
                group relative w-32 h-20 rounded-lg overflow-hidden cursor-pointer transition-all duration-300 ease-out
                ${selectedSlideId === slide.id ? 'ring-2 ring-[#f8ff96] shadow-[0_0_20px_rgba(248,255,150,0.3)] scale-105 z-10' : 'ring-1 ring-white/10 hover:ring-white/30 hover:scale-105 opacity-80 hover:opacity-100'}
            `}
          >
            {/* Thumbnail */}
            <div className="w-full h-full bg-black/50">
                {slide.type === 'video' ? (
                    <video src={slide.url} className="w-full h-full object-cover" muted />
                ) : (
                    <img src={slide.url} alt={slide.name} className="w-full h-full object-cover" />
                )}
            </div>

            {/* AI Badge if restored/generated */}
            {(slide.isRestored || slide.isGenerated) && (
                 <div className="absolute top-1 left-1 bg-[#f8ff96] p-0.5 rounded-full shadow-md">
                     <Wand2 className="w-2.5 h-2.5 text-black" />
                 </div>
            )}

            {/* Slide Index Badge */}
             <div className="absolute bottom-1 left-1 bg-black/60 text-[9px] text-white font-bold px-1.5 py-0.5 rounded-full backdrop-blur-md border border-white/10">
                {index + 1}
             </div>

            {/* Overlay Controls (Visible on Hover or Selected) */}
            <div className={`absolute inset-0 bg-black/60 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px] ${selectedSlideId === slide.id ? 'opacity-0 hover:opacity-100' : ''}`}>
               <button 
                  onClick={(e) => moveSlide(index, 'left', e)}
                  disabled={index === 0}
                  className="p-1 bg-white/10 rounded-full hover:bg-white/20 disabled:opacity-30 text-white border border-white/5"
               >
                 <ChevronLeft size={12} />
               </button>
               
               <button 
                  onClick={(e) => { e.stopPropagation(); onDelete(slide.id); }}
                  className="p-1 bg-red-500/80 rounded-full hover:bg-red-500 text-white shadow-lg"
               >
                 <Trash2 size={12} />
               </button>

               <button 
                  onClick={(e) => moveSlide(index, 'right', e)}
                  disabled={index === slides.length - 1}
                  className="p-1 bg-white/10 rounded-full hover:bg-white/20 disabled:opacity-30 text-white border border-white/5"
               >
                 <ChevronRight size={12} />
               </button>
            </div>
          </div>
        ))}
        
        {slides.length === 0 && (
            <div className="flex items-center justify-center w-full h-full text-gray-400 text-xs font-medium">
                <p>Add media to start</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default Timeline;