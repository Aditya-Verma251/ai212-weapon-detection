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
      <main className="primary-workspace">
        <header className="control-node-header">
          <div className="action-cluster">
            <button className="btn-primary" onClick={triggerFileSelection}>Browse</button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleSystemBrowse} 
              className="hidden-directive" 
              accept="image/*,video/*" 
            />
            <div className={`status-indicator state-${uploadState}`} title={`Upload Status: ${uploadState}`} />
            <button 
              className="btn-secondary" 
              onClick={executeAnalysis}
              disabled={!fileContext.file || uploadState === 'pending'}
            >
              {uploadState === 'pending' ? 'Processing...' : 'Analyse'}
            </button>
          </div>
        </header>

        <section className="viewport-container main-output">
          <div className="viewport-header">Static File Output</div>
          <div className="viewport-content">
            {fileContext.previewUrl ? (
              <div className="media-preview-wrapper">
                {fileContext.file.type.startsWith('video/') ? (
                   <video src={processedVideoUrl || fileContext.previewUrl} controls className="media-render" />
                ) : (
                   // Fix: Now displays the processed image if it exists, otherwise the raw preview
                   <img src={processedImageUrl || fileContext.previewUrl} alt="Target" className="media-render" />
                )}
              </div>
            ) : (
              <div className="placeholder-text">Awaiting file input stream...</div>
            )}
          </div>
        </section>
      </main>

      <aside className="secondary-workspace">
        <div className="camera-control-node">
          <button className="btn-outline" onClick={toggleMediaStream}>
            {isStreaming ? 'Disconnect Camera' : 'Connect Camera'}
          </button>
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <section className="viewport-container feed-output">
          <div className="viewport-header">Live Feed Pipeline (Raw)</div>
          <div className="viewport-content video-matrix">
            <video ref={videoRef} className="media-render live-feed" playsInline muted />
            {!isStreaming && <div className="placeholder-text">Feed offline</div>}
          </div>
        </section>

        <section className="viewport-container feed-output">
          <div className="viewport-header">Telemetry Output (Processed)</div>
          <div className="viewport-content video-matrix">
            {liveOutputUrl ? (
              <img src={liveOutputUrl} alt="Live Telemetry" className="media-render" />
            ) : (
              <div className="placeholder-text">Awaiting pipeline...</div>
            )}
          </div>
        </section>

      </aside>
    </div>
  );
};

export default App;