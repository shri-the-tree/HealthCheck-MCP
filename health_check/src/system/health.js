import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

/**
 * Get CPU usage percentage
 */
async function getCPUUsage() {
  const cpus = os.cpus();
  const avgLoad = os.loadavg()[0];
  const cpuCount = cpus.length;
  const usage = (avgLoad / cpuCount) * 100;

  return Math.min(100, Math.round(usage * 100) / 100);
}

/**
 * Get memory usage statistics
 */
function getMemoryUsage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const usagePercent = (usedMemory / totalMemory) * 100;

  return {
    totalMemoryGB: Math.round((totalMemory / (1024 ** 3)) * 100) / 100,
    usedMemoryGB: Math.round((usedMemory / (1024 ** 3)) * 100) / 100,
    freeMemoryGB: Math.round((freeMemory / (1024 ** 3)) * 100) / 100,
    usagePercent: Math.round(usagePercent * 100) / 100,
  };
}

/**
 * Get disk usage statistics (Windows)
 */
async function getDiskUsage() {
  try {
    // For Windows, get drive C: usage
    const { stdout } = await execPromise(
      'powershell -Command "Get-Volume -DriveLetter C | Select-Object Size, SizeRemaining | ConvertTo-Json"'
    );
    const volInfo = JSON.parse(stdout);
    const totalDisk = volInfo.Size;
    const freeDisk = volInfo.SizeRemaining;
    const usedDisk = totalDisk - freeDisk;
    const usagePercent = (usedDisk / totalDisk) * 100;

    return {
      totalDiskGB: Math.round((totalDisk / (1024 ** 3)) * 100) / 100,
      usedDiskGB: Math.round((usedDisk / (1024 ** 3)) * 100) / 100,
      freeDiskGB: Math.round((freeDisk / (1024 ** 3)) * 100) / 100,
      usagePercent: Math.round(usagePercent * 100) / 100,
    };
  } catch (error) {
    // Fallback if PowerShell command fails
    return {
      totalDiskGB: "N/A",
      usedDiskGB: "N/A",
      freeDiskGB: "N/A",
      usagePercent: "N/A",
      error: "Unable to retrieve disk information",
    };
  }
}

/**
 * Get system uptime in seconds
 */
function getUptime() {
  const uptimeSeconds = os.uptime();
  const days = Math.floor(uptimeSeconds / (24 * 3600));
  const hours = Math.floor((uptimeSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);

  return {
    uptimeSeconds: uptimeSeconds,
    formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`,
  };
}

/**
 * Get process count
 */
async function getProcessCount() {
  try {
    const { stdout } = await execPromise(
      'powershell -Command "(Get-Process | Measure-Object).Count"'
    );
    const count = parseInt(stdout.trim(), 10);
    return count || 0;
  } catch (error) {
    return "N/A";
  }
}

/**
 * Get comprehensive system health report
 */
export async function getFullHealthReport() {
  const [cpuUsage, memoryUsage, diskUsage, uptime, processCount] = await Promise.all([
    getCPUUsage(),
    Promise.resolve(getMemoryUsage()),
    getDiskUsage(),
    Promise.resolve(getUptime()),
    getProcessCount(),
  ]);

  return {
    timestamp: new Date().toISOString(),
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpuCount: os.cpus().length,
    },
    cpu: {
      usagePercent: cpuUsage,
    },
    memory: memoryUsage,
    disk: diskUsage,
    uptime: uptime,
    processes: {
      count: processCount,
    },
  };
}
