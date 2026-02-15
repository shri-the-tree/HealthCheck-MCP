System Health MCP Server

A Model Context Protocol (MCP) server for monitoring laptop and desktop health across multiple system domains including performance, battery, thermal behavior, networking, and system security.

This project implements a structured MCP design focused on reliability, efficiency, and predictable model interaction. The server is strictly read-only and does not modify system state.

Overview

System Health MCP exposes a curated set of tools that allow MCP clients such as Claude Desktop to diagnose system conditions through structured telemetry.

The server follows a Primary + Deep Tools architecture, where a lightweight entrypoint provides high-level diagnostic signals and domain-specific tools provide detailed inspection only when required.

Key goals:

Provide actionable system diagnostics

Minimize token usage during model reasoning

Avoid expensive or privileged operations when possible

Maintain deterministic, low-latency responses

Architecture Model
Primary Tool

The primary entrypoint is:

get_health_alerts


This tool performs a lightweight system scan and returns:

Critical, warning, and informational alerts

Overall system health score

Recommended follow-up tools (nextStepsToCheck)

Actionable summaries for the model

The primary tool is designed to be called first for vague or general user requests.

Deep Inspection Tools

Domain-specific tools provide detailed telemetry when further investigation is required.

Tool	Purpose
get_performance_stats	CPU usage, memory utilization, disk I/O, top processes
get_battery_status	Battery state, power plan, charging status
get_thermal_status	Temperature and throttling indicators
get_network_status	Network interfaces and connectivity
get_system_health	Security, updates, and stability indicators
Legacy Overview Tool
get_full_health_report


Provides a consolidated snapshot of system metrics. This tool remains available but is superseded by the Primary + Deep Tools workflow.

Design Principles
Primary + Deep Tool Pattern

The server follows a structured interaction flow:

The primary tool performs rapid triage.

The model evaluates alerts and recommendations.

Only relevant deep tools are invoked.

This reduces redundant calls and improves reasoning consistency.

Actionable Output Structure

All deep tools return structured responses containing:

severity — info, warning, or critical

actionableSummary — concise state description

recommendations — suggested remediation steps

nextStepsToCheck — guidance for further inspection

Example structure:

{
  "severity": "warning",
  "actionableSummary": "CPU elevated at 85%",
  "recommendations": ["Close unused applications"],
  "nextStepsToCheck": ["get_thermal_status"]
}

Read-Only Operation

The MCP server never modifies system settings or executes destructive actions. All tools are designed for monitoring and reporting only.

Performance Optimizations
Intelligent Caching

To reduce expensive system calls, several tools implement caching:

Tool	Cache TTL	Notes
get_health_alerts	3 seconds	Lightweight triage tool
get_thermal_status	10 seconds	Reduces repeated WMI queries
get_network_status	30 seconds	Avoids repeated connectivity checks

Caching reduces latency and prevents redundant OS queries.

Token Efficiency

The Primary + Deep Tools model minimizes unnecessary tool calls.

Typical workflow:

User request → get_health_alerts → targeted deep tool → diagnosis


This avoids speculative execution of multiple tools.

Project Structure
health_check/
├── package.json
├── src/
│   ├── index.js
│   └── system/
│       ├── alerts.js
│       ├── performance.js
│       ├── battery.js
│       ├── thermal.js
│       ├── network.js
│       ├── systemHealth.js
│       └── health.js

Installation
npm install

Running the Server
npm start


The server runs over stdio and waits for MCP client connections.

MCP Server Configuration

The server declares tool support during initialization:

const server = new Server(
  {
    name: "system-health-mcp",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

Usage Flow
Example: General Performance Issue
User: "My laptop feels slow"


Claude calls get_health_alerts

Tool returns elevated CPU alert and recommends get_performance_stats

Claude performs targeted inspection

Diagnosis is generated

Example: Specific Battery Request
User: "Check battery health"


Claude directly calls get_battery_status without invoking the primary tool.

Permissions

Some telemetry depends on system privileges or hardware support.

Data	Standard User	Administrator
CPU, Memory, Disk	Yes	Yes
Process list	Yes	Yes
Network interfaces	Yes	Yes
Firewall and Defender status	Yes	Yes
Battery telemetry	Limited	Extended
USB and Bluetooth enumeration	Limited	Extended

Battery health percentage is not consistently available through standard Windows APIs and may require OEM telemetry or offline battery reports.

Limitations

Battery health metrics are not universally exposed via WMI.

Thermal and fan telemetry availability depends on hardware support.

Some device enumeration requires elevated privileges.

Desktop systems will not report battery data.

Troubleshooting
Battery Information Unavailable

Possible causes:

Desktop system with no battery

Limited permissions

Hardware does not expose telemetry

Suggested manual diagnostic:

powercfg /batteryreport

Device Enumeration Issues

If USB or Bluetooth counts are unavailable:

Run PowerShell as Administrator

Technologies

Node.js

Model Context Protocol SDK

Windows WMI and PowerShell integration

Native OS telemetry APIs
