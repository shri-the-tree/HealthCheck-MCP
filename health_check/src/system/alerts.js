import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

// Simple cache to avoid repeated expensive calls (2-5s TTL)
let alertCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 3000; // 3 seconds

/**
 * OPTIMIZED: Get health alerts - PRIMARY ENTRYPOINT
 * Lightweight implementation that only calls cheap functions
 * Defers expensive checks to deep tools
 */
export async function getHealthAlerts() {
  const now = Date.now();
  
  // Return cached result if fresh
  if (alertCache && (now - cacheTimestamp) < CACHE_TTL) {
    return alertCache;
  }

  const alerts = {
    timestamp: new Date().toISOString(),
    critical: [],
    warning: [],
    info: [],
  };

  // Get lightweight metrics only
  const [cpuUsage, memUsage, diskUsage, securityStatus] = await Promise.all([
    getCPUQuick(),
    getMemoryQuick(),
    getDiskQuickCheck(),
    getSecurityQuickCheck(),
  ]);

  // CPU alerts
  if (cpuUsage > 90) {
    alerts.critical.push(`⚠️ CPU critically high: ${cpuUsage}%`);
  } else if (cpuUsage > 80) {
    alerts.warning.push(`CPU elevated: ${cpuUsage}%`);
  }

  // Memory alerts
  if (memUsage.usagePercent > 90) {
    alerts.critical.push(`⚠️ Memory critically high: ${memUsage.usagePercent}%`);
  } else if (memUsage.usagePercent > 85) {
    alerts.warning.push(`Memory elevated: ${memUsage.usagePercent}%`);
  }

  // Disk alerts
  if (diskUsage.percentFree < 5) {
    alerts.critical.push(`⚠️ Disk space critical: ${diskUsage.percentFree}% free`);
  } else if (diskUsage.percentFree < 20) {
    alerts.warning.push(`Low disk space: ${diskUsage.percentFree}% free`);
  }

  // Security alerts (quick checks)
  if (securityStatus.defenderDisabled === true) {
    alerts.critical.push("⚠️ Windows Defender is disabled");
  }

  if (securityStatus.firewallDisabled === true) {
    alerts.critical.push("⚠️ Windows Firewall is disabled");
  }

  // Build recommendations for next steps
  const nextStepsToCheck = buildNextSteps(alerts, cpuUsage, memUsage, diskUsage);
  const actionableSummary = generateSummary(alerts, nextStepsToCheck);

  const result = {
    ...alerts,
    alertCount: {
      critical: alerts.critical.length,
      warning: alerts.warning.length,
      info: alerts.info.length,
      total: alerts.critical.length + alerts.warning.length + alerts.info.length,
    },
    systemHealthScore: calculateHealthScore(alerts),
    nextStepsToCheck,  // KEY: Tell Claude what to investigate
    actionableSummary, // KEY: Human-readable recommendation
    cacheInfo: {
      cachedAt: new Date().toISOString(),
      staleAfter: CACHE_TTL,
    },
  };

  // Cache the result
  alertCache = result;
  cacheTimestamp = now;

  return result;
}

/**
 * Quick CPU check - just os.loadavg()
 */
async function getCPUQuick() {
  const cpus = os.cpus();
  const avgLoad = os.loadavg()[0];
  const cpuCount = cpus.length;
  const usage = (avgLoad / cpuCount) * 100;
  return Math.min(100, Math.round(usage * 100) / 100);
}

/**
 * Quick memory check - just totalmem/freemem
 */
function getMemoryQuick() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const usagePercent = (usedMemory / totalMemory) * 100;

  return {
    totalGB: Math.round((totalMemory / (1024 ** 3)) * 100) / 100,
    usedGB: Math.round((usedMemory / (1024 ** 3)) * 100) / 100,
    freeGB: Math.round((freeMemory / (1024 ** 3)) * 100) / 100,
    usagePercent: Math.round(usagePercent * 100) / 100,
  };
}

/**
 * Quick disk check - C: drive only
 */
async function getDiskQuickCheck() {
  try {
    const { stdout } = await execPromise(
      'powershell -Command "Get-Volume -DriveLetter C | Select-Object @{Name=\'PercentFree\';Expression={[math]::Round((($_.SizeRemaining/$_.Size)*100), 2)}} | Select-Object -ExpandProperty PercentFree"'
    );

    const percentFree = parseFloat(stdout.trim());
    return {
      percentFree: isNaN(percentFree) ? "N/A" : percentFree,
      warning: percentFree < 20,
      critical: percentFree < 5,
    };
  } catch (error) {
    return {
      percentFree: "N/A",
      warning: false,
      critical: false,
    };
  }
}

/**
 * Quick security check - just defender and firewall status
 */
async function getSecurityQuickCheck() {
  try {
    const defenderPromise = execPromise(
      'powershell -Command "Get-MpPreference | Select-Object -ExpandProperty DisableRealtimeMonitoring"'
    ).catch(() => ({ stdout: "" }));

    const firewallPromise = execPromise(
      'powershell -Command "Get-NetFirewallProfile | Where-Object {$_.Enabled -eq $true} | Measure-Object | Select-Object -ExpandProperty Count"'
    ).catch(() => ({ stdout: "" }));

    const [defenderResult, firewallResult] = await Promise.all([
      defenderPromise,
      firewallPromise,
    ]);

    const defenderDisabled = defenderResult.stdout?.trim() === "True";
    const firewallEnabledProfiles = parseInt(firewallResult.stdout?.trim() || "0");

    return {
      defenderDisabled,
      firewallDisabled: firewallEnabledProfiles === 0,
    };
  } catch (error) {
    return {
      defenderDisabled: false,
      firewallDisabled: false,
    };
  }
}

/**
 * Determine which deep tools to recommend
 */
function buildNextSteps(alerts, cpuUsage, memUsage, diskUsage) {
  const nextSteps = [];

  if (cpuUsage > 80 || memUsage.usagePercent > 85) {
    nextSteps.push("get_performance_stats"); // Check what processes are using resources
  }

  if (diskUsage.percentFree < 20) {
    nextSteps.push("get_system_health"); // Check disk space and system stability
  }

  // Only recommend expensive tools if we have specific alerts
  if (alerts.critical.some(a => a.includes("Defender"))) {
    nextSteps.push("get_system_health"); // More detailed security check
  }

  return nextSteps.slice(0, 2); // Max 2 recommendations
}

/**
 * Generate human-readable actionable summary
 */
function generateSummary(alerts, nextSteps) {
  const healthScore = calculateHealthScore(alerts);
  
  if (alerts.critical.length > 0) {
    const criticalIssues = alerts.critical.slice(0, 2).join("; ");
    return `🔴 CRITICAL: ${criticalIssues}. Run: ${nextSteps.join(", ") || "get_performance_stats"}`;
  }

  if (alerts.warning.length > 0) {
    const warningIssues = alerts.warning.slice(0, 2).join("; ");
    return `🟡 WARNING: ${warningIssues}. Run: ${nextSteps.join(", ") || "investigate further"}`;
  }

  if (alerts.info.length > 0) {
    return `ℹ️ INFO: System health good overall. ${alerts.info[0] || "No immediate action needed."}`;
  }

  return `✅ System healthy (score: ${healthScore.score}/100)`;
}

/**
 * Calculate overall system health score (0-100)
 */
function calculateHealthScore(alerts) {
  const criticalPenalty = alerts.critical.length * 15;
  const warningPenalty = alerts.warning.length * 5;
  const score = Math.max(0, 100 - criticalPenalty - warningPenalty);

  return {
    score: Math.round(score * 100) / 100,
    status:
      score >= 80
        ? "Good"
        : score >= 60
          ? "Fair"
          : score >= 40
            ? "Poor"
            : "Critical",
  };
}

