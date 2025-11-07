<template>
    <div class="fixed inset-0 z-40">
        <div class="absolute inset-0 bg-black/50" @click="close"></div>

        <div
            class="absolute inset-x-0 top-12 mx-auto w-11/12 max-w-5xl bg-default border border-default rounded-lg shadow-lg z-50">
            <!-- Header -->
            <div class="flex items-center justify-between px-4 py-3 border-b border-default">
                <h3 class="text-lg font-semibold">
                    HOW TO PORT FORWARD
                </h3>
                <button class="btn btn-danger" @click="close">Close</button>
            </div>

            <!-- Body -->
            <div class="px-4 pt-4 pb-4 text-sm text-left space-y-6 overflow-y-auto max-h-[75vh]">
                <section class="space-y-3">
                    <p>Allow people <em>outside</em> your network to access Studio Share links by opening
                        <b>HTTPS (port 443)</b> on your router and forwarding it to your Studio Share server.
                    </p>
                </section>

                <section class="space-y-3">
                    <h4 class="font-semibold text-base">Step 1 — Find your server’s local IP</h4>
                    <ul class="list-disc pl-5 space-y-1">
                        <li><b>Windows:</b> Open Command Prompt → type <code>ipconfig</code> → use the <b>IPv4
                                Address</b>
                            (looks like <code>192.168.x.x</code>).</li>
                        <li><b>Mac/Linux:</b> Open Terminal → type <code>hostname -I</code> → take the first
                            <code>192.168/10.0</code> address.
                        </li>
                    </ul>
                    <p class="text-xs opacity-80">Tip: Write this down. You’ll need it in Step 3 as the “Internal IP.”
                    </p>
                </section>

                <section class="space-y-3">
                    <h4 class="font-semibold text-base">Step 2 — Log into your router</h4>
                    <ul class="list-disc pl-5 space-y-1">
                        <li>In a web browser, go to <code>http://192.168.1.1</code> or <code>http://192.168.0.1</code>.
                            If those don’t work, check the router’s label/manual for the address.</li>
                        <li>Sign in with the router username/password (often printed on the router).</li>
                    </ul>
                </section>

                <section class="space-y-3">
                    <h4 class="font-semibold text-base">Step 3 — Add a Port Forwarding rule</h4>
                    <p>In your router, open the section named <b>Port Forwarding</b>, <b>NAT</b>, <b>Virtual Server</b>,
                        or
                        <b>Advanced</b>.
                    </p>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <tbody class="[&>tr>td]:py-1 [&>tr>td]:pr-3">
                                <tr>
                                    <td class="font-medium">Name / Service</td>
                                    <td>Studio Share</td>
                                </tr>
                                <tr>
                                    <td class="font-medium">External Port</td>
                                    <td>443</td>
                                </tr>
                                <tr>
                                    <td class="font-medium">Internal Port</td>
                                    <td>443</td>
                                </tr>
                                <tr>
                                    <td class="font-medium">Protocol</td>
                                    <td>TCP</td>
                                </tr>
                                <tr>
                                    <td class="font-medium">Internal IP</td>
                                    <td>Your server’s local IP from Step 1</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p>Save/apply. Some routers may restart.</p>
                </section>

                <section class="space-y-3">
                    <h4 class="font-semibold text-base">Step 4 — Verify it’s open</h4>
                    <ol class="list-decimal pl-5 space-y-1">
                        <li>Go to <a href="https://canyouseeme.org" target="_blank"
                                class="text-primary underline">canyouseeme.org</a>.</li>
                        <li>Enter <b>443</b> and click <b>Check</b>.</li>
                        <li>You should see <b>Success: Port 443 is open</b>.</li>
                    </ol>
                    <p class="text-xs opacity-80">If it fails, see “Troubleshooting” below.</p>
                </section>

                <section class="space-y-2">
                    <h4 class="font-semibold text-base">Optional — Make it stick</h4>
                    <ul class="list-disc pl-5 space-y-1">
                        <li>In your router, set a <b>DHCP Reservation</b> (or static IP) for your server so its local IP
                            doesn’t change.</li>
                    </ul>
                </section>

                <section class="space-y-2">
                    <h4 class="font-semibold text-base">Troubleshooting</h4>
                    <ul class="list-disc pl-5 space-y-1">
                        <li><b>Port check fails:</b> Ensure houston-broadcaster and nginx are running and listening
                            on <b>443</b>, and your
                            firewall allows it.</li>
                        <li><b>Multiple routers (double NAT):</b> If your ISP modem is also a router, you may need to
                            forward 443 on both devices
                            (modem → router, then router → server) or put your router in the modem’s DMZ.</li>
                        <li><b>ISP blocks 443:</b> Some ISPs block inbound 443 on residential plans. Contact your ISP or
                            use a business plan.</li>
                        <li><b>Dynamic public IP:</b> Your WAN IP can change. Consider enabling Dynamic DNS (DDNS) on
                            the router.</li>
                    </ul>
                </section>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const emit = defineEmits(["close"]);
function close() {
    emit("close");
}
</script>
