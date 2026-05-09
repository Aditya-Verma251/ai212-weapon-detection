from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import ray
import cv2
import numpy as np
import shutil
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

@ray.remote(num_gpus=1) # Tells Ray to assign a GPU to this worker
class WeaponDetectorWorker:
    def __init__(self):
        self.model = YOLO("models/best.pt")

    def process_image(self, image_bytes):
        # Decode the bytes into an OpenCV image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # Run inference
        results = self.model.predict(img, conf=0.5, verbose=False)
        
        annotated_frame = results[0].plot()
        
        # Encode back to JPEG bytes
        _, buffer = cv2.imencode('.jpg', annotated_frame)
        return buffer.tobytes()

    def process_video(self, input_path, output_path):
        cap = cv2.VideoCapture(input_path)
        fourcc = cv2.VideoWriter_fourcc(*'avc1') # H.264 for web browsers
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                break
                
            results = self.model.predict(frame, conf=0.5, verbose=False)
            annotated_frame = results[0].plot()
            out.write(annotated_frame)

        cap.release()
        out.release()
        return True # Signal that processing is done
    
    def process_stream_frame(self, image_bytes):
        # Decode the bytes from the WebSocket into an OpenCV image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # Run inference (lower confidence slightly for live video responsiveness)
        results = self.model.predict(img, conf=0.4, verbose=False)
        
        # Plot the bounding boxes onto the frame
        annotated_frame = results[0].plot()
        
        # Encode the frame back to JPEG bytes to send to the frontend
        success, buffer = cv2.imencode('.jpg', annotated_frame)
        return buffer.tobytes()
#FASTAPI LIFECYCLE
TEMP_DIR = os.path.abspath("temp_files")
os.makedirs(TEMP_DIR, exist_ok=True)

# Initialize Ray and create one persistent worker when the server starts
ray.init(ignore_reinit_error=True)
detector_worker = WeaponDetectorWorker.remote()


@app.post("/detect")
async def detect_image(file: UploadFile = File(...)):
    image_bytes = await file.read()
    
    # Process in Ray and get annotated image bytes back
    annotated_image_bytes = ray.get(detector_worker.process_image.remote(image_bytes))
    
    # Return directly as an image
    return Response(content=annotated_image_bytes, media_type="image/jpeg")


@app.post("/video")
async def detect_video(file: UploadFile = File(...)):
    # Use absolute paths so the Ray worker doesn't get confused
    input_path = os.path.join(TEMP_DIR, f"in_{file.filename}")
    output_path = os.path.join(TEMP_DIR, f"out_{file.filename}")

    # 1. Save video to disk
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 2. Tell the Ray Actor to process the files on disk
    print(f"Sending {file.filename} to Ray Worker...")
    ray.get(detector_worker.process_video.remote(input_path, output_path))
    
    # 3. Cleanup the input and return the output
    os.remove(input_path)
    return FileResponse(output_path, media_type="video/mp4")

@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # 1. Wait for a frame from the React frontend
            bytes_data = await websocket.receive_bytes()
            
            # 2. Send the frame to the Ray worker to be processed
            processed_bytes = ray.get(detector_worker.process_stream_frame.remote(bytes_data))
            
            # 3. Send the annotated frame back to React
            await websocket.send_bytes(processed_bytes)
    except WebSocketDisconnect:
        print("Live stream disconnected.")