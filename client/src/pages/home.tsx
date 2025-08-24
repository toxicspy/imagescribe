import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Upload, 
  Download, 
  Image as ImageIcon, 
  Loader2, 
  Eye, 
  EyeOff, 
  RotateCcw, 
  X,
  Check,
  Zap,
  Pipette,
  Info
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Extend global Window interface for Tesseract
declare global {
  interface Window {
    Tesseract: any;
  }
}

interface OCRWord {
  id: string;
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  isSelected?: boolean;
  isEdited?: boolean;
  originalText?: string;
  customColor?: string; // Store individual color per text object
  hasBackgroundBox?: boolean; // Whether this text has a background box
  backgroundBoxPaddingTop?: number; // Background box top padding for this text
  backgroundBoxPaddingBottom?: number; // Background box bottom padding for this text
  backgroundBoxPaddingLeft?: number; // Background box left padding for this text
  backgroundBoxPaddingRight?: number; // Background box right padding for this text
  backgroundBoxColor?: string; // Background box color for this text
}

interface OCRData {
  words: OCRWord[];
}

interface ReplacementHistoryItem {
  id: string;
  oldText: string;
  newText: string;
  timestamp: Date;
}

export default function Home() {
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [ocrData, setOcrData] = useState<OCRData | null>(null);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrProgressText, setOcrProgressText] = useState("");
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(false);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [replacementHistory, setReplacementHistory] = useState<ReplacementHistoryItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFont, setSelectedFont] = useState("Arial");
  const [useSmartErase, setUseSmartErase] = useState(true);
  const [usePerfectMatcher, setUsePerfectMatcher] = useState(true);
  const [fontSizeMultiplier, setFontSizeMultiplier] = useState(1.2);
  const [isEyedropperActive, setIsEyedropperActive] = useState(false);
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [showColorPreview, setShowColorPreview] = useState(false);
  const [colorPreviewPosition, setColorPreviewPosition] = useState({ x: 0, y: 0 });
  const [previewColor, setPreviewColor] = useState("#000000");
  const [useBackgroundBox, setUseBackgroundBox] = useState(false);
  const [backgroundBoxPaddingTop, setBackgroundBoxPaddingTop] = useState(2);
  const [backgroundBoxPaddingBottom, setBackgroundBoxPaddingBottom] = useState(2);
  const [backgroundBoxPaddingLeft, setBackgroundBoxPaddingLeft] = useState(2);
  const [backgroundBoxPaddingRight, setBackgroundBoxPaddingRight] = useState(2);
  const [backgroundBoxColor, setBackgroundBoxColor] = useState("#FFFFFF");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const setupCanvas = useCallback((img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas to exact pixel dimensions of the original image (no scaling)
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Draw the original image at full resolution
    ctx.drawImage(img, 0, 0);

    // Responsive canvas sizing - adapt to viewport
    const { naturalWidth, naturalHeight } = img;
    
    // Get available space (viewport minus sidebar and padding)
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate available space for canvas (accounting for sidebar and UI elements)
    const sidebarWidth = viewportWidth >= 1024 ? 320 : 0; // Hide sidebar on mobile
    const headerHeight = 73;
    const padding = 48; // 24px padding on each side
    
    const availableWidth = viewportWidth - sidebarWidth - padding;
    const availableHeight = viewportHeight - headerHeight - padding;
    
    // Calculate maximum display dimensions
    const maxDisplayWidth = Math.max(300, availableWidth * 0.95);
    const maxDisplayHeight = Math.max(200, availableHeight * 0.95);
    
    if (naturalWidth > maxDisplayWidth || naturalHeight > maxDisplayHeight) {
      const ratio = Math.min(maxDisplayWidth / naturalWidth, maxDisplayHeight / naturalHeight);
      canvas.style.width = `${naturalWidth * ratio}px`;
      canvas.style.height = `${naturalHeight * ratio}px`;
    } else {
      canvas.style.width = `${naturalWidth}px`;
      canvas.style.height = `${naturalHeight}px`;
    }
  }, []);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw at full resolution (canvas dimensions match original image)
    ctx.drawImage(originalImage, 0, 0);

    // Redraw any edited text
    if (ocrData) {
      ocrData.words.forEach(word => {
        if (word.isEdited && word.text !== word.originalText) {
          const { x0, y0, x1, y1 } = word.bbox;
          
          // Apply background reconstruction first
          if (usePerfectMatcher) {
            perfectBackgroundMatcher(ctx, x0, y0, x1, y1);
          } else if (useSmartErase) {
            // Simple background fill for redraw
            ctx.fillStyle = 'white';
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          }
          
          // Redraw the replacement text with its stored color, perfect font size, and perfect positioning
          const boxWidth = x1 - x0;
          const boxHeight = y1 - y0;
          const fontSize = calculatePerfectFontSize(ctx, word.text, boxWidth, boxHeight, selectedFont);
          const perfectPosition = calculatePerfectTextPosition(ctx, word.text, fontSize, selectedFont, x0, y0, y1);
          
          // Optionally draw background box if it was enabled for this text
          if (word.hasBackgroundBox && word.backgroundBoxPaddingTop !== undefined && word.backgroundBoxColor) {
            const expandedX0 = x0 - (word.backgroundBoxPaddingLeft || 0);
            const expandedY0 = y0 - (word.backgroundBoxPaddingTop || 0);
            const expandedX1 = x1 + (word.backgroundBoxPaddingRight || 0);
            const expandedY1 = y1 + (word.backgroundBoxPaddingBottom || 0);
            
            ctx.fillStyle = word.backgroundBoxColor;
            ctx.fillRect(expandedX0, expandedY0, expandedX1 - expandedX0, expandedY1 - expandedY0);
          }

          // Use the word's stored custom color, or fall back to black
          const textColor = word.customColor || '#000000';
          ctx.fillStyle = textColor;
          ctx.font = `bold ${fontSize}px ${selectedFont}, sans-serif`;
          ctx.textBaseline = 'alphabetic'; // Use natural baseline for precise positioning
          ctx.textAlign = 'left';
          ctx.fillText(word.text, perfectPosition.x, perfectPosition.y);
        }
      });
    }

    if (showBoundingBoxes && ocrData) {
      drawBoundingBoxes();
    }
  }, [originalImage, showBoundingBoxes, ocrData, selectedColor, selectedFont, fontSizeMultiplier, usePerfectMatcher, useSmartErase, useBackgroundBox, backgroundBoxPaddingTop, backgroundBoxPaddingBottom, backgroundBoxPaddingLeft, backgroundBoxPaddingRight, backgroundBoxColor]);

  const drawBoundingBoxes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ocrData || !originalImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ocrData.words.forEach(word => {
      if (word.text.trim().length > 1) {
        const { x0, y0, x1, y1 } = word.bbox;
        
        // Different colors for different states
        if (word.isSelected) {
          ctx.strokeStyle = '#00ff00'; // Green for selected
          ctx.lineWidth = 3;
          ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        } else if (word.isEdited) {
          ctx.strokeStyle = '#0066ff'; // Blue for edited
          ctx.lineWidth = 2;
        } else {
          ctx.strokeStyle = '#ef4444'; // Red for detected
          ctx.lineWidth = 2;
        }
        
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      }
    });
  }, [ocrData, originalImage]);

  const performOCR = useCallback(async (img: HTMLImageElement) => {
    if (!window.Tesseract) {
      toast({
        title: "OCR Library Not Available",
        description: "Tesseract.js library failed to load. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessingOCR(true);
    setOcrProgress(0);
    setOcrProgressText("Initializing OCR engine...");

    try {
      const { data } = await window.Tesseract.recognize(img, 'eng', {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            const progress = Math.round(m.progress * 100);
            setOcrProgress(progress);
            setOcrProgressText(`Recognizing text... ${progress}%`);
          }
        }
      });

      // Assign unique IDs to detected words
      const wordsWithIds = data.words.map((word: any, index: number) => ({
        ...word,
        id: `text_${Date.now()}_${index}`,
        isSelected: false,
        isEdited: false,
        originalText: word.text
      }));

      setOcrData({ words: wordsWithIds });
      setIsProcessingOCR(false);
      
      toast({
        title: "OCR Complete",
        description: `Detected ${wordsWithIds.filter((w: OCRWord) => w.text.trim().length > 1).length} words`,
      });
    } catch (error) {
      console.error('OCR Error:', error);
      setIsProcessingOCR(false);
      toast({
        title: "OCR Failed",
        description: "Failed to process the image. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);



  const handleImageUpload = useCallback((file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an image file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "File size must be under 10MB.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setOriginalImage(img);
        setupCanvas(img);
        performOCR(img);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [setupCanvas, performOCR, toast]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleImageUpload(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleImageUpload(files[0]);
    }
  };

  // Advanced background analysis and reconstruction
  const analyzeBackground = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => {
    const width = x1 - x0;
    const height = y1 - y0;
    const margin = Math.max(5, Math.min(width, height) * 0.3); // Slightly larger margin for better sampling
    
    // Sample ONLY the border around the text area, excluding the text itself
    const samples = [];
    const sampleSize = 2; // Smaller sample size for more precision
    
    // Top border (above the text)
    for (let x = x0 - margin; x <= x1 + margin; x += sampleSize) {
      for (let y = y0 - margin; y < y0 - 2; y += sampleSize) { // Stop 2px before text area
        if (x >= 0 && y >= 0 && x < ctx.canvas.width && y < ctx.canvas.height) {
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          samples.push({ x, y, r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] });
        }
      }
    }
    
    // Bottom border (below the text)
    for (let x = x0 - margin; x <= x1 + margin; x += sampleSize) {
      for (let y = y1 + 2; y <= y1 + margin; y += sampleSize) { // Start 2px after text area
        if (x >= 0 && y >= 0 && x < ctx.canvas.width && y < ctx.canvas.height) {
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          samples.push({ x, y, r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] });
        }
      }
    }
    
    // Left border (left of the text)
    for (let x = x0 - margin; x < x0 - 2; x += sampleSize) { // Stop 2px before text area
      for (let y = y0 - 2; y <= y1 + 2; y += sampleSize) {
        if (x >= 0 && y >= 0 && x < ctx.canvas.width && y < ctx.canvas.height) {
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          samples.push({ x, y, r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] });
        }
      }
    }
    
    // Right border (right of the text)
    for (let x = x1 + 2; x <= x1 + margin; x += sampleSize) { // Start 2px after text area
      for (let y = y0 - 2; y <= y1 + 2; y += sampleSize) {
        if (x >= 0 && y >= 0 && x < ctx.canvas.width && y < ctx.canvas.height) {
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          samples.push({ x, y, r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] });
        }
      }
    }
    
    console.log(`Background analysis: sampled ${samples.length} border pixels for area (${x0},${y0}) to (${x1},${y1})`);
    return samples;
  };

  const detectBackgroundType = (samples: any[]) => {
    if (samples.length === 0) return { type: 'solid', color: [255, 255, 255, 255] };
    
    // Calculate color variance
    let rVariance = 0, gVariance = 0, bVariance = 0;
    const avgR = samples.reduce((sum, s) => sum + s.r, 0) / samples.length;
    const avgG = samples.reduce((sum, s) => sum + s.g, 0) / samples.length;
    const avgB = samples.reduce((sum, s) => sum + s.b, 0) / samples.length;
    
    samples.forEach(s => {
      rVariance += Math.pow(s.r - avgR, 2);
      gVariance += Math.pow(s.g - avgG, 2);
      bVariance += Math.pow(s.b - avgB, 2);
    });
    
    const totalVariance = (rVariance + gVariance + bVariance) / (samples.length * 3);
    
    // Determine background type based on variance
    if (totalVariance < 100) {
      return { 
        type: 'solid', 
        color: [Math.round(avgR), Math.round(avgG), Math.round(avgB), 255]
      };
    } else if (totalVariance < 1000) {
      return { type: 'gradient', samples };
    } else {
      return { type: 'textured', samples };
    }
  };

  const reconstructSolidBackground = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: number[]) => {
    ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  };

  const reconstructGradientBackground = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, samples: any[]) => {
    // Create a smooth gradient based on surrounding samples
    const imageData = ctx.createImageData(x1 - x0, y1 - y0);
    const data = imageData.data;
    
    for (let y = 0; y < y1 - y0; y++) {
      for (let x = 0; x < x1 - x0; x++) {
        const globalX = x0 + x;
        const globalY = y0 + y;
        
        // Weighted interpolation based on distance to sample points
        let totalWeight = 0;
        let weightedR = 0, weightedG = 0, weightedB = 0;
        
        samples.forEach(sample => {
          const distance = Math.sqrt(Math.pow(globalX - sample.x, 2) + Math.pow(globalY - sample.y, 2));
          const weight = 1 / (distance + 1); // Inverse distance weighting
          
          totalWeight += weight;
          weightedR += sample.r * weight;
          weightedG += sample.g * weight;
          weightedB += sample.b * weight;
        });
        
        const pixelIndex = (y * (x1 - x0) + x) * 4;
        data[pixelIndex] = Math.round(weightedR / totalWeight);
        data[pixelIndex + 1] = Math.round(weightedG / totalWeight);
        data[pixelIndex + 2] = Math.round(weightedB / totalWeight);
        data[pixelIndex + 3] = 255;
      }
    }
    
    ctx.putImageData(imageData, x0, y0);
  };

  const reconstructTexturedBackground = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, samples: any[]) => {
    // Advanced content-aware fill using patch-based synthesis
    const width = x1 - x0;
    const height = y1 - y0;
    const patchSize = 9; // 9x9 patches for texture analysis
    const halfPatch = Math.floor(patchSize / 2);
    
    // Create source region excluding the text area
    const sourceRegions = [];
    const margin = Math.max(20, Math.min(width, height) * 0.5);
    
    // Collect source patches from surrounding areas
    for (let sy = y0 - margin; sy <= y1 + margin - patchSize; sy += 2) {
      for (let sx = x0 - margin; sx <= x1 + margin - patchSize; sx += 2) {
        if (sx >= 0 && sy >= 0 && sx + patchSize < ctx.canvas.width && sy + patchSize < ctx.canvas.height) {
          // Skip if patch overlaps with text area
          if (!(sx + patchSize > x0 && sx < x1 && sy + patchSize > y0 && sy < y1)) {
            try {
              const patchData = ctx.getImageData(sx, sy, patchSize, patchSize);
              sourceRegions.push({ x: sx, y: sy, data: patchData });
            } catch (e) {
              // Skip invalid regions
            }
          }
        }
      }
    }
    
    if (sourceRegions.length === 0) {
      // Fallback to gradient method
      reconstructGradientBackground(ctx, x0, y0, x1, y1, samples);
      return;
    }
    
    // Fill the text area using best-matching patches
    const targetImageData = ctx.createImageData(width, height);
    const targetData = targetImageData.data;
    
    // Process in overlapping blocks for seamless results
    const blockSize = 16;
    const overlap = 4;
    
    for (let by = 0; by < height; by += blockSize - overlap) {
      for (let bx = 0; bx < width; bx += blockSize - overlap) {
        const blockWidth = Math.min(blockSize, width - bx);
        const blockHeight = Math.min(blockSize, height - by);
        
        // Find best matching source patch
        let bestMatch = sourceRegions[0];
        let bestScore = Infinity;
        
        sourceRegions.forEach(source => {
          if (source.data.width >= blockWidth && source.data.height >= blockHeight) {
            const score = calculatePatchSimilarity(
              ctx, x0 + bx, y0 + by, blockWidth, blockHeight,
              source, halfPatch
            );
            
            if (score < bestScore) {
              bestScore = score;
              bestMatch = source;
            }
          }
        });
        
        // Copy best match to target with blending
        copyPatchWithBlending(
          bestMatch.data, targetData, 
          0, 0, bx, by, 
          blockWidth, blockHeight, width
        );
      }
    }
    
    ctx.putImageData(targetImageData, x0, y0);
  };

  const calculatePatchSimilarity = (ctx: CanvasRenderingContext2D, tx: number, ty: number, tw: number, th: number, source: any, margin: number) => {
    // Compare edge pixels to find best matching texture
    let similarity = 0;
    let sampleCount = 0;
    
    // Sample boundary pixels for comparison
    const boundaryPixels = [];
    
    // Top boundary
    for (let x = Math.max(0, tx - margin); x < Math.min(ctx.canvas.width, tx + tw + margin); x++) {
      if (ty > 0) {
        try {
          const pixel = ctx.getImageData(x, ty - 1, 1, 1).data;
          boundaryPixels.push(pixel);
        } catch (e) {}
      }
    }
    
    // Compare with source patch edges
    const sourceData = source.data.data;
    for (let i = 0; i < Math.min(boundaryPixels.length, sourceData.length / 4); i++) {
      const bp = boundaryPixels[i];
      const sp = [sourceData[i * 4], sourceData[i * 4 + 1], sourceData[i * 4 + 2]];
      
      similarity += Math.sqrt(
        Math.pow(bp[0] - sp[0], 2) + 
        Math.pow(bp[1] - sp[1], 2) + 
        Math.pow(bp[2] - sp[2], 2)
      );
      sampleCount++;
    }
    
    return sampleCount > 0 ? similarity / sampleCount : Infinity;
  };

  const copyPatchWithBlending = (sourceData: ImageData, targetData: Uint8ClampedArray, sx: number, sy: number, tx: number, ty: number, width: number, height: number, targetWidth: number) => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sourceIndex = ((sy + y) * sourceData.width + (sx + x)) * 4;
        const targetIndex = ((ty + y) * targetWidth + (tx + x)) * 4;
        
        if (sourceIndex >= 0 && sourceIndex < sourceData.data.length - 3 && 
            targetIndex >= 0 && targetIndex < targetData.length - 3) {
          // Simple copy with alpha blending
          const alpha = sourceData.data[sourceIndex + 3] / 255;
          targetData[targetIndex] = sourceData.data[sourceIndex] * alpha + targetData[targetIndex] * (1 - alpha);
          targetData[targetIndex + 1] = sourceData.data[sourceIndex + 1] * alpha + targetData[targetIndex + 1] * (1 - alpha);
          targetData[targetIndex + 2] = sourceData.data[sourceIndex + 2] * alpha + targetData[targetIndex + 2] * (1 - alpha);
          targetData[targetIndex + 3] = 255;
        }
      }
    }
  };

  const perfectBackgroundMatcher = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => {
    try {
      // Step 1: Analyze surrounding background
      const samples = analyzeBackground(ctx, x0, y0, x1, y1);
      const backgroundType = detectBackgroundType(samples);
      
      // Step 2: Apply appropriate reconstruction method
      switch (backgroundType.type) {
        case 'solid':
          if (backgroundType.color) {
            reconstructSolidBackground(ctx, x0, y0, x1, y1, backgroundType.color);
          }
          break;
        case 'gradient':
          if (backgroundType.samples) {
            reconstructGradientBackground(ctx, x0, y0, x1, y1, backgroundType.samples);
          }
          break;
        case 'textured':
          if (backgroundType.samples) {
            reconstructTexturedBackground(ctx, x0, y0, x1, y1, backgroundType.samples);
          }
          break;
        default:
          // Fallback to simple fill
          ctx.fillStyle = 'white';
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    } catch (error) {
      console.warn('Background matching failed, using fallback:', error);
      // Safe fallback
      ctx.fillStyle = 'white';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  };

  // Helper function to get average background color for legacy smart erase
  const getAverageBackgroundColor = (imageData: ImageData): string => {
    let r = 0, g = 0, b = 0;
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    
    const pixelCount = data.length / 4;
    return `rgb(${Math.round(r / pixelCount)}, ${Math.round(g / pixelCount)}, ${Math.round(b / pixelCount)})`;
  };

  // Helper function to automatically detect text color from the center of bounding box
  const getTextColor = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): string => {
    const centerX = Math.floor((x0 + x1) / 2);
    const centerY = Math.floor((y0 + y1) / 2);
    
    try {
      const pixel = ctx.getImageData(centerX, centerY, 1, 1).data;
      const textColor = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
      console.log(`Sampled text color at (${centerX}, ${centerY}):`, textColor, `[R:${pixel[0]}, G:${pixel[1]}, B:${pixel[2]}]`);
      return textColor;
    } catch (error) {
      console.warn('Text color sampling failed, using black fallback:', error);
      // Fallback to black if sampling fails
      return 'rgb(0, 0, 0)';
    }
  };

  // Helper function to calculate perfect font size using measureText for pixel-perfect matching
  const calculatePerfectFontSize = (ctx: CanvasRenderingContext2D, text: string, targetWidth: number, targetHeight: number, fontFamily: string): number => {
    // Start with height-based estimation
    let fontSize = Math.floor(targetHeight * 0.9); // Good starting point based on bounding box height
    let attempts = 0;
    const maxAttempts = 50; // Prevent infinite loops
    
    // Fine-tune using measureText to match width
    while (attempts < maxAttempts) {
      ctx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;
      const metrics = ctx.measureText(text);
      const currentWidth = metrics.width;
      
      // Check if we're within acceptable range (±2px tolerance)
      if (Math.abs(currentWidth - targetWidth) <= 2) {
        break;
      }
      
      // Adjust font size based on width difference
      if (currentWidth > targetWidth) {
        fontSize = Math.max(8, fontSize - 1); // Don't go below 8px
      } else {
        fontSize = Math.min(72, fontSize + 1); // Don't go above 72px
      }
      
      attempts++;
    }
    
    console.log(`Perfect font size calculated: ${fontSize}px for text "${text}" (target: ${targetWidth}x${targetHeight})`);
    return fontSize;
  };

  // Helper function to calculate perfect text position using actual bounding box metrics
  const calculatePerfectTextPosition = (ctx: CanvasRenderingContext2D, text: string, fontSize: number, fontFamily: string, bboxX0: number, bboxY0: number, bboxY1: number): { x: number, y: number } => {
    ctx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;
    const metrics = ctx.measureText(text);
    
    // Use actual bounding box metrics if available (modern browsers)
    if (metrics.actualBoundingBoxAscent !== undefined && metrics.actualBoundingBoxDescent !== undefined) {
      const ascent = metrics.actualBoundingBoxAscent;
      const descent = metrics.actualBoundingBoxDescent;
      
      // Position text so it fits exactly within the OCR bounding box
      const x = bboxX0;
      const y = bboxY1 - descent; // Align bottom of text with bottom of bbox
      
      console.log(`Perfect positioning: ascent=${ascent}, descent=${descent}, y=${y}`);
      return { x, y };
    } else {
      // Fallback for older browsers - use approximation
      const x = bboxX0;
      const y = bboxY1 - (fontSize * 0.2); // Approximate descent
      
      console.log(`Fallback positioning: y=${y}`);
      return { x, y };
    }
  };

  // Helper function to convert RGB to HEX format
  const rgbToHex = (r: number, g: number, b: number): string => {
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
  };

  // Helper function to get color from canvas at specific position
  const getColorAtPosition = (ctx: CanvasRenderingContext2D, x: number, y: number): { hex: string; rgb: string } => {
    try {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
      const rgb = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
      return { hex, rgb };
    } catch (error) {
      return { hex: '#000000', rgb: 'rgb(0, 0, 0)' };
    }
  };

  // Eyedropper functionality
  const toggleEyedropper = () => {
    setIsEyedropperActive(!isEyedropperActive);
    if (isEyedropperActive) {
      setShowColorPreview(false);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isEyedropperActive || !originalImage) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    
    // Ensure coordinates are within bounds
    if (x >= 0 && y >= 0 && x < canvas.width && y < canvas.height) {
      const { hex } = getColorAtPosition(ctx, x, y);
      setPreviewColor(hex);
      setColorPreviewPosition({
        x: e.clientX + 10,
        y: e.clientY - 10
      });
      setShowColorPreview(true);
    }
  };

  // Function to find which text was clicked
  const findTextByCoordinates = (x: number, y: number): OCRWord | null => {
    if (!ocrData) return null;
    
    return ocrData.words.find(word => {
      const { x0, y0, x1, y1 } = word.bbox;
      return x >= x0 && x <= x1 && y >= y0 && y <= y1;
    }) || null;
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!originalImage) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    
    // Ensure coordinates are within bounds
    if (x >= 0 && y >= 0 && x < canvas.width && y < canvas.height) {
      if (isEyedropperActive) {
        // Eyedropper functionality
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const { hex, rgb } = getColorAtPosition(ctx, x, y);
        setSelectedColor(hex);
        setIsEyedropperActive(false);
        setShowColorPreview(false);
        
        toast({
          title: "Color Picked",
          description: `Selected color: ${hex} (${rgb})`,
        });
      } else {
        // Text selection functionality
        const clickedText = findTextByCoordinates(x, y);
        console.log("Canvas click detected at:", x, y, "Found text:", clickedText);
        
        if (clickedText) {
          console.log("Selecting text with ID:", clickedText.id, "Text:", clickedText.text);
          
          // Clear previous selection and select this text
          setOcrData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              words: prev.words.map(word => ({
                ...word,
                isSelected: word.id === clickedText.id
              }))
            };
          });
          
          setSelectedTextId(clickedText.id);
          setNewText(clickedText.text); // Pre-populate with current text
          
          toast({
            title: "Text Selected",
            description: `Selected: "${clickedText.text}"`,
          });
        } else {
          // Clear selection if clicking on empty area
          setOcrData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              words: prev.words.map(word => ({
                ...word,
                isSelected: false
              }))
            };
          });
          setSelectedTextId(null);
          setNewText("");
        }
      }
    }
  };

  const handleCanvasMouseLeave = () => {
    if (isEyedropperActive) {
      setShowColorPreview(false);
    }
  };

  const handleTextReplacement = () => {
    console.log("=== TEXT REPLACEMENT STARTED ===");
    console.log("Selected text ID:", selectedTextId);
    console.log("New text:", newText);
    
    if (!selectedTextId || !newText.trim()) {
      toast({
        title: "Missing Selection",
        description: "Please select a text and enter replacement text.",
        variant: "destructive",
      });
      return;
    }

    if (!ocrData || !originalImage) {
      toast({
        title: "No OCR Data",
        description: "Please upload an image first.",
        variant: "destructive",
      });
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Find the selected word
    const selectedWord = ocrData.words.find(word => word.id === selectedTextId);
    console.log("Found selected word:", selectedWord);
    
    if (!selectedWord) {
      toast({
        title: "Text Not Found",
        description: "Selected text no longer available.",
        variant: "destructive",
      });
      return;
    }

    let replacementMade = false;
    
    // Only replace the specific selected word
    if (selectedWord) {
        const { x0, y0, x1, y1 } = selectedWord.bbox;
        
        // No scaling needed since canvas dimensions match original image dimensions
        const canvasX0 = x0;
        const canvasY0 = y0;
        const canvasX1 = x1;
        const canvasY1 = y1;

        // Step 1: Sample text color from ORIGINAL text area BEFORE any background processing
        const originalTextColor = getTextColor(ctx, canvasX0, canvasY0, canvasX1, canvasY1);
        console.log("=== TEXT REPLACEMENT DEBUG ===");
        console.log("Text area bounds:", { x0: canvasX0, y0: canvasY0, x1: canvasX1, y1: canvasY1 });
        console.log("Original text color sampled:", originalTextColor);
        
        // Step 2: Apply background reconstruction (this will fill the text area with background)
        if (usePerfectMatcher) {
          console.log("Using Perfect Background Matcher");
          perfectBackgroundMatcher(ctx, canvasX0, canvasY0, canvasX1, canvasY1);
        } else if (useSmartErase) {
          // Legacy smart erase method - sample background around text area, not from text area
          console.log("Using Legacy Smart Erase");
          try {
            const margin = 10;
            const backgroundSamples = [];
            
            // Sample background pixels around the text area (not from inside it)
            for (let x = canvasX0 - margin; x <= canvasX1 + margin; x += 3) {
              for (let y = canvasY0 - margin; y <= canvasY1 + margin; y += 3) {
                // Skip pixels inside the text area
                if (x < canvasX0 || x > canvasX1 || y < canvasY0 || y > canvasY1) {
                  if (x >= 0 && y >= 0 && x < ctx.canvas.width && y < ctx.canvas.height) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    backgroundSamples.push({ r: pixel[0], g: pixel[1], b: pixel[2] });
                  }
                }
              }
            }
            
            if (backgroundSamples.length > 0) {
              const avgR = Math.round(backgroundSamples.reduce((sum, s) => sum + s.r, 0) / backgroundSamples.length);
              const avgG = Math.round(backgroundSamples.reduce((sum, s) => sum + s.g, 0) / backgroundSamples.length);
              const avgB = Math.round(backgroundSamples.reduce((sum, s) => sum + s.b, 0) / backgroundSamples.length);
              const backgroundFillColor = `rgb(${avgR}, ${avgG}, ${avgB})`;
              
              console.log("Background fill color:", backgroundFillColor);
              ctx.fillStyle = backgroundFillColor;
              ctx.fillRect(canvasX0, canvasY0, canvasX1 - canvasX0, canvasY1 - canvasY0);
            } else {
              ctx.fillStyle = 'white';
              ctx.fillRect(canvasX0, canvasY0, canvasX1 - canvasX0, canvasY1 - canvasY0);
            }
          } catch (error) {
            console.warn("Smart erase failed:", error);
            ctx.fillStyle = 'white';
            ctx.fillRect(canvasX0, canvasY0, canvasX1 - canvasX0, canvasY1 - canvasY0);
          }
        } else {
          // Simple white fill
          console.log("Using simple white background fill");
          ctx.fillStyle = 'white';
          ctx.fillRect(canvasX0, canvasY0, canvasX1 - canvasX0, canvasY1 - canvasY0);
        }

        // Calculate perfect font size using both width and height for pixel-perfect matching
        const boxWidth = canvasX1 - canvasX0;
        const boxHeight = canvasY1 - canvasY0;
        const fontSize = calculatePerfectFontSize(ctx, newText, boxWidth, boxHeight, selectedFont);
        
        // Step 3: Determine final text color (NEVER use background color for text)
        let finalTextColor;
        if (selectedColor !== "#000000") {
          // User has selected a custom color with eyedropper
          finalTextColor = selectedColor;
          console.log("Using eyedropper color for text:", finalTextColor);
        } else {
          // Use original text color that we sampled before background replacement
          finalTextColor = originalTextColor;
          console.log("Using auto-detected original text color:", finalTextColor);
        }
        
        // Step 4: Optionally draw background box if enabled
        if (useBackgroundBox) {
          const expandedX0 = canvasX0 - backgroundBoxPaddingLeft;
          const expandedY0 = canvasY0 - backgroundBoxPaddingTop;
          const expandedX1 = canvasX1 + backgroundBoxPaddingRight;
          const expandedY1 = canvasY1 + backgroundBoxPaddingBottom;
          
          console.log("Drawing background box:", {
            color: backgroundBoxColor,
            paddingTop: backgroundBoxPaddingTop,
            paddingBottom: backgroundBoxPaddingBottom,
            paddingLeft: backgroundBoxPaddingLeft,
            paddingRight: backgroundBoxPaddingRight,
            bounds: { x0: expandedX0, y0: expandedY0, x1: expandedX1, y1: expandedY1 }
          });
          
          ctx.fillStyle = backgroundBoxColor;
          ctx.fillRect(expandedX0, expandedY0, expandedX1 - expandedX0, expandedY1 - expandedY0);
        }

        // Step 5: Calculate perfect text position using actual bounding box metrics
        const perfectPosition = calculatePerfectTextPosition(ctx, newText, fontSize, selectedFont, canvasX0, canvasY0, canvasY1);
        
        // Step 6: Set text properties with EXPLICIT text color and perfect positioning
        ctx.fillStyle = finalTextColor; // This should NEVER be white if original text was black
        ctx.font = `bold ${fontSize}px ${selectedFont}, sans-serif`;
        ctx.textBaseline = 'alphabetic'; // Use natural baseline for precise positioning
        ctx.textAlign = 'left';
        
        console.log("Final text color applied:", finalTextColor);
        console.log("Font size calculated:", fontSize, "from box dimensions:", boxWidth + "x" + boxHeight);
        console.log("Perfect positioning calculated:", perfectPosition);
        
        // Optional: Draw debug border around original text area (remove in production)
        // ctx.strokeStyle = '#ff0000';
        // ctx.lineWidth = 1;
        // ctx.strokeRect(canvasX0, canvasY0, canvasX1 - canvasX0, canvasY1 - canvasY0);
        
        // Draw new text with pixel-perfect positioning
        console.log("Drawing replacement text:", newText, "at perfect position:", perfectPosition.x, perfectPosition.y);
        console.log("Font settings:", ctx.font, "Fill style:", ctx.fillStyle);
        ctx.fillText(newText, perfectPosition.x, perfectPosition.y);

        // Update the word in OCR data to mark as edited and store its styling
        setOcrData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            words: prev.words.map(word => 
              word.id === selectedTextId 
                ? { 
                    ...word, 
                    text: newText, 
                    isEdited: true, 
                    isSelected: false,
                    customColor: finalTextColor, // Store the specific color used for this text
                    hasBackgroundBox: useBackgroundBox, // Store whether background box was used
                    backgroundBoxPaddingTop: useBackgroundBox ? backgroundBoxPaddingTop : undefined,
                    backgroundBoxPaddingBottom: useBackgroundBox ? backgroundBoxPaddingBottom : undefined,
                    backgroundBoxPaddingLeft: useBackgroundBox ? backgroundBoxPaddingLeft : undefined,
                    backgroundBoxPaddingRight: useBackgroundBox ? backgroundBoxPaddingRight : undefined,
                    backgroundBoxColor: useBackgroundBox ? backgroundBoxColor : undefined
                  }
                : { ...word, isSelected: false }
            )
          };
        });

        replacementMade = true;
        
        // Force canvas redraw to show the changes
        console.log("Text replacement completed, forcing redraw...");
    }

    if (replacementMade) {
      const newHistoryItem: ReplacementHistoryItem = {
        id: Date.now().toString(),
        oldText: selectedWord.originalText || selectedWord.text,
        newText,
        timestamp: new Date(),
      };
      
      setReplacementHistory(prev => [newHistoryItem, ...prev.slice(0, 4)]);
      setSelectedTextId(null);
      setNewText("");
      
      // Redraw canvas to show changes immediately
      redrawCanvas();
      
      toast({
        title: "Text Replaced",
        description: `Replaced "${selectedWord.text}" with "${newText}"`,
      });
    } else {
      toast({
        title: "Text Not Found",
        description: "Selected text could not be replaced.",
        variant: "destructive",
      });
    }
  };

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      toast({
        title: "No Image",
        description: "No image to download.",
        variant: "destructive",
      });
      return;
    }

    const link = document.createElement('a');
    link.download = 'edited-screenshot.png';
    // Use PNG format for lossless compression and preserve quality
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Download Complete",
      description: "High-quality PNG image downloaded successfully.",
    });
  };

  const resetToOriginal = () => {
    if (originalImage) {
      // Reset OCR data to original state
      if (ocrData) {
        setOcrData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            words: prev.words.map(word => ({
              ...word,
              text: word.originalText || word.text,
              isEdited: false,
              isSelected: false
            }))
          };
        });
      }
      
      redrawCanvas();
      setReplacementHistory([]);
      setSelectedTextId(null);
      setNewText("");
      
      toast({
        title: "Reset Complete",
        description: "Image reset to original state.",
      });
    }
  };

  const removeHistoryItem = (id: string) => {
    setReplacementHistory(prev => prev.filter(item => item.id !== id));
  };

  const selectDetectedWord = (wordObj: OCRWord) => {
    // Clear previous selections and select this word
    setOcrData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        words: prev.words.map(w => ({
          ...w,
          isSelected: w.id === wordObj.id
        }))
      };
    });
    
    setSelectedTextId(wordObj.id);
    setNewText(wordObj.text);
  };

  // Handle window resize to adjust canvas size
  useEffect(() => {
    const handleResize = () => {
      if (originalImage) {
        setupCanvas(originalImage);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [originalImage, setupCanvas]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  const validWords = ocrData?.words.filter(word => word.text.trim().length > 1) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">ScreenText Editor</h1>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <Button 
              onClick={downloadImage} 
              disabled={!originalImage}
              className="bg-primary hover:bg-primary/90"
              size="sm"
            >
              <Download className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Download</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row h-[calc(100vh-73px)]">
        {/* Sidebar */}
        <div className="w-full lg:w-80 bg-white border-b lg:border-b-0 lg:border-r border-gray-200 flex flex-col order-2 lg:order-1">
          {/* Upload Section */}
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-4">Upload Image</h3>
            <div 
              className={`upload-area border-2 border-dashed rounded-lg p-4 sm:p-6 text-center cursor-pointer ${
                isDragOver ? 'drag-over border-primary' : 'border-gray-300 hover:border-primary'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-medium text-primary">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 10MB</p>
            </div>
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept="image/*"
              onChange={handleFileInputChange}
            />
          </div>

          {/* OCR Processing Status */}
          {isProcessingOCR && (
            <div className="p-4 sm:p-6 border-b border-gray-200">
              <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-4">Text Recognition</h3>
              <div className="space-y-3">
                <div className="flex items-center">
                  <Loader2 className="animate-spin h-4 w-4 text-primary mr-3" />
                  <span className="text-sm text-gray-600">Scanning image for text...</span>
                </div>
                <Progress value={ocrProgress} className="w-full" />
                <p className="text-xs text-gray-500">{ocrProgressText}</p>
              </div>
            </div>
          )}

          {/* Text Replacement Controls */}
          {ocrData && !isProcessingOCR && (
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
              <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-4">Text Replacement</h3>
              
              {/* Detected Words */}
              <div className="mb-6">
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Detected Words</Label>
                <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {validWords.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {validWords.map((word, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="detected-word cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                          onClick={() => selectDetectedWord(word)}
                          title={`Confidence: ${Math.round(word.confidence)}%`}
                        >
                          {word.text}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No text detected in image</p>
                  )}
                </div>
              </div>

              {/* Replacement Form */}
              <div className="space-y-4">
                {selectedTextId ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-green-800">Selected Text</p>
                        <p className="text-sm text-green-600">
                          {ocrData.words.find(w => w.id === selectedTextId)?.text}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedTextId(null);
                          setNewText("");
                          setOcrData(prev => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              words: prev.words.map(word => ({
                                ...word,
                                isSelected: false
                              }))
                            };
                          });
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <div className="flex items-start space-x-2">
                      <Info className="w-4 h-4 text-blue-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-800">How to Edit Text</p>
                        <p className="text-xs text-blue-600 mt-1">
                          Click on any text in the image to select it, or click on a detected word above.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                <div>
                  <Label htmlFor="newText" className="text-sm font-medium text-gray-700 mb-1 block">
                    Replacement Text
                  </Label>
                  <Input
                    id="newText"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder={selectedTextId ? "Enter new text" : "Select text first"}
                    disabled={!selectedTextId}
                  />
                </div>

                {/* Text Styling Options */}
                <div className="border-t border-gray-200 pt-4 space-y-4">
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">Text Style Options</Label>
                  
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="fontSelect" className="text-xs text-gray-600 mb-1 block">Font Family</Label>
                      <select
                        id="fontSelect"
                        value={selectedFont}
                        onChange={(e) => setSelectedFont(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="Arial">Arial</option>
                        <option value="Helvetica">Helvetica</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Verdana">Verdana</option>
                        <option value="Courier New">Courier New</option>
                        <option value="Impact">Impact</option>
                        <option value="Trebuchet MS">Trebuchet MS</option>
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="fontSizeMultiplier" className="text-xs text-gray-600 mb-1 block">
                        Font Size Calibration: {fontSizeMultiplier}x
                      </Label>
                      <input
                        id="fontSizeMultiplier"
                        type="range"
                        min="0.8"
                        max="1.8"
                        step="0.1"
                        value={fontSizeMultiplier}
                        onChange={(e) => setFontSizeMultiplier(parseFloat(e.target.value))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>Smaller</span>
                        <span>Perfect Match</span>
                        <span>Larger</span>
                      </div>
                    </div>

                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="flex items-start space-x-2">
                        <Check className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-blue-800">
                          <div className="font-medium">Automatic Detection</div>
                          <div>Font size (calibrated) and color are automatically matched from the original text</div>
                        </div>
                      </div>
                    </div>

                    {/* Color Selection Display */}
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-600">Selected Text Color</Label>
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-8 h-8 rounded border border-gray-300"
                          style={{ backgroundColor: selectedColor }}
                          data-testid="color-preview"
                        ></div>
                        <div className="text-xs text-gray-600">
                          <div>{selectedColor}</div>
                          <div className="text-gray-400">
                            {selectedColor === "#000000" ? "Auto-detect mode (will sample text color)" : "Custom color from eyedropper"}
                          </div>
                        </div>
                        {selectedColor !== "#000000" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedColor("#000000")}
                            className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700"
                            data-testid="button-reset-color"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Background Box Options */}
                    <div className="space-y-3 border-t border-gray-200 pt-4">
                      <div className="flex items-center space-x-2">
                        <input
                          id="useBackgroundBox"
                          type="checkbox"
                          checked={useBackgroundBox}
                          onChange={(e) => setUseBackgroundBox(e.target.checked)}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                          data-testid="checkbox-background-box"
                        />
                        <Label htmlFor="useBackgroundBox" className="text-xs text-gray-600">
                          Add background box behind text (helps cover stubborn original text)
                        </Label>
                      </div>

                      {useBackgroundBox && (
                        <div className="ml-6 space-y-3">
                          <div className="space-y-3">
                            <div>
                              <Label htmlFor="backgroundBoxPaddingTop" className="text-xs text-gray-600 mb-1 block">
                                Top Padding: {backgroundBoxPaddingTop}px
                              </Label>
                              <input
                                id="backgroundBoxPaddingTop"
                                type="range"
                                min="0"
                                max="15"
                                step="1"
                                value={backgroundBoxPaddingTop}
                                onChange={(e) => setBackgroundBoxPaddingTop(parseInt(e.target.value))}
                                className="w-full"
                                data-testid="slider-background-box-padding-top"
                              />
                            </div>
                            
                            <div>
                              <Label htmlFor="backgroundBoxPaddingBottom" className="text-xs text-gray-600 mb-1 block">
                                Bottom Padding: {backgroundBoxPaddingBottom}px
                              </Label>
                              <input
                                id="backgroundBoxPaddingBottom"
                                type="range"
                                min="0"
                                max="15"
                                step="1"
                                value={backgroundBoxPaddingBottom}
                                onChange={(e) => setBackgroundBoxPaddingBottom(parseInt(e.target.value))}
                                className="w-full"
                                data-testid="slider-background-box-padding-bottom"
                              />
                            </div>
                            
                            <div>
                              <Label htmlFor="backgroundBoxPaddingLeft" className="text-xs text-gray-600 mb-1 block">
                                Left Padding: {backgroundBoxPaddingLeft}px
                              </Label>
                              <input
                                id="backgroundBoxPaddingLeft"
                                type="range"
                                min="0"
                                max="15"
                                step="1"
                                value={backgroundBoxPaddingLeft}
                                onChange={(e) => setBackgroundBoxPaddingLeft(parseInt(e.target.value))}
                                className="w-full"
                                data-testid="slider-background-box-padding-left"
                              />
                            </div>
                            
                            <div>
                              <Label htmlFor="backgroundBoxPaddingRight" className="text-xs text-gray-600 mb-1 block">
                                Right Padding: {backgroundBoxPaddingRight}px
                              </Label>
                              <input
                                id="backgroundBoxPaddingRight"
                                type="range"
                                min="0"
                                max="20"
                                step="1"
                                value={backgroundBoxPaddingRight}
                                onChange={(e) => setBackgroundBoxPaddingRight(parseInt(e.target.value))}
                                className="w-full"
                                data-testid="slider-background-box-padding-right"
                              />
                            </div>
                            
                            <div className="flex justify-between text-xs text-gray-500">
                              <span>0px</span>
                              <span>10px</span>
                              <span>20px</span>
                            </div>
                          </div>
                          
                          <div>
                            <Label className="text-xs text-gray-600 mb-1 block">Background Color</Label>
                            <div className="flex items-center space-x-2">
                              <input
                                type="color"
                                value={backgroundBoxColor}
                                onChange={(e) => setBackgroundBoxColor(e.target.value)}
                                className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                                title="Choose background box color"
                                data-testid="input-background-box-color"
                              />
                              <div className="text-xs text-gray-600">
                                <div>{backgroundBoxColor}</div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    if (originalImage && canvasRef.current) {
                                      const canvas = canvasRef.current;
                                      const ctx = canvas.getContext('2d');
                                      const selectedWord = ocrData?.words.find(w => w.id === selectedTextId);
                                      if (ctx && selectedWord) {
                                        // Sample color from around the text area
                                        const { x0, y0, x1, y1 } = selectedWord.bbox;
                                        const centerX = Math.floor((x0 + x1) / 2);
                                        const centerY = Math.floor(y0 - 5); // Sample slightly above the text
                                        const color = getColorAtPosition(ctx, centerX, centerY);
                                        setBackgroundBoxColor(color.hex);
                                      }
                                    }
                                  }}
                                  className="h-6 text-xs"
                                  disabled={!selectedTextId}
                                  data-testid="button-auto-detect-bg-color"
                                >
                                  Auto-detect
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="bg-amber-50 p-2 rounded-lg">
                            <div className="flex items-start space-x-2">
                              <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                              <div className="text-xs text-amber-800">
                                <div className="font-medium">Background Box</div>
                                <div>Use this when original text is still faintly visible. Adjust the size to fully cover the original word.</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <input
                          id="perfectMatcher"
                          type="checkbox"
                          checked={usePerfectMatcher}
                          onChange={(e) => setUsePerfectMatcher(e.target.checked)}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <Label htmlFor="perfectMatcher" className="text-xs text-gray-600">
                          Perfect Background Matcher (intelligent texture reconstruction)
                        </Label>
                      </div>
                      
                      {!usePerfectMatcher && (
                        <div className="flex items-center space-x-2 ml-6">
                          <input
                            id="smartErase"
                            type="checkbox"
                            checked={useSmartErase}
                            onChange={(e) => setUseSmartErase(e.target.checked)}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <Label htmlFor="smartErase" className="text-xs text-gray-600">
                            Legacy smart erase (basic color sampling)
                          </Label>
                        </div>
                      )}
                    </div>

                    {/* Background Matcher Information */}
                    <div className={`p-3 rounded-lg ${usePerfectMatcher ? 'bg-green-50' : 'bg-yellow-50'}`}>
                      <div className="flex items-start space-x-2">
                        <div className="w-4 h-4 mt-0.5 flex-shrink-0">
                          {usePerfectMatcher ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Info className="w-4 h-4 text-yellow-600" />
                          )}
                        </div>
                        <div className={`text-xs ${usePerfectMatcher ? 'text-green-800' : 'text-yellow-800'}`}>
                          <div className="font-medium">
                            {usePerfectMatcher ? 'Perfect Matcher Active' : 'Legacy Mode'}
                          </div>
                          <div>
                            {usePerfectMatcher ? 
                              'Analyzes surrounding pixels and intelligently reconstructs solid colors, gradients, and complex textures for seamless results.' :
                              'Uses basic color averaging for simple backgrounds. Enable Perfect Matcher for best results.'
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={handleTextReplacement}
                  className="w-full bg-green-500 hover:bg-green-600"
                  disabled={!selectedTextId || !newText.trim()}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Replace Text
                </Button>
              </div>

              {/* Replacement History */}
              {replacementHistory.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Replacements</h4>
                  <div className="space-y-2">
                    {replacementHistory.map((item) => (
                      <Card key={item.id} className="replacement-history-item">
                        <CardContent className="p-2">
                          <div className="flex justify-between items-center">
                            <div className="text-xs">
                              <span className="font-medium">{item.oldText}</span>
                              {" → "}
                              <span className="font-medium">{item.newText}</span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeHistoryItem(item.id)}
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Canvas Controls */}
              {originalImage && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Canvas Controls</h4>
                  <div className="space-y-2">
                    <Button
                      onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                      variant="outline"
                      size="sm"
                      className="w-full"
                      data-testid="button-toggle-bounding-boxes"
                    >
                      {showBoundingBoxes ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                      {showBoundingBoxes ? 'Hide' : 'Show'} Bounding Boxes
                    </Button>
                    <Button
                      onClick={toggleEyedropper}
                      variant={isEyedropperActive ? "default" : "outline"}
                      size="sm"
                      className={`w-full ${isEyedropperActive ? 'bg-primary text-primary-foreground' : ''}`}
                      data-testid="button-eyedropper"
                    >
                      <Pipette className="w-4 h-4 mr-2" />
                      {isEyedropperActive ? 'Exit Color Picker' : 'Color Picker'}
                    </Button>
                    <Button
                      onClick={resetToOriginal}
                      variant="outline"
                      size="sm"
                      className="w-full text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset to Original
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col bg-gray-100 order-1 lg:order-2">
          <div className="flex-1 flex items-center justify-center p-3 sm:p-6">
            {originalImage ? (
              <div className="canvas-container bg-white rounded-lg shadow-lg p-2 sm:p-4 w-full max-w-full overflow-auto">
                <canvas 
                  ref={canvasRef}
                  id="imageCanvas"
                  className={`border border-gray-300 rounded ${
                    isEyedropperActive ? 'cursor-crosshair' : 'cursor-default'
                  }`}
                  onClick={handleCanvasClick}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={handleCanvasMouseLeave}
                  data-testid="image-canvas"
                />
              </div>
            ) : (
              /* Welcome State */
              <div className="text-center max-w-md mx-auto px-4">
                {/* Modern device mockup showing screenshot editing */}
                <div className="mx-auto w-48 sm:w-64 h-32 sm:h-40 bg-white rounded-lg shadow-lg p-3 sm:p-4 mb-6 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50"></div>
                  <div className="relative z-10">
                    <div className="w-full h-4 sm:h-6 bg-gray-200 rounded mb-2"></div>
                    <div className="w-3/4 h-3 sm:h-4 bg-blue-200 rounded mb-2"></div>
                    <div className="w-1/2 h-3 sm:h-4 bg-green-200 rounded mb-2"></div>
                    <div className="absolute bottom-3 sm:bottom-4 right-3 sm:right-4 w-6 sm:w-8 h-6 sm:h-8 bg-primary rounded-full flex items-center justify-center">
                      <svg className="w-3 sm:w-4 h-3 sm:h-4 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                      </svg>
                    </div>
                  </div>
                </div>
                
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">OCR Screenshot Editor</h2>
                <p className="text-sm sm:text-base text-gray-600 mb-6">Upload a screenshot to automatically detect and replace text using advanced OCR technology.</p>
                
                <div className="space-y-3 text-sm text-gray-500">
                  <div className="flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-500 mr-2" />
                    Client-side OCR with Tesseract.js
                  </div>
                  <div className="flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-500 mr-2" />
                    Precise text detection and replacement
                  </div>
                  <div className="flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-500 mr-2" />
                    No external APIs required
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Color Preview Tooltip */}
      {showColorPreview && (
        <div
          className="fixed z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-2 pointer-events-none"
          style={{
            left: colorPreviewPosition.x,
            top: colorPreviewPosition.y,
          }}
          data-testid="color-tooltip"
        >
          <div className="flex items-center space-x-2">
            <div
              className="w-6 h-6 rounded border border-gray-300"
              style={{ backgroundColor: previewColor }}
            ></div>
            <div className="text-xs">
              <div className="font-medium">{previewColor}</div>
              <div className="text-gray-500">
                {(() => {
                  // Convert hex to RGB for display
                  const hex = previewColor.replace('#', '');
                  const r = parseInt(hex.substr(0, 2), 16);
                  const g = parseInt(hex.substr(2, 2), 16);
                  const b = parseInt(hex.substr(4, 2), 16);
                  return `rgb(${r}, ${g}, ${b})`;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
