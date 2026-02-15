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
 * Get top processes by CPU and memory usage
 */
async function getTopProcesses(limit = 5) {
  try {
    const { stdout } = await execPromise(
      `powershell -Command "Get-Process | Sort-Object CPU -Descending | Select-Object -First ${limit} @{Name='Name';Expression={$_.ProcessName}},@{Name='CPU';Expression={[math]::Round($_.CPU, 2)}},@{Name='MemoryMB';Expression={[math]::Round($_.WorkingSet/1MB, 2)}} | ConvertTo-Json"`
    );
    
    const processes = JSON.parse(stdout);
    return Array.isArray(processes) ? processes : [processes];
  } catch (error) {
    return [];
  }
}

/**
 * Get disk I/O statistics
 */
async function getDiskIOStats() {
  try {
    // Get disk read/write stats from Performance Monitor
    const { stdout } = await execPromise(
      'powershell -Command "Get-Counter -Counter \'\\\\PhysicalDisk(_Total)\\\\Disk Read Bytes/sec\', \'\\\\PhysicalDisk(_Total)\\\\Disk Write Bytes/sec\' -SampleInterval 1 -MaxSamples 1 | Select-Object -ExpandProperty CounterSamples | ConvertTo-Json"'
    );
    
    const samples = JSON.parse(stdout);
    const stats = Array.isArray(samples) ? samples : [samples];
    
    let readBytesPerSec = 0;
    let writeBytesPerSec = 0;
    
    stats.forEach(stat => {
      if (stat.Path.includes('Disk Read Bytes')) {
        readBytesPerSec = Math.round(stat.CookedValue / 1024 / 1024 * 100) / 100;
      }
      if (stat.Path.includes('Disk Write Bytes')) {
        writeBytesPerSec = Math.round(stat.CookedValue / 1024 / 1024 * 100) / 100;
      }
    });

    return {
      readMBps: readBytesPerSec,
      writeMBps: writeBytesPerSec,
    };
  } catch (error) {
    return {
      readMBps: "N/A",
      writeMBps: "N/A",
      error: "Unable to retrieve disk I/O stats",
    };
  }
}

/**
 * Get memory usage breakdown
 */
function getMemoryBreakdown() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  return {
    totalGB: Math.round((totalMemory / (1024 ** 3)) * 100) / 100,
    usedGB: Math.round((usedMemory / (1024 ** 3)) * 100) / 100,
    freeGB: Math.round((freeMemory / (1024 ** 3)) * 100) / 100,
    usagePercent: Math.round((usedMemory / totalMemory) * 100 * 100) / 100,
  };
}

/**
 * Get comprehensive performance statistics
 * @param {Object} options - Optional configuration
 * @param {boolean} options.includeProcesses - Whether to enumerate top processes (default: true, can be slow)
 * @param {number} options.processLimit - Number of top processes to return (default: 5)
 */
export async function getPerformanceStats(options = {}) {
  const { includeProcesses = true, processLimit = 5 } = options;

  // Always get CPU, memory, disk - these are fast
  const baseChecks = [
    getCPUUsage(),
    Promise.resolve(getMemoryBreakdown()),
    getDiskIOStats(),
  ];

  // Conditionally add process enumeration (can be slow)
  if (includeProcesses) {
    baseChecks.push(getTopProcesses(processLimit));
  }

  const results = await Promise.all(baseChecks);
  const cpuUsage = results[0];
  const memory = results[1];
  const diskIO = results[2];
  const topProcesses = includeProcesses ? results[3] : [];

  // Determine severity level
  let severity = "info";
  if (cpuUsage > 90 || memory.usagePercent > 90) {
    severity = "critical";
  } else if (cpuUsage > 80 || memory.usagePercent > 85) {
    severity = "warning";
  }

  // Build actionable summary
  let actionableSummary = `CPU: ${cpuUsage}%, Memory: ${memory.usagePercent}%`;
  if (includeProcesses && topProcesses.length > 0) {
    const topProcess = topProcesses[0];
    actionableSummary += `. Top process: ${topProcess.Name} (${topProcess.CPU}% CPU, ${topProcess.MemoryMB}MB)`;
  }

  const recommendations = [];
  if (cpuUsage > 80) {
    recommendations.push("Check top processes for CPU-intensive tasks");
  }
  if (memory.usagePercent > 85) {
    recommendations.push("Close unused applications to free memory");
  }
  if (diskIO.readMBps > 100) {
    recommendations.push("Disk I/O is high - heavy file operations in progress");
  }

  const result = {
    timestamp: new Date().toISOString(),
    severity,
    cpu: {
      usagePercent: cpuUsage,
      coreCount: os.cpus().length,
    },
    memory,
    diskIO,
    actionableSummary,
    recommendations,
    nextStepsToCheck: severity === "critical" ? ["get_thermal_status"] : [],
  };

  // Only include processes if requested
  if (includeProcesses) {
    result.topProcesses = topProcesses.slice(0, processLimit);
  } else {
    result.topProcesses = "Skipped (set includeProcesses: true to enumerate)";
  }

  return result;
}
