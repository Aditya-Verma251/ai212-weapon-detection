import React, { useState, useRef, useCallback } from 'react';
import './index.css';

const App = () => {
  const [fileContext, setFileContext] = useState({ file: null, previewUrl: null });
  const [uploadState, setUploadState] = useState('idle'); // idle, pending, success, error
  const [analysisOutput, setAnalysisOutput] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // --- Main Panel Handlers ---
  const triggerFileSelection = () => fileInputRef.current?.click();

  const handleSystemBrowse = useCallback((e) => {
    const selected = e.target.files[0];
    if (selected) {
      const previewUrl = URL.createObjectURL(selected);
      setFileContext({ file: selected, previewUrl });
      setUploadState('idle');
      setAnalysisOutput(null);
    }
  }, []);

  const executeAnalysis = async () => {
    if (!fileContext.file) return;
    
    setUploadState('pending');
    const payload = new FormData();
    payload.append('file', fileContext.file);

    try {
      const response = await fetch('http://localhost:8000/detect', {
        method: 'POST',
        body: payload,
      });
      const data = await response.json();
      setAnalysisOutput(data.detections || data);
      setUploadState('success');
    } catch (err) {
      console.error("Analysis execution failed:", err);
      setUploadState('error');
    }
  };

  // --- Sidebar Handlers ---
  const toggleMediaStream = async () => {
    if (isStreaming) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsStreaming(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setIsStreaming(true);
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
            <button className="btn-primary" onClick={triggerFileSelection}>
              Browse
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            </button>
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
                   <video src={fileContext.previewUrl} controls className="media-render" />
                ) : (
                   <img src={fileContext.previewUrl} alt="Target" className="media-render" />
                )}
                {analysisOutput && (
                  <div className="analysis-overlay-data">
                    <pre>{JSON.stringify(analysisOutput, null, 2)}</pre>
                  </div>
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

        <section className="viewport-container feed-output">
          <div className="viewport-header">Live Feed Pipeline</div>
          <div className="viewport-content video-matrix">
            <video ref={videoRef} className="media-render live-feed" playsInline muted />
            {!isStreaming && <div className="placeholder-text">Feed offline</div>}
          </div>
        </section>

        <section className="viewport-container meta-output">
          <div className="viewport-header">System About</div>
          <div className="viewport-content text-block">
            <p><strong>Detection Engine v2.4</strong></p>
            <p>Awaiting payload routing to target backend. Model parameters are currently set to high-confidence threshold environments.</p>
          </div>
        </section>
      </aside>
    </div>
  );
};

export default App;