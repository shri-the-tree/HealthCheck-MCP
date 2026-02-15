import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

// Cache for expensive network ping (30s TTL - connectivity changes slowly)
let connectivityCache = null;
let connectivityTimestamp = 0;
const CONNECTIVITY_CACHE_TTL = 30000; // 30 seconds

/**
 * Get network interfaces and IP addresses
 */
async function getNetworkInterfaces() {
  const interfaces = os.networkInterfaces();
  const result = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    const ipv4 = addrs.find(a => a.family === "IPv4");
    const ipv6 = addrs.find(a => a.family === "IPv6");
    
    if (ipv4 || ipv6) {
      result.push({
        name,
        ipv4: ipv4?.address || "N/A",
        ipv6: ipv6?.address || "N/A",
        mac: ipv4?.mac || ipv6?.mac || "N/A",
      });
    }
  }

  return result;
}

/**
 * Check internet connectivity (with caching)
 */
async function checkInternetConnectivity() {
  const now = Date.now();

  // Return cached connectivity result if fresh
  if (connectivityCache && (now - connectivityTimestamp) < CONNECTIVITY_CACHE_TTL) {
    return { ...connectivityCache, fromCache: true };
  }

  try {
    // Try to resolve a reliable DNS
    const { stdout } = await execPromise(
      "powershell -Command \"Test-Connection 8.8.8.8 -Count 1 -Quiet\""
    );

    const isConnected = stdout.trim() === "True";
    const result = {
      connected: isConnected,
      checkedServer: "8.8.8.8 (Google DNS)",
    };

    // Cache the result
    connectivityCache = result;
    connectivityTimestamp = now;

    return result;
  } catch (error) {
    const result = {
      connected: false,
      checkedServer: "8.8.8.8 (Google DNS)",
      error: "Unable to verify connectivity",
    };

    // Cache the error result too (avoid repeated failed pings)
    connectivityCache = result;
    connectivityTimestamp = now;

    return result;
  }
}

/**
 * Get connected devices (Bluetooth, USB) - try multiple methods
 */
async function getConnectedDevices() {
  try {
    // Method 1: Try Get-PnpDevice (more reliable)
    const pnpData = await getPnpDeviceCount().catch(() => null);
    if (pnpData) {
      return pnpData;
    }

    // Method 2: Try WMI USB query
    const wmiData = await getWMIDeviceCount().catch(() => null);
    if (wmiData) {
      return wmiData;
    }

    // Fallback: return N/A with note
    return {
      usbDevices: "N/A",
      bluetoothDevices: "N/A",
      totalConnectedDevices: "N/A",
      note: "Device enumeration requires elevated permissions. Try running PowerShell as Administrator.",
    };
  } catch (error) {
    return {
      usbDevices: "N/A",
      bluetoothDevices: "N/A",
      totalConnectedDevices: "N/A",
      error: error.message,
    };
  }
}

/**
 * Get device count via Get-PnpDevice (method 1 - more compatible)
 */
async function getPnpDeviceCount() {
  // Get USB devices
  const { stdout: usbOutput } = await execPromise(
    'powershell -Command "Get-PnpDevice -PresentOnly | Where-Object {$_.Class -eq \'USB\'} | Measure-Object | Select-Object -ExpandProperty Count"'
  );

  const usbCount = parseInt(usbOutput.trim()) || 0;

  // Get Bluetooth devices
  const { stdout: btOutput } = await execPromise(
    'powershell -Command "Get-PnpDevice -PresentOnly | Where-Object {$_.Class -eq \'Bluetooth\'} | Measure-Object | Select-Object -ExpandProperty Count"'
  );

  const btCount = parseInt(btOutput.trim()) || 0;

  if (usbCount === 0 && btCount === 0) {
    throw new Error("Device query returned zero results");
  }

  return {
    usbDevices: usbCount,
    bluetoothDevices: btCount,
    totalConnectedDevices: usbCount + btCount,
    method: "Get-PnpDevice",
  };
}

/**
 * Get device count via WMI (method 2 - fallback)
 */
async function getWMIDeviceCount() {
  // Get USB devices via WMI
  const { stdout: usbOutput } = await execPromise(
    'powershell -Command "Get-WmiObject Win32_USBHub | Measure-Object | Select-Object -ExpandProperty Count"'
  );

  const usbCount = parseInt(usbOutput.trim()) || 0;

  // Bluetooth devices are harder to enumerate reliably via WMI
  // Return partial data
  return {
    usbDevices: usbCount,
    bluetoothDevices: "N/A",
    totalConnectedDevices: usbCount,
    method: "WMI (USB only)",
    note: "Bluetooth device count requires elevated permissions",
  };
}

/**
 * Get comprehensive network status
 */
export async function getNetworkStatus() {
  const [interfaces, connectivity, devices] = await Promise.all([
    getNetworkInterfaces(),
    checkInternetConnectivity(),
    getConnectedDevices(),
  ]);

  // Determine severity
  let severity = "info";
  const recommendations = [];
  const nextStepsToCheck = [];

  // Critical: No internet connectivity
  if (connectivity.connected === false) {
    severity = "critical";
    recommendations.push("No internet connectivity detected");
    recommendations.push("Check network cables, Wi-Fi connection, or router status");
    recommendations.push("Try: ipconfig /release && ipconfig /renew (run as Administrator)");
  }
  // Warning: Device enumeration failed
  else if (devices.usbDevices === "N/A" || devices.bluetoothDevices === "N/A") {
    severity = "warning";
    recommendations.push("Device enumeration incomplete - requires elevated permissions");
    recommendations.push("Run PowerShell as Administrator for full device visibility");
  }
  // Info: All good
  else {
    recommendations.push("Network status normal");
    if (devices.usbDevices > 0 || devices.bluetoothDevices > 0) {
      recommendations.push(`Connected devices: ${devices.totalConnectedDevices} (${devices.usbDevices} USB, ${devices.bluetoothDevices} Bluetooth)`);
    }
  }

  // Build actionable summary
  let actionableSummary = "";
  const activeInterfaces = interfaces.filter(i => i.ipv4 !== "N/A" || i.ipv6 !== "N/A");

  if (connectivity.connected) {
    actionableSummary = `✅ Internet connected (${activeInterfaces.length} active interface${activeInterfaces.length !== 1 ? 's' : ''})`;
    if (devices.totalConnectedDevices !== "N/A") {
      actionableSummary += `. ${devices.totalConnectedDevices} device${devices.totalConnectedDevices !== 1 ? 's' : ''}`;
    }
  } else {
    actionableSummary = `❌ No internet connectivity - ${activeInterfaces.length} interface${activeInterfaces.length !== 1 ? 's' : ''} detected but unreachable`;
  }

  return {
    timestamp: new Date().toISOString(),
    severity,
    interfaces,
    internetConnectivity: connectivity,
    connectedDevices: devices,
    actionableSummary,
    recommendations,
    nextStepsToCheck,
  };
}
