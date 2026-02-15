import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

// Cache for expensive thermal queries (10s TTL - temps change slowly)
let thermalCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10000; // 10 seconds

/**
 * Get CPU temperature (Windows)
 */
async function getCPUTemperature() {
  try {
    const { stdout } = await execPromise(
      'powershell -Command "Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace root/wmi | Select-Object -ExpandProperty CurrentTemperature | ForEach-Object {($_ - 2732) / 10}"'
    );
    
    const temps = stdout.trim().split('\n').map(t => parseFloat(t)).filter(t => !isNaN(t));
    if (temps.length === 0) return "N/A";
    
    const avgTemp = Math.round((temps.reduce((a, b) => a + b) / temps.length) * 100) / 100;
    return avgTemp;
  } catch (error) {
    return "N/A";
  }
}

/**
 * Get GPU temperature (NVIDIA/AMD if available)
 */
async function getGPUTemperature() {
  try {
    // Try NVIDIA
    const { stdout: nvidiaOutput } = await execPromise(
      'nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>$null',
      { shell: "powershell" }
    ).catch(() => ({ stdout: null }));
    
    if (nvidiaOutput) {
      return parseInt(nvidiaOutput.trim());
    }
    
    return "N/A";
  } catch (error) {
    return "N/A";
  }
}

/**
 * Check for thermal throttling
 */
async function checkThermalThrottling() {
  try {
    const { stdout } = await execPromise(
      'powershell -Command "Get-WmiObject Win32_Processor | Select-Object @{Name=\'Throttling\';Expression={$_.CurrentClockSpeed -lt $_.MaxClockSpeed}} | Select-Object -ExpandProperty Throttling"'
    );
    
    return stdout.trim() === "True";
  } catch (error) {
    return "Unknown";
  }
}

/**
 * Get fan speeds if available
 */
async function getFanSpeeds() {
  try {
    // Windows doesn't expose fan speeds easily, return placeholder
    const { stdout } = await execPromise(
      'powershell -Command "Get-WmiObject -Class Win32_SystemEnclosure | Select-Object -ExpandProperty ChassisTypes"'
    );
    
    return {
      available: false,
      note: "Fan speed data not available through standard Windows APIs",
    };
  } catch (error) {
    return {
      available: false,
      note: "Unable to retrieve fan information",
    };
  }
}

/**
 * Get comprehensive thermal status
 */
export async function getThermalStatus() {
  const now = Date.now();

  // Return cached result if fresh
  if (thermalCache && (now - cacheTimestamp) < CACHE_TTL) {
    return thermalCache;
  }

  const [cpuTemp, gpuTemp, throttling, fans] = await Promise.all([
    getCPUTemperature(),
    getGPUTemperature(),
    checkThermalThrottling(),
    getFanSpeeds(),
  ]);

  // Determine severity based on temperatures and throttling
  let severity = "info";
  const recommendations = [];
  const nextStepsToCheck = [];

  // Critical conditions
  if (typeof cpuTemp === "number" && cpuTemp > 95) {
    severity = "critical";
    recommendations.push("CPU temperature critical - shut down unnecessary applications immediately");
    recommendations.push("Ensure proper ventilation and check for dust buildup");
    nextStepsToCheck.push("get_performance_stats"); // Check what's causing high CPU usage
  } else if (throttling === true) {
    severity = "critical";
    recommendations.push("Thermal throttling detected - performance is being reduced to prevent overheating");
    recommendations.push("Close resource-intensive applications and improve cooling");
    nextStepsToCheck.push("get_performance_stats");
  }
  // Warning conditions
  else if (typeof cpuTemp === "number" && cpuTemp > 85) {
    severity = "warning";
    recommendations.push(`CPU temperature elevated at ${cpuTemp}°C - monitor closely`);
    recommendations.push("Consider improving airflow or reducing workload");
  } else if (typeof gpuTemp === "number" && gpuTemp > 85) {
    severity = "warning";
    recommendations.push(`GPU temperature elevated at ${gpuTemp}°C`);
    recommendations.push("Close GPU-intensive applications if temperature persists");
  }
  // Info/normal conditions
  else if (typeof cpuTemp === "number" && cpuTemp <= 85) {
    recommendations.push("Thermal status normal");
  } else {
    // Temperature data unavailable
    recommendations.push("Temperature monitoring unavailable - requires WMI access or hardware sensors");
    recommendations.push("Run PowerShell as Administrator for temperature data");
  }

  // Build actionable summary
  let actionableSummary = "";
  if (typeof cpuTemp === "number") {
    actionableSummary = `CPU: ${cpuTemp}°C`;
    if (typeof gpuTemp === "number") {
      actionableSummary += `, GPU: ${gpuTemp}°C`;
    }
    if (throttling === true) {
      actionableSummary += " ⚠️ THROTTLING";
    }
  } else {
    actionableSummary = "Temperature data unavailable (requires elevated privileges or hardware sensors)";
  }

  const result = {
    timestamp: new Date().toISOString(),
    severity,
    cpu: {
      temperatureCelsius: cpuTemp,
      unit: typeof cpuTemp === "number" ? "°C" : "N/A",
    },
    gpu: {
      temperatureCelsius: gpuTemp,
      unit: typeof gpuTemp === "number" ? "°C" : "N/A",
    },
    thermalThrottling: throttling,
    fans,
    actionableSummary,
    recommendations,
    nextStepsToCheck,
    cacheInfo: {
      cachedAt: new Date().toISOString(),
      staleAfter: CACHE_TTL,
    },
  };

  // Cache the result
  thermalCache = result;
  cacheTimestamp = now;

  return result;
}
