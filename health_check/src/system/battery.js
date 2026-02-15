import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

/**
 * Stable low-privilege battery status
 * Designed for MCP usage — fast, reliable, read-only.
 */
export async function getBatteryStatus() {
  try {
    const timestamp = new Date().toISOString();

    // 1️⃣ Check if battery exists
    const hasBattery = await checkBatteryExists();

    // Always get power plan (safe operation)
    const powerPlan = await getPowerPlanOnly().catch(() => "Unknown");

    if (!hasBattery) {
      return {
        timestamp,
        chargePercent: "N/A",
        status: "Desktop System",
        healthPercent: "N/A",
        powerPlan,
        chemistry: "N/A",
        note: "No battery detected. Desktop system or battery unavailable.",
        method: "No Battery",
        severity: "info",
        actionableSummary: "Desktop system without battery. This is normal.",
        recommendations: ["No action needed - battery data not applicable to desktop systems"],
        nextStepsToCheck: [],
      };
    }

    // 2️⃣ Try lightweight WMI battery info (no admin required)
    const basicBattery = await getBatteryBasic().catch(() => null);

    if (basicBattery) {
      const severity = basicBattery.chargePercent < 25 ? "warning" : "info";
      return {
        timestamp,
        ...basicBattery,
        powerPlan,
        healthPercent:
          "Unavailable via standard permissions (requires OEM telemetry or battery report)",
        method: "WMI Basic",
        severity,
        actionableSummary: `Battery: ${basicBattery.chargePercent}% (${basicBattery.status})`,
        recommendations: basicBattery.chargePercent < 25 ? ["Consider connecting to power soon"] : ["Battery status normal"],
        nextStepsToCheck: [],
      };
    }

    // 3️⃣ Fallback — only power info
    const acStatus = await getACStatus().catch(() => "Unknown");

    return {
      timestamp,
      chargePercent: "N/A",
      status: acStatus,
      healthPercent: "N/A",
      powerPlan,
      chemistry: "N/A",
      note:
        "Limited battery data available. System may restrict battery telemetry.",
      method: "Fallback",
      severity: "info",
      actionableSummary: `Power plan: ${powerPlan}. Full battery data unavailable.`,
      recommendations: ["Run PowerShell as Administrator for detailed battery information"],
      nextStepsToCheck: [],
    };
  } catch (error) {
    return {
      timestamp: new Date().toISOString(),
      chargePercent: "N/A",
      status: "Unknown",
      healthPercent: "N/A",
      powerPlan: "Unknown",
      chemistry: "N/A",
      error: error.message,
      severity: "warning",
      actionableSummary: "Error retrieving battery status",
      recommendations: ["Check system logs for WMI errors"],
      nextStepsToCheck: [],
    };
  }
}

/**
 * Check if system has battery
 */
async function checkBatteryExists() {
  try {
    const { stdout } = await execPromise(
      'powershell -Command "Get-WmiObject Win32_Battery | Measure-Object | Select-Object -ExpandProperty Count"'
    );

    return parseInt(stdout.trim()) > 0;
  } catch {
    // If query fails, assume battery may exist
    return true;
  }
}

/**
 * Lightweight battery info (safe query)
 */
async function getBatteryBasic() {
  const { stdout } = await execPromise(
    'powershell -Command "Get-WmiObject Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus,Chemistry | ConvertTo-Json"'
  );

  const battery = JSON.parse(stdout);

  if (!battery || battery.EstimatedChargeRemaining == null) {
    throw new Error("Battery data unavailable");
  }

  const statusMap = {
    1: "Discharging",
    2: "AC Power",
    3: "Fully Charged",
    4: "Low",
    5: "Critical",
  };

  return {
    chargePercent: battery.EstimatedChargeRemaining ?? "N/A",
    status: statusMap[battery.BatteryStatus] || "Unknown",
    chemistry: battery.Chemistry || "Unknown",
  };
}

/**
 * Get active power plan
 */
async function getPowerPlanOnly() {
  const { stdout } = await execPromise(
    'powershell -Command "Get-WmiObject -Namespace root\\\\cimv2\\\\power -Class Win32_PowerPlan -Filter \'IsActive=true\' | Select-Object -ExpandProperty ElementName"'
  );

  return stdout.trim() || "Unknown";
}

/**
 * AC adapter status fallback
 */
async function getACStatus() {
  const { stdout } = await execPromise(
    'powershell -Command "Get-WmiObject -Class Win32_ACAdapter | Select-Object -ExpandProperty Availability"'
  );

  const acConnected = stdout.trim() !== "" && stdout.trim() !== "0";

  return acConnected ? "AC Power" : "Discharging";
}
