import path from "path";
import { app } from "electron";
import fs from "fs";
import { execFile, spawnSync } from "child_process";
import { promisify } from "util";
import { getOS, getAsset } from "./utils";

const execFileAsync = promisify(execFile);

/* ---------- helpers ---------- */
async function fileExists(p: string, mode = fs.constants.R_OK | fs.constants.W_OK) {
    try { await fs.promises.access(p, mode); return true; }
    catch (err: any) {
        if (err?.code === "ENOENT") return false; // missing is okay
        throw err; // permission or other error should bubble
    }
}

async function resolveSshKeygen(): Promise<string> {
    const isWin = getOS() === "win";
    if (isWin) {
        const exe = await getAsset("static/bin", "ssh-keygen.exe");
        if (!fs.existsSync(exe)) throw new Error(`ssh-keygen.exe not found at ${exe}`);
        return exe;
    } else {
        // Ensure ssh-keygen is available in PATH
        const which = spawnSync("which", ["ssh-keygen"]);
        if (which.status !== 0) throw new Error("ssh-keygen not found in $PATH");
        return "ssh-keygen";
    }
}

/* ---------- AGENT HANDLING ---------- */
export function getAgentSocket(): string | undefined {
    // Standard Un*x → honour whatever the shell exported
    if (process.env.SSH_AUTH_SOCK) return process.env.SSH_AUTH_SOCK;

    // Windows: ssh2 understands the literal string "pageant"                     :contentReference[oaicite:0]{index=0}
    if (process.platform === "win32") return "pageant";
    
    return undefined;                 // fall back to password / key upload
}

/* ---------- ssh-keygen (ed25519 by default) ---------- */
export async function ensureKeyPair(pk: string, pub: string) {
    // Ensure parent dir once
    await fs.promises.mkdir(path.dirname(pk), { recursive: true });

    const hasPrivate = await fileExists(pk);
    const hasPublic = await fileExists(pub);

    if (hasPrivate && hasPublic) return;

    const sshKeygen = await resolveSshKeygen();

    if (hasPrivate && !hasPublic) {
        // Derive pub from existing private without overwriting it
        const { stdout } = await execFileAsync(sshKeygen, ["-y", "-f", pk], { windowsHide: true });
        // stdout is the public key line (e.g., "ssh-ed25519 AAAA... comment")
        await fs.promises.writeFile(pub, stdout.endsWith("\n") ? stdout : stdout + "\n", { mode: 0o600 });
        return;
    }

    // Generate a fresh ed25519 keypair (no passphrase)
    // -a 100 increases KDF rounds for the private key format; cheap at creation, transparent at use via agent
    await execFileAsync(
        sshKeygen,
        ["-t", "ed25519", "-a", "100", "-f", pk, "-N", "", "-q"],
        { windowsHide: true }
    );
    // ssh-keygen writes .pub automatically
}

/* ---------- per-OS paths that the callers need ---------- */
export function getKeyDir() {
    const dir = path.join(app.getPath("userData"), ".ssh");
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    return dir;
}

/*
 * Some consumers require a PEM-encoded RSA private key (PKCS#1) — ed25519
 * does NOT support "-m PEM" in the same way. Use this ONLY when a PEM RSA
 * key is explicitly required.
 */
export async function regeneratePemKeyPair(pk: string) {
    await fs.promises.mkdir(path.dirname(pk), { recursive: true });
    const pub = `${pk}.pub`;
    try { await fs.promises.unlink(pk); } catch { /* ignore */ }
    try { await fs.promises.unlink(pub); } catch { /* ignore */ }

    const sshKeygen = await resolveSshKeygen();

    await execFileAsync(
        sshKeygen,
        ["-t", "rsa", "-b", "4096", "-m", "PEM", "-f", pk, "-N", "", "-q"],
        { windowsHide: true }
    );
}
