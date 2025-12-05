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

export async function getAsset(folder: string, fileName: string, isFolder: boolean = false): Promise<string> {
  if (isDev()) {
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

export function getAppPath() {
  let basePath = process.resourcesPath || __dirname;
  if (isDev()) {
    if (getOS() == "win") {

      basePath = __dirname + "\\..\\..\\static\\"
    } else {

      basePath = __dirname + "/../../static/"
    }
  }

  console.debug("[getAppPath] resolved to:", basePath);

  return basePath;
}


export function isDev() {
  return process.env.NODE_ENV === 'development';
}
