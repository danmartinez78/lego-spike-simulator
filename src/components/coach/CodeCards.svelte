<script lang="ts">
    // Printable sign-in cards, one per student, cut out along the dashed lines.
    // Only shown when printing.
    import qrcode from 'qrcode-generator';
    import { siteAddress, signInLink, type Student } from '$lib/team';

    export let students: Student[] = [];

    // The dark squares of a QR code, as one SVG path in module units.
    function qr(text: string) {
        const code = qrcode(0, 'M');
        code.addData(text);
        code.make();
        const size = code.getModuleCount();
        let path = '';
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                if (code.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
            }
        }
        return { size, path };
    }

    $: site = siteAddress()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
</script>

<div class="hidden print:grid grid-cols-2 gap-0 text-black" data-testid="code-cards">
    {#each students as s (s.id)}
        <div
            class="border border-dashed border-gray-400 p-4 flex flex-row gap-4 items-center break-inside-avoid"
        >
            <div class="flex-1 flex flex-col gap-1">
                <div class="text-xs uppercase tracking-wider text-gray-600">
                    LEGO SPIKE Simulator
                </div>
                <div class="text-xl font-semibold">{s.name}</div>
                <div class="text-xs text-gray-600 mt-1">Your code</div>
                <div class="font-mono text-lg font-bold tracking-wider">{s.code}</div>
                <div class="text-xs text-gray-700 mt-1 leading-snug">
                    Go to <b>{site}</b>, press <b>Sign in</b> and type your code, or scan the square
                    with a phone. Keep it to yourself, like a password.
                </div>
            </div>
            <div class="w-24 h-24 shrink-0">
                {#each [qr(signInLink(s.code))] as code}
                    <svg
                        viewBox="-2 -2 {code.size + 4} {code.size + 4}"
                        class="w-full h-full"
                        shape-rendering="crispEdges"
                        role="img"
                        aria-label="QR code that signs {s.name} in"
                    >
                        <path d={code.path} fill="black" />
                    </svg>
                {/each}
            </div>
        </div>
    {/each}
</div>
