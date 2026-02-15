#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getFullHealthReport } from "./system/health.js";
import { getPerformanceStats } from "./system/performance.js";
import { getBatteryStatus } from "./system/battery.js";
import { getThermalStatus } from "./system/thermal.js";
import { getNetworkStatus } from "./system/network.js";
import { getSystemHealth } from "./system/systemHealth.js";
import { getHealthAlerts } from "./system/alerts.js";

const server = new Server(
  {
    name: "system-health-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {}
    }
  }
);


// Handle list_tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_health_alerts",
        description: "🎯 PRIMARY ENTRYPOINT: System health overview with alerts and next-steps guidance. Call this first for vague requests. Returns severity-categorized alerts, health score, and actionable recommendations for which deep tools to investigate. Fast and lightweight.",
        primaryUse: "Initial system health assessment, determining what to investigate",
        relatedAlerts: "All severity levels",
        safetyNote: "✅ Read-only, no system modifications",
        fallbacks: "Graceful degradation - may skip expensive checks if unavailable",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_performance_stats",
        description: "🔍 DEEP TOOL: CPU usage, memory breakdown, disk I/O rates, and top 5 processes. USE AFTER: alerts show high CPU/memory. Provides process-level visibility to identify resource hogs.",
        primaryUse: "Investigate CPU or memory alerts; identify resource-consuming processes",
        relatedAlerts: ["CPU > 80%", "Memory > 85%"],
        safetyNote: "✅ Read-only, minimal OS calls",
        fallbacks: "Top processes may be incomplete without admin privileges",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_battery_status",
        description: "🔋 DEEP TOOL: Battery state (charge %, health %, power plan, chemistry). USE AFTER: alerts show low battery or degraded health. Desktop systems report 'Desktop System' status.",
        primaryUse: "Investigate battery-related alerts; check power efficiency",
        relatedAlerts: ["Battery < 25%", "Battery health < 80%"],
        safetyNote: "✅ Read-only; may require admin privileges for full data",
        fallbacks: "Health % may be N/A (requires admin); desktops always show 'Desktop System'",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_thermal_status",
        description: "🌡️ DEEP TOOL: CPU/GPU temperatures, thermal throttling detection, and fan status. USE AFTER: alerts show high temperatures or throttling. Returns temperature thresholds and throttling warnings.",
        primaryUse: "Investigate thermal alerts; check for overheating or thermal throttling",
        relatedAlerts: ["CPU temp > 85°C", "Thermal throttling detected"],
        safetyNote: "✅ Read-only; WMI queries",
        fallbacks: "GPU temp may be N/A (NVIDIA-specific); fan data unavailable on standard APIs",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_network_status",
        description: "🌐 DEEP TOOL: Active network interfaces, IPs, internet connectivity check (ping 8.8.8.8), USB/Bluetooth device counts. USE AFTER: alerts show connectivity issues or use for network diagnostics.",
        primaryUse: "Investigate network connectivity or device enumeration",
        relatedAlerts: ["No internet connectivity", "Device count N/A"],
        safetyNote: "✅ Read-only; includes external ping (8.8.8.8)",
        fallbacks: "USB/Bluetooth counts may be N/A (requires admin); ping may timeout on restricted networks",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_system_health",
        description: "🛡️ DEEP TOOL: Security status (Defender, Firewall), Windows updates, system event log errors (24h), disk space warnings. USE AFTER: alerts show security or stability issues.",
        primaryUse: "Investigate security or stability alerts; check update status",
        relatedAlerts: ["Antivirus disabled", "Firewall disabled", "Low disk space", "System errors > 5"],
        safetyNote: "✅ Read-only; queries Defender, Firewall, Event logs",
        fallbacks: "Update count may be N/A on some systems (requires DCOM); event log may show 0 errors if unavailable",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_full_health_report",
        description: "📊 LEGACY/OPTIONAL: Quick snapshot combining CPU, memory, disk, uptime, process count. Superseded by get_health_alerts + targeted deep tools. Use only if you need a single unified call.",
        primaryUse: "Legacy entrypoint; use get_health_alerts instead for better guidance",
        relatedAlerts: "N/A - returns raw data only",
        safetyNote: "✅ Read-only",
        fallbacks: "Less granular than deep tools",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
  };
});

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    let result;

    switch (request.params.name) {
      case "get_full_health_report":
        result = await getFullHealthReport();
        break;
      case "get_performance_stats":
        result = await getPerformanceStats();
        break;
      case "get_battery_status":
        result = await getBatteryStatus();
        break;
      case "get_thermal_status":
        result = await getThermalStatus();
        break;
      case "get_network_status":
        result = await getNetworkStatus();
        break;
      case "get_system_health":
        result = await getSystemHealth();
        break;
      case "get_health_alerts":
        result = await getHealthAlerts();
        break;
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: error.message,
            tool: request.params.name,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start server on stdio
const transport = new StdioServerTransport();
await server.connect(transport);
