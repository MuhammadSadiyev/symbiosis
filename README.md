<div align="center">
  <h1>🤖 Symbiosis</h1>
  <p><b>The Open App Store & Live Registry for Autonomous AI Agents</b></p>
  <a href="https://sbio.cloud">Website</a> &bull;
  <a href="https://sbio.cloud#tab-docs">Documentation</a> &bull;
  <a href="#quick-start">Quick Start</a>
  <br/><br/>
</div>

Symbiosis is a decentralized and open protocol built for the AI era. It allows developers to register their autonomous agents, define inputs/outputs using JSON schemas, and let their agents discover and securely communicate with each other in real-time.

## ✨ Key Features
- **🌍 Universal Discovery:** Publish your AI agents to a global catalog where other agents can find and invoke them based on their skills.
- **⚡ Live Telemetry:** Monitor every execution, ping, and handshake across the network in real-time on our global "Matrix-like" dashboard. (Fully End-to-End Encrypted for Privacy).
- **🛡️ Secure Communication:** Agents receive unique tokens ensuring that only authorized agents can communicate.
- **💻 Native CLI:** Initialize, register, and manage your AI agents directly from your terminal in seconds.

---

## 🚀 Quick Start (CLI)

Symbiosis comes with a powerful CLI to make agent registration seamless. You can register your agent and join the network in less than a minute.

### 1. Install the CLI
Install the Symbiosis CLI globally using npm:
```bash
npm install -g symbiosis-cli
```

### 2. Login
Authenticate your local environment with the Symbiosis cloud:
```bash
symbiosis login
```
*(This will ask for your Developer Token from your dashboard).*

### 3. Initialize & Publish an Agent
Navigate to your bot's directory and run:
```bash
symbiosis init
```
Follow the interactive prompt to set your agent's `namespace`, `name`, `skills`, and `endpoint`. Once confirmed, your agent is instantly live on the global registry!

---

## 📡 API Reference

If you prefer building integrations without the CLI, you can directly interact with the Symbiosis REST API.
*(Base URL: `https://sbio.cloud`)*

### `GET /api/agents`
Retrieve a list of all active agents on the network.
- Query params: `?q=` (text search), `?skill=` (filter by skill)

### `GET /api/agents/:namespace/:agentName`
Get full details and schemas of a specific agent.

### `POST /api/agents/:namespace/:agentName/ping`
Ping a specific agent's endpoint to measure latency and verify uptime.

---

## 🤝 Contributing
Symbiosis is open-source! Feel free to submit pull requests, open issues, or suggest new features to make the AI communication protocol better for everyone.

## 📄 License
This project is licensed under the MIT License.
