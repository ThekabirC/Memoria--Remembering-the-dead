
import { Slide, RenderConfig } from "../types";

export const drawSlideToCanvas = (
  ctx: CanvasRenderingContext2D,
  slides: Slide[],
  time: number,
  config: RenderConfig
) => {
  const { width, height } = config;

  // Clear background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  let accumulatedTime = 0;
  let activeSlideIndex = -1;

  // Find active slide
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (time >= accumulatedTime && time < accumulatedTime + slide.duration) {
      activeSlideIndex = i;
      break;
    }
    accumulatedTime += slide.duration;
  }

  // If time is past the end, show the last slide (or black)
  if (activeSlideIndex === -1) {
      if (time >= accumulatedTime && slides.length > 0) {
          // Keep black for end of show.
          return;
      }
      return; 
  }

  const activeSlide = slides[activeSlideIndex];
  const slideTime = time - accumulatedTime; // Time elapsed within current slide

  // Get image element from DOM
  const getMediaElement = (id: string, type: 'image' | 'video'): HTMLElement | null => {
     return document.getElementById(`media-source-${id}`);
  }

  // Unified helper to draw media with rotation and 'contain' scaling
  const drawMedia = (media: HTMLElement, alpha: number, rotation: number = 0) => {
    if (alpha <= 0) return;
    
    ctx.save();
    ctx.globalAlpha = alpha;

    // Dimensions
    let w = 0, h = 0;
    if (media instanceof HTMLVideoElement) {
        w = media.videoWidth;
        h = media.videoHeight;
    } else if (media instanceof HTMLImageElement) {
        w = media.width;
        h = media.height;
    }

    if (w === 0 || h === 0) {
        ctx.restore();
        return;
    }

    // Translate to center
    ctx.translate(width / 2, height / 2);
    ctx.rotate((rotation * Math.PI) / 180);

    // Calculate effective dimensions in current bounding box
    const isRotated = rotation % 180 !== 0;
    const effectiveW = isRotated ? h : w;
    const effectiveH = isRotated ? w : h;

    // Use Math.min for Contain (Fit) to ensure full visibility without cropping
    const scale = Math.min(width / effectiveW, height / effectiveH);

    ctx.drawImage(
      media as CanvasImageSource, // Type assertion for cleaner code
      -w * scale / 2,
      -h * scale / 2,
      w * scale,
      h * scale
    );

    ctx.restore();
  };

  // --- Cross-Dissolve Logic ---
  // We use additive blending ('lighter') to prevent the brightness dip 
  // that occurs with standard alpha blending during cross-fades.
  
  let transitionProgress = 0;
  let isTransitioning = false;

  if (slideTime < activeSlide.transitionDuration) {
    transitionProgress = slideTime / activeSlide.transitionDuration;
    isTransitioning = true;
  }

  if (isTransitioning && activeSlideIndex > 0) {
      // Set composite operation to lighter (additive)
      // This ensures (ImageA * (1-t) + ImageB * t) maintains constant brightness
      ctx.globalCompositeOperation = 'lighter';

      // Draw Previous Slide (Fading Out)
      const prevSlide = slides[activeSlideIndex - 1];
      const prevEl = getMediaElement(prevSlide.id, prevSlide.type);
      if (prevEl) {
         drawMedia(prevEl, 1 - transitionProgress, prevSlide.rotation || 0);
      }

      // Draw Current Slide (Fading In)
      const el = getMediaElement(activeSlide.id, activeSlide.type);
      if (el) {
         drawMedia(el, transitionProgress, activeSlide.rotation || 0);
      }
      
      // Reset composite operation
      ctx.globalCompositeOperation = 'source-over';
  } else {
      // Standard Draw (No Transition)
      const el = getMediaElement(activeSlide.id, activeSlide.type);
      if (el) {
          drawMedia(el, 1, activeSlide.rotation || 0);
      }
  }
};
