// installServerDeps.ts
import path from "path";
import { NodeSSH } from "node-ssh";
import { checkSSH, setupSshKey, runRemoteBootstrapCLI } from "./setupSsh";
import { getAgentSocket, getKeyDir, ensureKeyPair } from "./crossPlatformSsh";

export async function installServerDepsRemotely({
    host,
    username,
    password,
}: {
    host: string;
    username: string;
    password: string;
}) {
    try {
        // 1) SSH reachable?
        const reachable = await checkSSH(host);
        if (!reachable) return { success: false, error: `Host ${host}:22 not reachable.` };

        // 2) Try agent/key first
        let hasAuth = false;
        const agentSock = getAgentSocket();
        if (agentSock) {
            const trial = new NodeSSH();
            try {
                await trial.connect({ host, username, agent: agentSock, tryKeyboard: false });
                hasAuth = true;
            } catch { /* ignore */ }
            trial.dispose();
        }

        // 3) If no key auth, plant our key via password
        if (!hasAuth) {
            await setupSshKey(host, username, password);
        }

        // 4) Ensure we have a usable keypair to reconnect
        const keyDir = getKeyDir();
        const priv = path.join(keyDir, "id_rsa");
        const pub = `${priv}.pub`;
        await ensureKeyPair(priv, pub);

        // 5) Run server-side hb-bootstrap (no uploading scripts)
        const { code, stdout, stderr, reboot } = await runRemoteBootstrapCLI(
            host,
            username,
            priv,
            password // for sudo if required
        );

        if (code !== 0) {
            return { success: false, error: `hb-bootstrap exited ${code}\n${stderr || stdout}` };
        }
        return { success: true, reboot: !!reboot };
    } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
    }
}
