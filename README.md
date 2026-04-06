**Repository Description**
A real-time sensor monitoring and anomaly detection platform built with React, Node.js, PostgreSQL, and BullMQ for high-volume telemetry ingestion.

**Elevator Pitch**
GridWatch is a full-stack telemetry and alert management system designed to monitor industrial sensor grids. It efficiently handles high-volume ingest batches, asynchronously detecting anomalies via rule-based thresholds and rate-of-change metrics using BullMQ and Redis. Real-time state changes and alerts are pushed to a React dashboard via Server-Sent Events (SSE), enabling operators to rapidly respond to critical network fluctuations and manage sensor suppression windows.

**GitHub Topics**
`sensor-monitoring`, `anomaly-detection`, `react19`, `nodejs`, `postgresql`, `bullmq`, `redis`, `sse`, `telemetry`, `typescript`

---

# GridWatch ⚡

### Real-Time Sensor Telemetry & Anomaly Detection Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/vaibhavidhenge23/gridwatch?style=flat-square)](https://github.com/vaibhavidhenge23/gridwatch/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/vaibhavidhenge23/gridwatch?style=flat-square)](https://github.com/vaibhavidhenge23/gridwatch/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/vaibhavidhenge23/gridwatch?style=flat-square)](https://github.com/vaibhavidhenge23/gridwatch/pulls)
[![GitHub last commit](https://img.shields.io/github/last-commit/vaibhavidhenge23/gridwatch?style=flat-square)](https://github.com/vaibhavidhenge23/gridwatch/commits/main)
![Repo Size](https://img.shields.io/github/repo-size/vaibhavidhenge23/gridwatch?style=flat-square)

## 🚀 Overview
**GridWatch** is a high-performance system for ingesting, processing, and visualizing sensor telemetry data. It solves the problem of monitoring large-scale physical infrastructures (like power grids or server farms) by providing a durable, non-blocking ingestion pipeline. Background workers analyze data batches against configurable thresholds and rate-of-change rules to detect anomalies. Operators are immediately notified of critical system states through a live dashboard powered by Server-Sent Events (SSE).

## ✨ Features
* **High-Volume Ingestion**: A dedicated `/ingest` endpoint optimized for bulk inserts into PostgreSQL, completely decoupled from heavy processing logic.
* **Asynchronous Anomaly Detection**: BullMQ background workers analyze readings against custom threshold and rate-of-change rules.
* **Real-Time Dashboard**: React-based UI that listens to Server-Sent Events (SSE) for instant, live updates on sensor states and alert escalations.
* **Alert Escalation & Suppression**: Automated cron jobs detect silent sensors and escalate unacknowledged alerts. Operators can schedule suppression windows for maintenance.
* **Role-Based Access Control**: Secure operator and supervisor views to manage specific zones.

## 🛠 Tech Stack
| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, Vite, Tailwind CSS |
| **Backend** | Node.js, Express, TypeScript, Zod |
| **Database** | PostgreSQL (Relational Data & Telemetry) |
| **Queue / Cache** | Redis, BullMQ |
| **Background Jobs** | Node-cron |
| **Containerization** | Docker, Docker Compose |

## 🏗 Architecture
GridWatch utilizes an event-driven, queue-based architecture to ensure the ingestion API is never blocked by heavy analytical queries.

```mermaid
graph TD
    Client[React Dashboard] -->|REST / SSE| API[Express API]
    API -->|1. Bulk Insert| DB[(PostgreSQL)]
    API -->|2. Enqueue Job| Queue[(Redis / BullMQ)]
    Worker[Anomaly Worker] -->|3. Fetch Job| Queue
    Worker -->|4. Evaluate Rules| DB
📂 Project Structure

.
├── backend/
│   ├── src/
│   │   ├── db/          # PostgreSQL schema and database connection logic
│   │   ├── jobs/        # Cron jobs for escalations and silence detection
│   │   ├── lib/         # Redis queue (BullMQ) setup
│   │   ├── routes/      # Express API endpoints (Ingest, Alerts, Auth)
│   │   ├── sse/         # Server-Sent Events emitter logic
│   │   └── workers/     # Background anomaly detection workers
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── hooks/       # Custom React hooks (useSSE)
│   │   ├── lib/         # API clients and Auth context
│   │   └── pages/       # Dashboard, Sensor Detail, and Alert views
│   └── Dockerfile
└── docker-compose.yml   # Multi-container orchestration

⚙️ Installation
GridWatch is fully containerized. The easiest way to get started is using Docker Compose.

Clone the repository:

Bash
git clone [https://github.com/vaibhavidhenge23/gridwatch.git](https://github.com/vaibhavidhenge23/gridwatch.git)
cd gridwatch
Start the infrastructure:
This will spin up PostgreSQL, Redis, the Node backend, and the React frontend.

Bash
docker-compose up --build
🖥 Usage
Access the Application: Open http://localhost:5173 in your browser.

Ingest Data: Send batch telemetry to the API:

Bash
curl -X POST http://localhost:3000/ingest \
-H "Content-Type: application/json" \
-d '[{"sensor_id": "UUID", "timestamp": "2024-05-20T10:00:00Z", "voltage": 120.5}]'
Monitor Alerts: Navigate to the Alerts panel in the dashboard to acknowledge or resolve anomalies.

🔐 Configuration
The system relies on the following environment variables (automatically configured in docker-compose.yml for local development):
VariableDescriptionDATABASE_URLPostgreSQL
connection string.REDIS_URLRedis connection string for BullMQ.
PORTBackend API port (Default: 3000).
JWT_SECRETSecret key for signing operator authentication tokens.
VITE_API_URLBase URL for the frontend to communicate with the backend

🔌 API & Modules
POST /ingest: Accepts arrays of sensor readings. Returns 200 OK immediately after the PostgreSQL durable write, delegating analysis to the background queue.

GET /sensors/events: An SSE endpoint that clients subscribe to. Streams live JSON payloads triggered by emitter.ts when workers detect state changes.

Anomaly Worker (anomaly.worker.ts): Evaluates threshold and rate_of_change rules against a 3-reading historical average.

🤝 Contributing
Contributions are welcome! Please follow these steps:

Fork the repository.

Create a feature branch (git checkout -b feature/amazing-feature).

Commit your changes (git commit -m 'Add amazing feature').

Push to the branch (git push origin feature/amazing-feature).

Open a Pull Request.

🛣 Roadmap
[ ] Add advanced ML-based anomaly detection (e.g., Isolation Forests).

[ ] Implement historical data pagination and chart visualizations on the frontend.

[ ] Export alert compliance reports to CSV/PDF.

📄 License
This project is licensed under the MIT License.

    Worker -->|5. Insert Alerts| DB
    Worker -->|6. Trigger Event| API
    API -->|7. SSE Push| Client
