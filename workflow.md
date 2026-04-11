This `workflow.md` is designed to align your team on the distributed architecture. It breaks down the "forced" (but powerful) stack into logical phases, from data acquisition to Kubernetes deployment.

---

# Workflow: Distributed Weapon Detection System

This document outlines the development and deployment pipeline for the Weapon Detection System using **React**, **FastAPI**, **Ray**, **Docker**, and **Kubernetes**.

## 1. System Architecture Overview
The system follows a distributed AI-as-a-Service (AIaaS) pattern. Unlike a monolithic app, we decouple the API gateway from the heavy-lifting inference engine using Ray.



* **Frontend:** React (Vite) + Canvas API for real-time bounding box rendering.
* **Gateway:** FastAPI (handles Auth, Rate Limiting, and Ray Client communication).
* **Inference/Training:** Ray (Ray Serve for scaling models; Ray Train for distributed fine-tuning).
* **Infrastructure:** Kubernetes (Orchestrated via KubeRay Operator).

---

## 2. Phase 1: Data Acquisition & Model Fine-Tuning
Since standard YOLO models (like YOLOv8/v11) are trained on the COCO dataset, they lack specific weapon classes (e.g., handguns, rifles).

### **Data Sourcing**
* **Primary Sources:** Roboflow Universe (Weapon Detection Datasets), Kaggle (CCTV-Gun datasets).
* **Annotation Format:** YOLO PyTorch format (txt labels).

### **Distributed Training with Ray Train**
1.  **Initialize Ray Cluster:** Spin up multiple worker nodes with GPUs.
2.  **Fine-Tuning:** Use `ray.train` to distribute the YOLO training process across nodes.
3.  **Artifact Storage:** Save the resulting `best.pt` model weights to a Persistent Volume (PV) accessible by the cluster.

---

## 3. Phase 2: Ray Serve Development (The Brain)
We use **Ray Serve** to wrap the YOLO model. This allows us to scale inference horizontally across K8s pods without restarting the FastAPI server.

* **Script:** Create a `WeaponDetector` class decorated with `@serve.deployment`.
* **Logic:** * Load `best.pt`.
    * Process incoming byte streams (images/video frames).
    * Return JSON coordinates: `[x1, y1, x2, y2, confidence, class]`.

---

## 4. Phase 3: FastAPI Gateway Development
FastAPI acts as the entry point for the React frontend. It does **not** run the model locally.

* **Endpoint `POST /detect`:** Receives an image, converts it to a NumPy array, and calls `ray_serve_handle.remote()`.
* **Endpoint `WS /stream`:** (Optional) Uses WebSockets to pipe video frames from the webcam to Ray Serve for real-time detection.

---

## 5. Phase 4: React Frontend (The UI)
The frontend focuses on performance to ensure low-latency visualization.

* **Image Processing:** Users upload images; React sends them to the `/detect` endpoint.
* **Bounding Boxes:** Use the HTML5 **Canvas API** to draw boxes over the image based on the JSON response from FastAPI.
* **State Management:** Use `useRef` for the canvas to prevent unnecessary re-renders during high-frequency video updates.

---

## 6. Phase 5: Containerization & Orchestration
This is where the stack becomes "production-grade."

### **Dockerization**
We require three distinct Docker images:
1.  **Frontend Image:** Nginx serving the React build.
2.  **API Image:** FastAPI + Ray Client.
3.  **Ray Worker Image:** PyTorch + Ultralytics + Ray (configured for GPU/CPU).

### **Kubernetes (K8s) Deployment**
1.  **KubeRay Operator:** Install the operator to manage Ray clusters on K8s.
2.  **RayCluster Resource:** Define the head and worker nodes in a YAML manifest.
3.  **FastAPI Service:** Deploy as a standard K8s Deployment + Service.
4.  **Ingress:** Configure an Nginx Ingress to route traffic to the Frontend and API.

---

## 7. Development Roadmap
| Step | Task | Owner |
| :--- | :--- | :--- |
| 1 | Scrape & Clean Weapon Datasets | Data Team |
| 2 | Setup Ray Train script for YOLO fine-tuning | AI Team |
| 3 | Develop Ray Serve deployment for inference | AI Team |
| 4 | Build FastAPI wrapper & CORS config | Backend |
| 5 | Build React Canvas rendering component | Frontend |
| 6 | Create Dockerfiles & Helm Charts for K8s | DevOps |

---

> **Note to Team:** Ensure your local environment has `docker-desktop` with Kubernetes enabled. For local Ray testing, run `ray start --head` before starting the FastAPI server.