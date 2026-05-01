from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
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

# ---------------------------------------------------------
# 1. RAY ACTOR DEFINITION (The Heavy Lifter)
# ---------------------------------------------------------
@ray.remote(num_gpus=1) # Tells Ray to assign a GPU to this worker
class WeaponDetectorWorker:
    def __init__(self):
        print("🧠 Ray Worker: Loading YOLO Model into GPU...")
        self.model = YOLO("models/best.pt")
        print("✅ Ray Worker: Model Ready!")

    def process_image(self, image_bytes):
        # Decode the bytes into an OpenCV image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # Run inference
        results = self.model.predict(img, conf=0.5, verbose=False)
        
        # Format results for the frontend
        detections = []
        for r in results:
            for box in r.boxes:
                detections.append({
                    "bbox": box.xyxy[0].tolist(),
                    "confidence": float(box.conf),
                    "label": self.model.names[int(box.cls)]
                })
        return detections

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

# ---------------------------------------------------------
# 2. FASTAPI LIFECYCLE & ROUTING
# ---------------------------------------------------------
TEMP_DIR = os.path.abspath("temp_files")
os.makedirs(TEMP_DIR, exist_ok=True)

# Initialize Ray and create one persistent worker when the server starts
ray.init(ignore_reinit_error=True)
detector_worker = WeaponDetectorWorker.remote()


@app.post("/detect")
async def detect_image(file: UploadFile = File(...)):
    image_bytes = await file.read()
    
    # Send bytes to the Ray Actor and wait for the result
    # ray.get() blocks the request until the remote worker finishes
    detections = ray.get(detector_worker.process_image.remote(image_bytes))
    
    return {"detections": detections}


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