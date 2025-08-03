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
  Zap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Extend global Window interface for Tesseract
declare global {
  interface Window {
    Tesseract: any;
  }
}

interface OCRWord {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
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
  const [oldText, setOldText] = useState("");
  const [newText, setNewText] = useState("");
  const [replacementHistory, setReplacementHistory] = useState<ReplacementHistoryItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFont, setSelectedFont] = useState("Arial");
  const [useSmartErase, setUseSmartErase] = useState(true);
  const [fontSizeMultiplier, setFontSizeMultiplier] = useState(1.2);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const setupCanvas = useCallback((img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate canvas dimensions while maintaining aspect ratio
    const maxWidth = 800;
    const maxHeight = 600;
    let { width, height } = img;

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width *= ratio;
      height *= ratio;
    }

    canvas.width = width;
    canvas.height = height;

    // Draw the original image
    ctx.drawImage(img, 0, 0, width, height);
  }, []);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

    if (showBoundingBoxes && ocrData) {
      drawBoundingBoxes();
    }
  }, [originalImage, showBoundingBoxes, ocrData]);

  const drawBoundingBoxes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ocrData || !originalImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ocrData.words.forEach(word => {
      if (word.text.trim().length > 1) {
        const { x0, y0, x1, y1 } = word.bbox;
        
        // Scale coordinates to canvas size
        const scaleX = canvas.width / originalImage.width;
        const scaleY = canvas.height / originalImage.height;
        
        const canvasX0 = x0 * scaleX;
        const canvasY0 = y0 * scaleY;
        const canvasX1 = x1 * scaleX;
        const canvasY1 = y1 * scaleY;

        // Draw bounding box
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.strokeRect(canvasX0, canvasY0, canvasX1 - canvasX0, canvasY1 - canvasY0);
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

      setOcrData(data);
      setIsProcessingOCR(false);
      
      toast({
        title: "OCR Complete",
        description: `Detected ${data.words.filter((w: OCRWord) => w.text.trim().length > 1).length} words`,
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

  // Helper function to get average background color for better erasing
  const getAverageColor = (imageData: ImageData): string => {
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
      return `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
    } catch (error) {
      // Fallback to black if sampling fails
      return 'rgb(0, 0, 0)';
    }
  };

  const handleTextReplacement = () => {
    if (!oldText.trim() || !newText.trim()) {
      toast({
        title: "Missing Text",
        description: "Please enter both old and new text.",
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

    let replacementMade = false;
    
    ocrData.words.forEach(word => {
      if (word.text.toLowerCase().trim() === oldText.toLowerCase().trim()) {
        const { x0, y0, x1, y1 } = word.bbox;
        
        // Scale coordinates to canvas size
        const scaleX = canvas.width / originalImage.width;
        const scaleY = canvas.height / originalImage.height;
        
        const canvasX0 = x0 * scaleX;
        const canvasY0 = y0 * scaleY;
        const canvasX1 = x1 * scaleX;
        const canvasY1 = y1 * scaleY;

        // First, sample the text color from the center of the original text
        const originalTextColor = getTextColor(ctx, canvasX0, canvasY0, canvasX1, canvasY1);
        
        // Sample background color before erasing for better fill
        const width = Math.max(1, canvasX1 - canvasX0);
        const height = Math.max(1, canvasY1 - canvasY0);
        
        // Use smart erasing with background sampling or simple white fill
        if (useSmartErase) {
          try {
            const imageData = ctx.getImageData(canvasX0, canvasY0, width, height);
            const averageColor = getAverageColor(imageData);
            
            // Erase the old text with sampled background color
            ctx.fillStyle = averageColor;
            ctx.fillRect(canvasX0, canvasY0, width, height);
          } catch (error) {
            // Fallback to white if sampling fails
            ctx.fillStyle = 'white';
            ctx.fillRect(canvasX0, canvasY0, width, height);
          }
        } else {
          // Simple white fill
          ctx.fillStyle = 'white';
          ctx.fillRect(canvasX0, canvasY0, width, height);
        }

        // Calculate calibrated font size using bounding box height
        const boxHeight = canvasY1 - canvasY0;
        const adjustedFontSize = Math.floor(boxHeight * fontSizeMultiplier); // Calibrated multiplier for canvas rendering
        const fontSize = Math.max(10, adjustedFontSize);
        
        // Optional: Log for debugging/calibration purposes
        console.log("Box Height:", Math.round(boxHeight), "→ Adjusted Font Size:", fontSize);
        
        // Set text properties using automatically detected color and calibrated size
        ctx.fillStyle = originalTextColor;
        ctx.font = `bold ${fontSize}px ${selectedFont}, sans-serif`;
        ctx.textBaseline = 'bottom'; // Align text properly with bounding box
        ctx.textAlign = 'left';
        
        // Optional: Draw debug border around original text area (remove in production)
        // ctx.strokeStyle = '#ff0000';
        // ctx.lineWidth = 1;
        // ctx.strokeRect(canvasX0, canvasY0, canvasX1 - canvasX0, canvasY1 - canvasY0);
        
        // Draw new text with proper positioning (clean text only, no background)
        ctx.fillText(newText, canvasX0, canvasY1);

        replacementMade = true;
      }
    });

    if (replacementMade) {
      const newHistoryItem: ReplacementHistoryItem = {
        id: Date.now().toString(),
        oldText,
        newText,
        timestamp: new Date(),
      };
      
      setReplacementHistory(prev => [newHistoryItem, ...prev.slice(0, 4)]);
      setOldText("");
      setNewText("");
      
      toast({
        title: "Text Replaced",
        description: `Replaced "${oldText}" with "${newText}"`,
      });
    } else {
      toast({
        title: "Text Not Found",
        description: `Text "${oldText}" not found in the image.`,
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
    link.href = canvas.toDataURL();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Download Complete",
      description: "Image downloaded successfully.",
    });
  };

  const resetToOriginal = () => {
    if (originalImage) {
      redrawCanvas();
      setReplacementHistory([]);
      setOldText("");
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

  const selectDetectedWord = (word: string) => {
    setOldText(word);
  };

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  const validWords = ocrData?.words.filter(word => word.text.trim().length > 1) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">ScreenText Editor</h1>
          </div>
          <div className="flex items-center space-x-4">
            <Button 
              onClick={downloadImage} 
              disabled={!originalImage}
              className="bg-primary hover:bg-primary/90"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          {/* Upload Section */}
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Upload Image</h3>
            <div 
              className={`upload-area border-2 border-dashed rounded-lg p-6 text-center cursor-pointer ${
                isDragOver ? 'drag-over border-primary' : 'border-gray-300 hover:border-primary'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
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
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Text Recognition</h3>
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
            <div className="flex-1 p-6 overflow-y-auto">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Text Replacement</h3>
              
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
                          onClick={() => selectDetectedWord(word.text)}
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
                <div>
                  <Label htmlFor="oldText" className="text-sm font-medium text-gray-700 mb-1 block">
                    Text to Replace
                  </Label>
                  <Input
                    id="oldText"
                    value={oldText}
                    onChange={(e) => setOldText(e.target.value)}
                    placeholder="Enter text to replace"
                  />
                </div>
                
                <div>
                  <Label htmlFor="newText" className="text-sm font-medium text-gray-700 mb-1 block">
                    Replacement Text
                  </Label>
                  <Input
                    id="newText"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder="Enter new text"
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

                    <div className="flex items-center space-x-2">
                      <input
                        id="smartErase"
                        type="checkbox"
                        checked={useSmartErase}
                        onChange={(e) => setUseSmartErase(e.target.checked)}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label htmlFor="smartErase" className="text-xs text-gray-600">
                        Smart background matching (samples colors before erasing)
                      </Label>
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={handleTextReplacement}
                  className="w-full bg-green-500 hover:bg-green-600"
                  disabled={!oldText.trim() || !newText.trim()}
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
                    >
                      {showBoundingBoxes ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                      {showBoundingBoxes ? 'Hide' : 'Show'} Bounding Boxes
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
        <div className="flex-1 flex flex-col bg-gray-100">
          <div className="flex-1 flex items-center justify-center p-6">
            {originalImage ? (
              <div className="canvas-container bg-white rounded-lg shadow-lg p-4">
                <canvas 
                  ref={canvasRef}
                  id="imageCanvas"
                  className="max-w-full max-h-full border border-gray-300 rounded"
                />
              </div>
            ) : (
              /* Welcome State */
              <div className="text-center max-w-md">
                {/* Modern device mockup showing screenshot editing */}
                <div className="mx-auto w-64 h-40 bg-white rounded-lg shadow-lg p-4 mb-6 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50"></div>
                  <div className="relative z-10">
                    <div className="w-full h-6 bg-gray-200 rounded mb-2"></div>
                    <div className="w-3/4 h-4 bg-blue-200 rounded mb-2"></div>
                    <div className="w-1/2 h-4 bg-green-200 rounded mb-2"></div>
                    <div className="absolute bottom-4 right-4 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                      </svg>
                    </div>
                  </div>
                </div>
                
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">OCR Screenshot Editor</h2>
                <p className="text-gray-600 mb-6">Upload a screenshot to automatically detect and replace text using advanced OCR technology.</p>
                
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
    </div>
  );
}
