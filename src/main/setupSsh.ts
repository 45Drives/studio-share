// setupSsh.ts
import fs from "fs";
import net from "net";
import path from "path";
import { app } from "electron";
import { NodeSSH } from "node-ssh";
import { getOS } from "./utils";
import { getKeyDir, ensureKeyPair } from "./crossPlatformSsh";

/** Quick TCP probe for port 22 */
export function checkSSH(host: string, timeout = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeout);
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
    sock.once("timeout", () => { sock.destroy(); resolve(false); });
    sock.connect(22, host);
  });
}

/** password auth (one-time) to plant our pubkey */
async function connectWithPassword(args: { host: string; username: string; password: string; }) {
  const { host, username, password } = args;
  const ssh = new NodeSSH();
  await ssh.connect({
    host,
    username,
    password,
    tryKeyboard: true,
    onKeyboardInteractive(_n, _i, _l, prompts, finish) {
      finish(prompts.map(() => password));
    },
    readyTimeout: 20_000,
  });
  return ssh;
}

/** key/agent auth */
async function connectWithKey(args: { host: string; username: string; privateKey: string; agent?: string }) {
  const { host, username, privateKey, agent } = args;
  const ssh = new NodeSSH();
  await ssh.connect({
    host,
    username,
    privateKey,
    agent,
    tryKeyboard: false,
    readyTimeout: 20_000,
  });
  return ssh;
}

/** Append public key to remote authorized_keys (idempotent) */
export async function setupSshKey(host: string, username: string, password: string): Promise<void> {
  // make sure we actually have a keypair locally
  const keyDir = getKeyDir();
  const priv = path.join(keyDir, "id_rsa");
  const pub = `${priv}.pub`;
  await ensureKeyPair(priv, pub);

  const ssh = await connectWithPassword({ host, username, password });

  const publicKey = fs.readFileSync(pub, "utf8").trim().replace(/["`]/g, "");

  await ssh.execCommand(
    [
      "mkdir -p ~/.ssh",
      "chmod 700 ~/.ssh",
      `grep -F "${publicKey}" ~/.ssh/authorized_keys 2>/dev/null || echo "${publicKey}" >> ~/.ssh/authorized_keys`,
      "chmod 600 ~/.ssh/authorized_keys",
    ].join(" && ")
  );

  ssh.dispose();
}

/** Install houston-broadcaster via OS package manager, if missing */
async function ensureBroadcasterInstalled(ssh: NodeSSH, sudoPrefix: string) {
  const check = await ssh.execCommand(
    `bash -lc 'rpm -q houston-broadcaster >/dev/null 2>&1 || dpkg -s houston-broadcaster >/dev/null 2>&1'`
  );
  if (check.code === 0) return; // already installed

  const install = await ssh.execCommand(
    [
      `bash -lc '`,
      `if command -v dnf >/dev/null 2>&1; then ${sudoPrefix} dnf -y install houston-broadcaster;`,
      `elif command -v yum >/dev/null 2>&1; then ${sudoPrefix} yum -y install houston-broadcaster;`,
      `elif command -v apt-get >/dev/null 2>&1; then ${sudoPrefix} apt-get update -y && ${sudoPrefix} DEBIAN_FRONTEND=noninteractive apt-get install -y houston-broadcaster;`,
      `else echo "No supported package manager found" >&2; exit 2; fi'`,
    ].join(" ")
  );

  if ((install.code ?? 1) !== 0) {
    throw new Error(`Unable to install houston-broadcaster: ${install.stderr || install.stdout}`);
  }
}

/** Run the server-side hb-bootstrap CLI (preferred) or packaged bootstrap.sh */
export async function runRemoteBootstrapCLI(
  host: string,
  username: string,
  privateKeyPath: string,
  passwordForSudo?: string
): Promise<{ stdout: string; stderr: string; code: number; reboot?: boolean }> {
  const agent = process.env.SSH_AUTH_SOCK || undefined;
  const ssh = await connectWithKey({
    host,
    username,
    privateKey: fs.readFileSync(privateKeyPath, "utf8"),
    agent,
  });

  const sudoPrefix = passwordForSudo
    ? `echo '${passwordForSudo.replace(/'/g, "'\\''")}' | sudo -S -p ''`
    : `sudo`;

  // Ensure package exists
  await ensureBroadcasterInstalled(ssh, sudoPrefix);

  // Prefer hb-bootstrap on PATH; else packaged path
  const detect = await ssh.execCommand(
    `bash -lc 'command -v hb-bootstrap || test -x /usr/libexec/houston/bootstrap.sh && echo "/usr/libexec/houston/bootstrap.sh" || echo ""'`
  );
  const hbPath = detect.stdout.trim();
  if (!hbPath) {
    ssh.dispose();
    throw new Error("hb-bootstrap not found on remote host.");
  }

  const cmd =
    hbPath.endsWith("bootstrap.sh") ? `${sudoPrefix} "${hbPath}"` : `${sudoPrefix} "${hbPath}" --mode ip`;

  const run = await ssh.execCommand(cmd, { cwd: "/tmp" });
  ssh.dispose();

  const log = `${run.stdout || ""}\n${run.stderr || ""}`;
  const reboot = /\b(REBOOT_REQUIRED)\b/i.test(log);
  return { stdout: run.stdout, stderr: run.stderr, code: run.code ?? 0, reboot };
}
