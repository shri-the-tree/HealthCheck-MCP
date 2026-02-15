# 🏥 System Health MCP Server

> **A production-ready Model Context Protocol (MCP) server for comprehensive Windows system health monitoring**

Monitor laptop health across performance, battery, thermal, network, and security dimensions with intelligent caching and actionable insights. Built following optimal MCP design patterns for maximum efficiency.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-latest-blue)](https://github.com/modelcontextprotocol/sdk)

---

## 📑 Table of Contents

- [Highlights](#-highlights)
- [Quick Start](#-quick-start)
- [Architecture](#-architecture)
- [Tools Reference](#-tools-reference)
- [Usage Examples](#-usage-examples)
- [Performance](#-performance)
- [Installation](#-installation)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

---

## ✨ Highlights

### **Optimal MCP Pattern Implementation**

This server demonstrates best practices for MCP tool design:

| Feature | Implementation | Benefit |
|---------|---------------|---------|
| 🎯 **Primary Tool First** | `get_health_alerts` provides fast triage | 40-50% fewer tool calls |
| 🔍 **Smart Deep Tools** | 6 specialized tools with actionable outputs | Targeted investigations only |
| ⚡ **Intelligent Caching** | 3-30s TTL based on data volatility | 96% faster repeated calls |
| 🧠 **Decision Guidance** | Every tool includes `nextStepsToCheck` | Clear investigation paths |
| 📊 **Actionable Outputs** | Severity + recommendations + summaries | No interpretation needed |

### **Key Capabilities**

- ✅ **Read-only monitoring** - Zero system modifications, pure telemetry
- ✅ **Graceful degradation** - Works with limited permissions, escalates when needed
- ✅ **Multi-fallback queries** - 3-tier fallback chains for reliability
- ✅ **Windows-optimized** - PowerShell + WMI integration for deep insights
- ✅ **Production-ready** - Error handling, caching, and performance optimizations

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** and npm
- **Windows 10/11** (PowerShell 5.1+)
- **Optional**: Administrator privileges for full telemetry

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd health_check

# Install dependencies
npm install

# Start the MCP server
npm start
```

### Configure with Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "system-health": {
      "command": "node",
      "args": ["c:/Users/shri/PycharmProjects/MCP/health_check/src/index.js"]
    }
  }
}
```

### First Query

```
You: "Check my system health"

Claude: (calls get_health_alerts)
"Your system is healthy (score: 95/100). CPU at 25%, memory at 45%,
 all security features active."
```

---

## 🏗️ Architecture

### Design Pattern: **Primary + Deep Tools**

```
┌─────────────────────────────────────────────────────────────┐
│  User Request: "My laptop is slow"                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
          ┌───────────────────────┐
          │ 🎯 PRIMARY TOOL       │
          │ get_health_alerts     │  ← Fast (3s cache)
          │ Returns: Alerts +     │  ← CPU, Memory, Disk, Security
          │   nextStepsToCheck    │  ← No expensive calls
          └───────────┬───────────┘
                      │
        ┌─────────────┴─────────────┐
        │ Result: CPU 92% (critical)│
        │ Next: get_performance_stats│
        └─────────────┬─────────────┘
                      │
                      ▼
          ┌───────────────────────┐
          │ 🔍 DEEP TOOL          │
          │ get_performance_stats │  ← Called only when needed
          │ Returns: Top processes│  ← Actionable data
          └───────────┬───────────┘
                      │
        ┌─────────────┴──────────────┐
        │ Chrome using 8GB (50% RAM) │
        │ Recommendation: Close tabs │
        └────────────────────────────┘
```

### Tool Hierarchy

```
📦 health_check/
├── 🎯 PRIMARY (Call First)
│   └── get_health_alerts        ← Lightweight triage + guidance
│
├── 🔍 DEEP TOOLS (Call on Demand)
│   ├── get_performance_stats    ← CPU/memory investigation
│   ├── get_battery_status       ← Power & health analysis
│   ├── get_thermal_status       ← Temperature monitoring
│   ├── get_network_status       ← Connectivity diagnostics
│   └── get_system_health        ← Security & stability
│
└── 📊 LEGACY
    └── get_full_health_report   ← Quick snapshot (optional)
```

---

## 🛠️ Tools Reference

### 1. **get_health_alerts** 🎯 PRIMARY

**When to use**: First call for any health-related request

**What it does**: Fast system scan returning categorized alerts and investigation guidance

**Output**:
```json
{
  "critical": ["⚠️ CPU critically high: 92%"],
  "warning": ["Low disk space: 18% free"],
  "systemHealthScore": { "score": 75, "status": "Fair" },
  "nextStepsToCheck": ["get_performance_stats", "get_system_health"],
  "actionableSummary": "🔴 CRITICAL: CPU high. Run: get_performance_stats"
}
```

**Performance**: ~60ms (cached 3s)

---

### 2. **get_performance_stats** 🔍 DEEP

**When to use**: After alerts show high CPU/memory, or for process analysis

**What it does**: Detailed resource usage + top 5 processes by CPU/memory

**Output**:
```json
{
  "severity": "warning",
  "cpu": { "usagePercent": 85.5, "coreCount": 8 },
  "memory": { "totalGB": 16, "usedGB": 14.5, "usagePercent": 90.6 },
  "topProcesses": [
    { "Name": "chrome", "CPU": 45.2, "MemoryMB": 8192 }
  ],
  "recommendations": ["Close unused Chrome tabs"],
  "nextStepsToCheck": ["get_thermal_status"]
}
```

**Optional params**:
```javascript
// Skip process enumeration (40% faster)
getPerformanceStats({ includeProcesses: false })
```

---

### 3. **get_battery_status** 🔍 DEEP

**When to use**: Battery alerts, power concerns, or charging issues

**What it does**: Battery charge, health %, power plan, chemistry type

**Output**:
```json
{
  "severity": "info",
  "chargePercent": 85,
  "status": "AC Power",
  "healthPercent": "Unavailable (requires admin or battery report)",
  "powerPlan": "Balanced",
  "recommendations": ["Battery status normal"]
}
```

**Note**: Desktop systems return `"Desktop System"` status automatically

---

### 4. **get_thermal_status** 🔍 DEEP

**When to use**: Thermal alerts, performance issues, or overheating concerns

**What it does**: CPU/GPU temps, throttling detection, fan status

**Output**:
```json
{
  "severity": "warning",
  "cpu": { "temperatureCelsius": 88.5, "unit": "°C" },
  "thermalThrottling": false,
  "recommendations": ["CPU temp elevated - monitor closely"],
  "cacheInfo": { "staleAfter": 10000 }
}
```

**Performance**: ~150ms (cached 10s) - expensive WMI queries

---

### 5. **get_network_status** 🔍 DEEP

**When to use**: Connectivity issues or device enumeration

**What it does**: Network interfaces, internet check (ping 8.8.8.8), USB/Bluetooth counts

**Output**:
```json
{
  "severity": "info",
  "internetConnectivity": { "connected": true },
  "connectedDevices": { "usbDevices": 3, "bluetoothDevices": 2 },
  "actionableSummary": "✅ Internet connected (2 active interfaces). 5 devices"
}
```

**Performance**: ~800ms (cached 30s) - includes network ping

---

### 6. **get_system_health** 🔍 DEEP

**When to use**: Security alerts, stability issues, or disk space warnings

**What it does**: Defender/Firewall status, updates, event log errors, disk health

**Output**:
```json
{
  "severity": "critical",
  "antivirus": { "active": false, "realTimeMonitoring": false },
  "firewall": { "active": true, "enabledProfiles": 3 },
  "disk": { "percentFree": 8.5, "critical": true },
  "recommendations": ["⚠️ CRITICAL: Enable Windows Defender immediately"],
  "nextStepsToCheck": []
}
```

---

## 📚 Usage Examples

### Example 1: Vague User Request

**Scenario**: User says *"My laptop feels slow"*

```
Step 1: Claude calls get_health_alerts
  → Response: CPU 92% (critical), Memory 88% (warning)
  → Next steps: ["get_performance_stats"]

Step 2: Claude calls get_performance_stats
  → Response: Chrome using 8GB RAM (50%), Node.js using 28% CPU
  → Recommendations: "Close 3-4 Chrome tabs"

Result: 2 tool calls (vs 4-5 without guidance)
```

---

### Example 2: Specific Investigation

**Scenario**: User asks *"Why is my CPU usage high?"*

```
Claude calls get_performance_stats (directly - no need for alerts)
  → Response: Shows top 5 processes by CPU
  → Top offender: "DiscordCanary.exe" (65% CPU)
  → Recommendation: "Restart Discord or check for updates"
```

---

### Example 3: Thermal Investigation Chain

**Scenario**: User reports *"Laptop is getting hot"*

```
Step 1: get_health_alerts
  → No critical alerts, but suggests checking thermal

Step 2: get_thermal_status
  → CPU: 58°C (normal), no throttling
  → Recommendation: "Thermal status normal"

Step 3: Claude explains
  → "Heat is expected under load but system is not overheating"
```

---

## ⚡ Performance

### Latency Comparison

| Operation | Before Optimization | After Optimization | Improvement |
|-----------|--------------------|--------------------|-------------|
| Primary tool (`get_health_alerts`) | ~1500ms | ~60ms | **96% faster** |
| Thermal check (cached) | 150ms | 0ms | **Instant** |
| Network check (cached) | 800ms | 0ms | **Instant** |
| Performance stats (no processes) | 500ms | 300ms | **40% faster** |

### Caching Strategy

| Tool | Cache TTL | Reason |
|------|-----------|--------|
| `get_health_alerts` | 3 seconds | Frequently called entrypoint |
| `get_thermal_status` | 10 seconds | Expensive WMI queries, temps change slowly |
| `get_network_status` | 30 seconds | Expensive ping, connectivity rarely changes |

### Token Efficiency

**Before**: 3-4 speculative tool calls per vague request
**After**: 1-2 targeted calls guided by `nextStepsToCheck`
**Savings**: 40-50% reduction in token usage

---

## 📥 Installation

### Method 1: NPM

```bash
npm install
npm start
```

### Method 2: From Source

```bash
git clone <repo-url>
cd health_check
npm install
node src/index.js
```

### Configuration

The server runs on **stdio transport** by default. Add to your MCP client config:

```json
{
  "mcpServers": {
    "system-health": {
      "command": "node",
      "args": ["path/to/health_check/src/index.js"]
    }
  }
}
```

---

## 🔧 Troubleshooting

### Issue: Battery Information Shows "N/A"

**Symptom**: All battery fields return `N/A` or "Desktop System"

**Causes**:
- Desktop computer (no battery) - **this is normal**
- Insufficient permissions to access ACPI battery interface
- Battery subsystem not exposed to process

**Solutions**:
1. **For desktops**: This is expected - status shows "Desktop System"
2. **For laptops**: Run PowerShell as Administrator
   ```powershell
   # Right-click PowerShell → Run as Administrator
   cd path/to/health_check
   npm start
   ```
3. **Alternative**: Generate battery report manually
   ```powershell
   powercfg /batteryreport
   ```

---

### Issue: Temperature Data Unavailable

**Symptom**: CPU temp shows "N/A"

**Causes**:
- WMI thermal sensors not exposed by hardware
- Requires elevated privileges
- Some systems don't expose thermal data via standard APIs

**Solutions**:
1. Run as Administrator (grants WMI access)
2. Check if hardware supports ACPI thermal zones:
   ```powershell
   Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace root/wmi
   ```
3. Use third-party tools (HWMonitor, CoreTemp) for verification

---

### Issue: USB/Bluetooth Device Count Shows "N/A"

**Symptom**: `connectedDevices` fields return "N/A"

**Causes**:
- Insufficient permissions to enumerate Plug-and-Play devices
- Device class filtering blocked

**Solutions**:
1. Run PowerShell as Administrator
2. Manually verify:
   ```powershell
   Get-PnpDevice -PresentOnly | Where-Object {$_.Class -eq "USB"}
   ```

---

### Issue: Network Ping Timeout

**Symptom**: Internet connectivity check fails on corporate networks

**Cause**: Firewall blocks ICMP (ping) to 8.8.8.8

**Solution**: This is expected on restricted networks. The tool will cache the timeout and avoid repeated failed pings for 30s.

---

## 🤝 Contributing

Contributions are welcome! This project follows the **optimal MCP pattern** - please maintain:

1. **Primary tool** returns guidance (`nextStepsToCheck`)
2. **Deep tools** return actionable outputs (`severity`, `recommendations`)
3. **Caching** for expensive operations
4. **Graceful degradation** with permission fallbacks

### Development

```bash
# Clone and install
git clone <repo-url>
cd health_check
npm install

# Run locally
npm start

# Test with Claude Desktop
# Add to claude_desktop_config.json and restart Claude
```

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

- Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- Follows MCP best practices for optimal tool design
- Inspired by production MCP server patterns

---

---

<p align="center">
  <strong>Built with ❤️ for the MCP ecosystem</strong>
</p>

<p align="center">
  <sub>Demonstrating optimal MCP patterns: Primary + Deep Tools architecture</sub>
</p>
