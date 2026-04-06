GridWatch ⚡Real-Time Sensor Telemetry & Anomaly Detection Platform🚀 OverviewGridWatch is a high-performance system for ingesting, processing, and visualizing sensor telemetry data. It solves the problem of monitoring large-scale physical infrastructures (like power grids or server farms) by providing a durable, non-blocking ingestion pipeline. Background workers analyze data batches against configurable thresholds and rate-of-change rules to detect anomalies. Operators are immediately notified of critical system states through a live dashboard powered by Server-Sent Events (SSE).✨ FeaturesHigh-Volume Ingestion: A dedicated /ingest endpoint optimized for bulk inserts into PostgreSQL, completely decoupled from heavy processing logic.Asynchronous Anomaly Detection: BullMQ background workers analyze readings against custom threshold and rate-of-change rules.Real-Time Dashboard: React-based UI that listens to Server-Sent Events (SSE) for instant, live updates on sensor states and alert escalations.Alert Escalation & Suppression: Automated cron jobs detect silent sensors and escalate unacknowledged alerts. Operators can schedule suppression windows for maintenance.Role-Based Access Control: Secure operator and supervisor views to manage specific zones.🛠 Tech StackLayerTechnologyFrontendReact 19, Vite, Tailwind CSSBackendNode.js, Express, TypeScript, ZodDatabasePostgreSQL (Relational Data & Telemetry)Queue / CacheRedis, BullMQBackground JobsNode-cronContainerizationDocker, Docker Compose🏗 ArchitectureGridWatch utilizes an event-driven, queue-based architecture to ensure the ingestion API is never blocked by heavy analytical queries.Code snippetgraph TD
    Client[React Dashboard] -->|REST / SSE| API[Express API]
    API -->|1. Bulk Insert| DB[(PostgreSQL)]
    API -->|2. Enqueue Job| Queue[(Redis / BullMQ)]
    Worker[Anomaly Worker] -->|3. Fetch Job| Queue
    Worker -->|4. Evaluate Rules| DB
    Worker -->|5. Insert Alerts| DB
    Worker -->|6. Trigger Event| API
    API -->|7. SSE Push| Client
📂 Project StructurePlaintext.
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
⚙️ InstallationGridWatch is fully containerized. The easiest way to get started is using Docker Compose.Clone the repository:Bashgit clone https://github.com/vaibhavidhenge23/gridwatch.git
cd gridwatch
Start the infrastructure:This will spin up PostgreSQL, Redis, the Node backend, and the React frontend.Bashdocker-compose up --build
🖥 UsageAccess the Application: Open http://localhost:5173 in your browser.Ingest Data: Send batch telemetry to the API:Bashcurl -X POST http://localhost:3000/ingest \
-H "Content-Type: application/json" \
-d '[{"sensor_id": "UUID", "timestamp": "2024-05-20T10:00:00Z", "voltage": 120.5}]'
Monitor Alerts: Navigate to the Alerts panel in the dashboard to acknowledge or resolve anomalies.🔐 ConfigurationThe system relies on the following environment variables (automatically configured in docker-compose.yml for local development):VariableDescriptionDATABASE_URLPostgreSQL connection string.REDIS_URLRedis connection string for BullMQ.PORTBackend API port (Default: 3000).JWT_SECRETSecret key for signing operator authentication tokens.VITE_API_URLBase URL for the frontend to communicate with the backend.🔌 API & ModulesPOST /ingest: Accepts arrays of sensor readings. Returns 200 OK immediately after the PostgreSQL durable write, delegating analysis to the background queue.GET /sensors/events: An SSE endpoint that clients subscribe to. Streams live JSON payloads triggered by emitter.ts when workers detect state changes.Anomaly Worker (anomaly.worker.ts): Evaluates threshold and rate_of_change rules against a 3-reading historical average.📸 Demo(Add screenshots showing the Dashboard with color-coded sensor states and the Alerts Panel)🤝 ContributingContributions are welcome! Please follow these steps:Fork the repository.Create a feature branch (git checkout -b feature/amazing-feature).Commit your changes (git commit -m 'Add amazing feature').Push to the branch (git push origin feature/amazing-feature).Open a Pull Request.🛣 Roadmap[ ] Add advanced ML-based anomaly detection (e.g., Isolation Forests).[ ] Implement historical data pagination and chart visualizations on the frontend.[ ] Export alert compliance reports to CSV/PDF.📄 LicenseThis project is licensed under the MIT License.
