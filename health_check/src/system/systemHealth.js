import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

/**
 * Check Windows Defender status
 */
async function getDefenderStatus() {
  try {
    const { stdout } = await execPromise(
      'powershell -Command "Get-MpPreference | Select-Object -ExpandProperty DisableRealtimeMonitoring"'
    );
    
    const disabled = stdout.trim() === "True";
    return {
      active: !disabled,
      realTimeMonitoring: !disabled,
    };
  } catch (error) {
    return {
      active: "Unknown",
      realTimeMonitoring: "Unknown",
      error: "Unable to determine Defender status",
    };
  }
}

/**
 * Check Firewall status
 */
async function getFirewallStatus() {
  try {
    const { stdout } = await execPromise(
      'powershell -Command "Get-NetFirewallProfile | Where-Object {$_.Enabled -eq $true} | Measure-Object | Select-Object -ExpandProperty Count"'
    );
    
    const enabledProfiles = parseInt(stdout.trim());
    return {
      active: enabledProfiles > 0,
      enabledProfiles: enabledProfiles,
    };
  } catch (error) {
    return {
      active: "Unknown",
      enabledProfiles: "Unknown",
      error: "Unable to determine Firewall status",
    };
  }
}

/**
 * Check for pending Windows updates
 */
async function getPendingUpdates() {
  try {
    const { stdout } = await execPromise(
      'powershell -Command "Get-WmiObject -Namespace "root\\ccm\\clientSDK" -Class CCM_SoftwareUpdate -Filter CompletionState=0 | Measure-Object | Select-Object -ExpandProperty Count"'
    );
    
    const pendingCount = parseInt(stdout.trim()) || 0;
    return {
      pending: pendingCount > 0,
      count: pendingCount,
    };
  } catch (error) {
    // Windows Update COM API might not be available
    return {
      pending: "Unknown",
      count: "N/A",
      note: "Check Windows Update settings manually",
    };
  }
}

/**
 * Check system event log for errors (last 24 hours)
 */
async function getSystemErrors() {
  try {
    const { stdout } = await execPromise(
      'powershell -Command "Get-EventLog -LogName System -EntryType Error -After (Get-Date).AddHours(-24) | Measure-Object | Select-Object -ExpandProperty Count"'
    );
    
    const errorCount = parseInt(stdout.trim()) || 0;
    return {
      errors24h: errorCount,
      critical: errorCount > 10,
    };
  } catch (error) {
    return {
      errors24h: "N/A",
      critical: "Unknown",
      error: "Unable to retrieve system logs",
    };
  }
}

/**
 * Get disk space warning
 */
async function getDiskHealth() {
  try {
    const { stdout } = await execPromise(
      'powershell -Command "Get-Volume -DriveLetter C | Select-Object @{Name=\'PercentFree\';Expression={[math]::Round((($_.SizeRemaining/$_.Size)*100), 2)}} | Select-Object -ExpandProperty PercentFree"'
    );
    
    const percentFree = parseFloat(stdout.trim());
    return {
      percentFree,
      warning: percentFree < 20,
      critical: percentFree < 5,
    };
  } catch (error) {
    return {
      percentFree: "N/A",
      warning: false,
      critical: false,
      error: "Unable to retrieve disk information",
    };
  }
}

/**
 * Get comprehensive system health status
 */
export async function getSystemHealth() {
  const [defender, firewall, updates, errors, disk] = await Promise.all([
    getDefenderStatus(),
    getFirewallStatus(),
    getPendingUpdates(),
    getSystemErrors(),
    getDiskHealth(),
  ]);

  // Determine severity based on security and stability
  let severity = "info";
  const recommendations = [];
  const nextStepsToCheck = [];
  const criticalIssues = [];
  const warnings = [];

  // Critical security issues
  if (defender.active === false) {
    severity = "critical";
    criticalIssues.push("Windows Defender is disabled");
    recommendations.push("⚠️ CRITICAL: Enable Windows Defender immediately");
    recommendations.push("Run: Set-MpPreference -DisableRealtimeMonitoring $false (as Administrator)");
  }

  if (firewall.active === false) {
    severity = "critical";
    criticalIssues.push("Windows Firewall is disabled");
    recommendations.push("⚠️ CRITICAL: Enable Windows Firewall");
    recommendations.push("Run: Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True");
  }

  // Critical disk space
  if (typeof disk.percentFree === "number" && disk.percentFree < 5) {
    severity = "critical";
    criticalIssues.push(`Disk space critical: ${disk.percentFree}% free`);
    recommendations.push("⚠️ CRITICAL: Free up disk space immediately");
    recommendations.push("Run Disk Cleanup (cleanmgr) or delete unnecessary files");
  }

  // Critical system errors
  if (typeof errors.errors24h === "number" && errors.errors24h > 10) {
    if (severity !== "critical") severity = "critical";
    criticalIssues.push(`High system error count: ${errors.errors24h} in last 24h`);
    recommendations.push("Review Event Viewer for system stability issues");
    nextStepsToCheck.push("get_performance_stats"); // Check if performance issues
  }

  // Warnings (if not already critical)
  if (severity !== "critical") {
    if (typeof disk.percentFree === "number" && disk.percentFree >= 5 && disk.percentFree < 20) {
      severity = "warning";
      warnings.push(`Low disk space: ${disk.percentFree}% free`);
      recommendations.push("Consider freeing up disk space soon");
    }

    if (typeof errors.errors24h === "number" && errors.errors24h >= 5 && errors.errors24h <= 10) {
      if (severity !== "warning") severity = "warning";
      warnings.push(`Moderate system errors: ${errors.errors24h} in last 24h`);
      recommendations.push("Monitor system logs for recurring issues");
    }

    if (updates.pending === true && updates.count !== "N/A") {
      warnings.push(`${updates.count} Windows update${updates.count !== 1 ? 's' : ''} pending`);
      recommendations.push("Install pending Windows updates when convenient");
    }
  }

  // Info/normal state
  if (severity === "info") {
    recommendations.push("System security and stability look good");
    if (defender.active === true) {
      recommendations.push("✅ Windows Defender active");
    }
    if (firewall.active === true) {
      recommendations.push("✅ Windows Firewall active");
    }
    if (typeof disk.percentFree === "number" && disk.percentFree >= 20) {
      recommendations.push(`✅ Disk space healthy (${disk.percentFree}% free)`);
    }
  }

  // Build actionable summary
  let actionableSummary = "";
  if (criticalIssues.length > 0) {
    actionableSummary = `🔴 CRITICAL: ${criticalIssues.join("; ")}`;
  } else if (warnings.length > 0) {
    actionableSummary = `🟡 ${warnings.join("; ")}`;
  } else {
    const goodItems = [];
    if (defender.active === true) goodItems.push("Defender");
    if (firewall.active === true) goodItems.push("Firewall");
    actionableSummary = `✅ System healthy (${goodItems.join(", ")} active`;
    if (typeof disk.percentFree === "number") {
      actionableSummary += `, ${disk.percentFree}% disk free`;
    }
    actionableSummary += ")";
  }

  return {
    timestamp: new Date().toISOString(),
    severity,
    antivirus: {
      status: "Windows Defender",
      ...defender,
    },
    firewall,
    updates,
    systemLogs: {
      errors24h: errors.errors24h,
      critical: errors.critical,
    },
    disk,
    actionableSummary,
    recommendations,
    nextStepsToCheck,
  };
}
