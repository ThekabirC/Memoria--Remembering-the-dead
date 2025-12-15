
export interface Slide {
  id: string;
  url: string; // Data URL or Object URL
  type: 'image' | 'video';
  duration: number; // Seconds
  transitionDuration: number; // Seconds
  name: string;
  originalFile?: File;
  isRestored?: boolean;
  isGenerated?: boolean;
  rotation?: number; // Degrees 0, 90, 180, 270
}

export interface AppState {
  slides: Slide[];
  selectedSlideId: string | null;
  isPlaying: boolean;
  currentTime: number; // Current playback time in seconds
  totalDuration: number;
}

export interface RenderConfig {
  width: number;
  height: number;
  fps: number;
}

export enum AspectRatio {
  RATIO_1_1 = '1:1',
  RATIO_16_9 = '16:9',
  RATIO_9_16 = '9:16',
  RATIO_4_3 = '4:3',
  RATIO_3_4 = '3:4',
}

export enum ImageSize {
  SIZE_1K = '1K',
  SIZE_2K = '2K',
  SIZE_4K = '4K',
}
