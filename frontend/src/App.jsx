import React, { useState } from 'react';

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [result, setResult] = useState(null);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  const handleUpload = async () => {
    if (!selectedFile) return alert("Please select a file!");

    // 1. Create a FormData object (Standard way to send files)
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      // 2. Send to FastAPI backend
      const response = await fetch('http://localhost:8000/detect', {
        method: 'POST',
        body: formData, // No 'Content-Type' header needed; browser sets it automatically
      });

      const data = await response.json();
      setResult(data.detections);
      console.log("Detections:", data);
    } catch (error) {
      console.error("Error uploading image:", error);
    }
  };

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1>Weapon Detection Upload</h1>
      <input type="file" onChange={handleFileChange} accept="image/*" />
      <button onClick={handleUpload} style={{ marginLeft: '10px' }}>
        Run Detection
      </button>

      {result && (
        <div style={{ marginTop: '20px' }}>
          <h3>Results:</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default App;