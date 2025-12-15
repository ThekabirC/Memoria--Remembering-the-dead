
import { GoogleGenAI, Type } from "@google/genai";
import { AspectRatio, ImageSize } from "../types";

// Helper to check/request API key
export const checkApiKey = async (): Promise<void> => {
  if ((window as any).aistudio && (window as any).aistudio.hasSelectedApiKey) {
    const hasKey = await (window as any).aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await (window as any).aistudio.openSelectKey();
    }
  }
};

// Initialize GenAI
const getAI = () => {
  const apiKey = process.env.API_KEY || '';
  if (!apiKey) {
    console.warn("API Key not found in process.env");
  }
  return new GoogleGenAI({ apiKey });
};

export const restoreImage = async (base64Image: string): Promise<string> => {
  await checkApiKey();
  const ai = getAI();
  
  // Clean base64 string if it has prefix
  const data = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: data,
              mimeType: 'image/jpeg',
            },
          },
          {
            text: 'Restore this image. Fix scratches, reduce noise, improve sharpness and color balance while maintaining a natural look suitable for a memorial. Return ONLY the image.'
          },
        ],
      },
    });

    // Extract image from response
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image returned from restoration");
  } catch (error: any) {
    if (error.message?.includes("Requested entity was not found") || error.status === 404 || JSON.stringify(error).includes("Requested entity was not found")) {
         if ((window as any).aistudio?.openSelectKey) {
             await (window as any).aistudio.openSelectKey();
             throw new Error("API Key updated. Please try again.");
         }
    }
    throw error;
  }
};

export const generateVeoVideo = async (
  base64Image: string, 
  prompt: string = "Cinematic slow motion pan",
  aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<string> => {
  await checkApiKey();
  const ai = getAI();

   const data = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

  try {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      image: {
        imageBytes: data,
        mimeType: 'image/jpeg',
      },
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: aspectRatio,
      }
    });

    // Poll for completion
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({operation: operation});
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Video generation failed to return a URI");

    // Fetch the actual video bytes
    const res = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    if (!res.ok) throw new Error("Failed to download generated video");
    
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch (error: any) {
      // Check for 404 Entity Not Found - usually implies incorrect project selected for Veo
      if (error.message?.includes("Requested entity was not found") || error.status === 404 || JSON.stringify(error).includes("Requested entity was not found")) {
           console.warn("Veo API 404: Prompting for key re-selection");
           if ((window as any).aistudio?.openSelectKey) {
               await (window as any).aistudio.openSelectKey();
               throw new Error("Please try generating the video again with the updated project selection.");
           }
      }
      throw error;
  }
};

export const analyzeImageForCaption = async (base64Image: string): Promise<string> => {
  const ai = getAI();
  const data = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
  
  try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
          parts: [
            { inlineData: { data, mimeType: 'image/jpeg' } },
            { text: "Describe this image in a short, poetic sentence suitable for a slideshow caption." }
          ]
        }
      });

      return response.text || "A beautiful memory.";
  } catch (error: any) {
    if (error.message?.includes("Requested entity was not found") || error.status === 404) {
         if ((window as any).aistudio?.openSelectKey) {
             await (window as any).aistudio.openSelectKey();
             throw new Error("API Key updated. Please try again.");
         }
    }
    throw error;
  }
};
