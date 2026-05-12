import React, { useState, useRef, useCallback } from 'react';
import './index.css';

const App = () => {
  const [fileContext, setFileContext] = useState({ file: null, previewUrl: null });
  const [uploadState, setUploadState] = useState('idle');
  const [processedVideoUrl, setProcessedVideoUrl] = useState(null);
  const [processedImageUrl, setProcessedImageUrl] = useState(null); // Added state for processed images
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [liveOutputUrl, setLiveOutputUrl] = useState(null);
  
  const fileInputRef = useRef(null);
  
  // Video and Streaming Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const wsRef = useRef(null);
  const streamIntervalRef = useRef(null);

  // --- Main Panel Handlers ---
  const triggerFileSelection = () => fileInputRef.current?.click();

  const handleSystemBrowse = useCallback((e) => {
    const selected = e.target.files[0];
    if (selected) {
      const previewUrl = URL.createObjectURL(selected);
      setFileContext({ file: selected, previewUrl });
      setUploadState('idle');
      setProcessedVideoUrl(null);
      setProcessedImageUrl(null); // Reset image state on new upload
    }
  }, []);

  const executeAnalysis = async () => {
    if (!fileContext.file) return;
    
    setUploadState('pending');
    const payload = new FormData();
    payload.append('file', fileContext.file);

    const isVideo = fileContext.file.type.startsWith('video/');
    const targetEndpoint = isVideo ? 'http://localhost:8000/video' : 'http://localhost:8000/detect';

    try {
      const response = await fetch(targetEndpoint, {
        method: 'POST',
        body: payload,
      });

      if (!response.ok) throw new Error(`Server responded with status ${response.status}`);

      if (isVideo) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setProcessedVideoUrl(url);
      } else {
        // Fix: Now expects an image blob instead of JSON
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setProcessedImageUrl(url);
      }
      
      setUploadState('success');
    } catch (err) {
      console.error("Analysis execution failed:", err);
      setUploadState('error');
    }
  };

  // --- Sidebar Handlers (WebSocket Live Stream) ---
  const toggleMediaStream = async () => {
    if (isStreaming) {
      clearInterval(streamIntervalRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      if (wsRef.current) wsRef.current.close();
      
      setIsStreaming(false);
      setLiveOutputUrl(null);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

        wsRef.current = new WebSocket('ws://localhost:8000/ws/live');
        wsRef.current.binaryType = 'blob'; 
        
        wsRef.current.onmessage = (event) => {
           setLiveOutputUrl(prevUrl => {
              if (prevUrl) URL.revokeObjectURL(prevUrl);
              return URL.createObjectURL(event.data);
           });
        };

        wsRef.current.onopen = () => {
           setIsStreaming(true);
           
           streamIntervalRef.current = setInterval(() => {
               if (videoRef.current && canvasRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                   const canvas = canvasRef.current;
                   const ctx = canvas.getContext('2d');
                   
                   canvas.width = videoRef.current.videoWidth || 640;
                   canvas.height = videoRef.current.videoHeight || 480;
                   
                   ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                   
                   canvas.toBlob((blob) => {
                       if (blob) wsRef.current.send(blob);
                   }, 'image/jpeg', 0.6); 
               }
           }, 1000 / 15); 
        };

      } catch (err) {
        console.error("Media device allocation failed:", err);
      }
    }
  };

  return (
    <div className="telemetry-dashboard">
      <header className="title-node">AI212 Project : Weapon Detection System</header>

      {/* Section: Browse & Analyse */}
      <div className="control-section browse-analyze-controls">
        <button className="btn-primary" onClick={triggerFileSelection}>Browse ↑</button>
        {/* Hidden input to remove "No file chosen" text */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleSystemBrowse} 
          style={{ display: 'none' }} 
          accept="image/*,video/*" 
        />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
          <div className={`status-indicator state-${uploadState}`} />
          <button 
            className="btn-outline btn-black-text" 
            onClick={executeAnalysis}
            disabled={!fileContext.file || uploadState === 'pending'}
          >
            {uploadState === 'pending' ? '...' : 'Analyse'}
          </button>
        </div>
      </div>

      {/* Section: Raw Input Preview (Half Width) */}
      <section className="viewport-container raw-input-view small-view">
        <div className="viewport-header">Raw Input</div>
        <div className="viewport-content">
          {fileContext.previewUrl ? (
            <img src={fileContext.previewUrl} className="media-render" alt="Preview" />
          ) : <span className="placeholder-text">No File</span>}
        </div>
      </section>

      {/* Section: Camera Connection */}
      <div className="camera-toggle-node">
        <button className="btn-outline btn-black-text" onClick={toggleMediaStream}>
          {isStreaming ? 'Disconnect' : 'Connect Camera'}
        </button>
      </div>

      {/* Section: Raw Live Video (Half Width) */}
      <section className="viewport-container raw-live-view small-view">
        <div className="viewport-header">Raw Live Video</div>
        <div className="viewport-content">
          <video ref={videoRef} className="media-render" playsInline muted />
        </div>
      </section>

      {/* Section: Output given by backend (Expanded) */}
      <section className="viewport-container backend-output-large expanded-view">
        <div className="viewport-header">Output</div>
        <div className="viewport-content">
          {processedImageUrl || processedVideoUrl ? (
            fileContext.file?.type.startsWith('video/') ? 
            <video src={processedVideoUrl} controls className="media-render" /> :
            <img src={processedImageUrl} className="media-render" alt="Output" />
          ) : <div className="placeholder-text">Awaiting Analysis...</div>}
        </div>
      </section>

      {/* Section: Output of the live video (Expanded) */}
      <section className="viewport-container live-telemetry-large expanded-view">
        <div className="viewport-header">Live Output</div>
        <div className="viewport-content">
          {liveOutputUrl ? (
            <img src={liveOutputUrl} alt="Live Telemetry" className="media-render" />
          ) : <div className="placeholder-text">Pipeline Offline</div>}
        </div>
      </section>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default App;