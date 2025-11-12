import os from 'os';
import path from 'path';
import fs from 'fs';

export function getOS(): 'mac' | 'rocky' | 'debian' | 'win' {
  const platform = os.platform();
  if (platform === 'darwin') return 'mac';

  try {
    const releaseInfo = fs.readFileSync('/etc/os-release', 'utf-8').toLowerCase();
    if (releaseInfo.includes('rocky')) return 'rocky';
    if (releaseInfo.includes('debian') || releaseInfo.includes('ubuntu')) return 'debian';
  } catch (error) { }

  return 'win';
}

export function getRsync() {
  let basePath = getAppPath();

  const sshKeyPath = path.join(basePath, ".ssh", "id_ed25519");
  const rsyncPath = getOS() === "win" ? path.join(basePath, "cwrsync", "bin", "rsync.exe") : "rsync";
  const sshWithKey = `ssh -i '${sshKeyPath}'`;
  const rsync = `${rsyncPath} -az -e "${sshWithKey}"`
  return rsync;
}


export async function getAsset(folder: string, fileName: string, isFolder: boolean = false): Promise<string> {
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {

    const os = getOS();
    if (os === "mac") {
      const filePath = path.join(__dirname, "..", "..", "..", "..", "src", "main", folder, fileName);

      console.debug("asset: ", filePath);

      return filePath;
    } else {
      const filePath = path.join(__dirname, "..", "..", folder, fileName);

      console.debug("asset: ", filePath);

      return filePath;
    }
    
  } else {

    const filePath = path.join(__dirname, "..", "..", "..", folder, fileName);

    console.debug("asset: ", filePath);

    return filePath;
  }  
}

export function extractJsonFromOutput(output: string): any {
  try {
    // Try to find the first valid-looking JSON object in the string
    const jsonMatch = output.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      // console.warn('[extractJsonFromOutput] No JSON object found in output:', output);
      return { error: true, message: 'No JSON object found in output' };
    }

    const jsonString = jsonMatch[0];
    return JSON.parse(jsonString);
  } catch (err) {
    // console.error('[extractJsonFromOutput] Failed to parse JSON:', err);
    return { error: true, message: 'Invalid JSON format in output' };
  }
}


export function getAppPath() {
  // Determine the base path
  const isDev = process.env.NODE_ENV === 'development';
  let basePath = process.resourcesPath || __dirname;
  if (isDev) {
    if (getOS() == "win") {

      basePath = __dirname + "\\..\\..\\static\\"
    } else {

      basePath = __dirname + "/../../static/"
    }
  }

  console.debug("[getAppPath] resolved to:", basePath); // <--- ADD THIS

  return basePath;
}


export function isDev() {
  return process.env.NODE_ENV === 'development';
}


export function getScp() {
  const sshKeyPath = getSSHKey();
  const scpPath = "scp";
  const scp = `${scpPath} -o StrictHostKeyChecking=no -o PasswordAuthentication=no -i ""${sshKeyPath}"" -r`
  return scp;
}

export function getSsh() {
  const sshKeyPath = getSSHKey();
  return `ssh -o StrictHostKeyChecking=no -o PasswordAuthentication=no -i ""${sshKeyPath}""`;
}

export function getSSHKey() {
  let basePath = getAppPath();

  const sshKeyPath = path.join(basePath, ".ssh", "id_ed25519");
  return sshKeyPath;
}

export function getNoneQuotedScp() {
  const sshKeyPath = getSSHKey();
  const scpPath = "scp";
  const scp = `${scpPath} -o StrictHostKeyChecking=no -o PasswordAuthentication=no -i "${sshKeyPath}" -r`
  return scp;
}

function slugHost(h) {
  return String(h).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'box';
}
function machineId() {
  try { return fs.readFileSync('/etc/machine-id', 'utf8').trim(); } catch { return 'local0000'; }
}
export function defaultSubdomain() {
  return `${slugHost(os.hostname())}-${machineId().slice(0, 6)}`;
}
