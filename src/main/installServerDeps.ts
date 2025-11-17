// installServerDeps.ts
import path from "path";
import { NodeSSH } from "node-ssh";
import { checkSSH, setupSshKey, ensureBroadcasterInstalled, connectWithKey } from "./setupSsh";
import { getAgentSocket, getKeyDir, ensureKeyPair, regeneratePemKeyPair } from "./crossPlatformSsh";

type ProgressFn = (p: { step: string; label: string }) => void;

export async function installServerDepsRemotely(opts: {
    host: string; username: string; password: string; onProgress?: ProgressFn;
}) {
    const { host, username, password, onProgress } = opts;
    const send = (step: string, label: string) => onProgress?.({ step, label });

    try {
        send('probe', `Probing ${host}:22…`);
        const reachable = await checkSSH(host);
        if (!reachable) return { success: false, error: `Host ${host}:22 not reachable.` };

        // Try agent first, else plant key via password
        let hasAuth = false;
        const agentSock = getAgentSocket();
        if (agentSock) {
            send('auth', 'Trying SSH agent…');
            const trial = new NodeSSH();
            try { await trial.connect({ host, username, agent: agentSock, tryKeyboard: false }); hasAuth = true; } catch { }
            trial.dispose();
        }
        // Connect with key/agent
        send('connect', 'Connecting via SSH…');
        const keyDir = getKeyDir();
        const priv = path.join(keyDir, 'id_ed25519');
        await ensureKeyPair(priv, `${priv}.pub`);
        console.log('keyDir:', keyDir)

        if (!hasAuth) {
            send('key', 'Creating/planting SSH key…');
            await setupSshKey(host, username, password);
        }
        async function tryConnectWithCurrentKey() {
            return hasAuth
                ? await connectWithKey({ host, username, privateKey: priv, agent: agentSock! })
                : await connectWithKey({ host, username, privateKey: priv });
        }

        let ssh;
        try {
            ssh = await tryConnectWithCurrentKey();
        } catch (e: any) {
            const m = String(e?.message || e);
            if (/unsupported key format/i.test(m)) {
                // Fallback: regenerate PEM and retry
                send('key', 'Regenerating SSH key (PEM)…');
                await regeneratePemKeyPair(priv); 
                ssh = await tryConnectWithCurrentKey();
            } else {
                throw e; // real failure
            }
        }

        try {
            send('install', 'Installing Broadcaster…');
            await ensureBroadcasterInstalled(ssh, { password });

            send('enable', 'Enabling & starting service…');
            await ssh.execCommand(`bash -lc 'sudo systemctl enable --now houston-broadcaster || true'`);

            // Wait for bootstrap to finish: health first, then look for the known journal line
            send('wait', 'Waiting for service health…');
            const health = await ssh.execCommand(
                `bash -lc 'for i in {1..30}; do curl -fsS http://127.0.0.1:9095/healthz >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1;'`
            );

            if ((health.code ?? 1) !== 0) {
                // Optional: check journal for the “Finished first-run bootstrap” marker
                send('wait', 'Waiting for bootstrap to complete…');
                const journal = await ssh.execCommand(
                    `bash -lc 'for i in {1..60}; do journalctl -u houston-broadcaster -o cat --since "5 min ago" | grep -q "Finished Houston Broadcaster first-run bootstrap" && exit 0; sleep 1; done; exit 1;'`
                );
                if ((journal.code ?? 1) !== 0) {
                    // Not fatal—renderer will probe again—but tell the UI we’re done waiting
                    send('warn', 'Service started; bootstrap may still be finishing…');
                }
            }

            return { success: true };
        } finally {
            ssh.dispose();
        }
    } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
    }
}