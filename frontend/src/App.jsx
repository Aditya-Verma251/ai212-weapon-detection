import React, { useState, useRef } from 'react';

function App() {
  const [mode, setMode] = useState('image'); // 'image' or 'video'
  const [selectedFile, setSelectedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Results
  const [imageDetections, setImageDetections] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  
  // To draw image boxes
  const imageRef = useRef(null);
  const canvasRef = useRef(null);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setImageDetections(null);
    setVideoUrl(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return alert("Please select a file!");
    setIsProcessing(true);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      if (mode === 'image') {
        const response = await fetch('http://localhost:8000/detect', { method: 'POST', body: formData });
        const data = await response.json();
        setImageDetections(data.detections);
        drawImageBoxes(data.detections);
      } else {
        const response = await fetch('http://localhost:8000/video', { method: 'POST', body: formData });
        const blob = await response.blob();
        setVideoUrl(URL.createObjectURL(blob));
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Error processing file.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to draw boxes over the uploaded image
  const drawImageBoxes = (detections) => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach(det => {
      const [x1, y1, x2, y2] = det.bbox;
      ctx.strokeStyle = "#FF0000";
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.fillStyle = "#FF0000";
      ctx.font = "16px Arial";
      ctx.fillText(`${det.label} (${Math.round(det.confidence * 100)}%)`, x1, y1 > 20 ? y1 - 5 : y1 + 20);
    });
  };

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: 'auto', fontFamily: 'sans-serif' }}>
      <h1>Weapon Detection Engine</h1>
      
      {/* Mode Selector */}
      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => setMode('image')} style={{ fontWeight: mode === 'image' ? 'bold' : 'normal' }}>
          Image Detection
        </button>
        <button onClick={() => setMode('video')} style={{ marginLeft: '10px', fontWeight: mode === 'video' ? 'bold' : 'normal' }}>
          Video Detection
        </button>
      </div>

      {/* Upload Controls */}
      <div style={{ marginBottom: '20px' }}>
        <input 
          type="file" 
          accept={mode === 'image' ? "image/*" : "video/mp4,video/*"} 
          onChange={handleFileChange} 
        />
        <button onClick={handleUpload} disabled={isProcessing} style={{ marginLeft: '10px' }}>
          {isProcessing ? "Processing in Ray Cluster..." : "Analyze"}
        </button>
      </div>

      {/* Results View */}
      <div style={{ marginTop: '20px', position: 'relative' }}>
        
        {/* Image Results */}
        {mode === 'image' && selectedFile && !isProcessing && (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img 
              ref={imageRef} 
              src={URL.createObjectURL(selectedFile)} 
              alt="Upload preview" 
              style={{ maxWidth: '100%', display: 'block' }} 
              onLoad={() => imageDetections && drawImageBoxes(imageDetections)}
            />
            <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />
          </div>
        )}

        {/* Video Results */}
        {mode === 'video' && videoUrl && !isProcessing && (
          <video controls width="100%" src={videoUrl}>
            Your browser does not support the video tag.
          </video>
        )}
      </div>
    </div>
  );
}

export default App;