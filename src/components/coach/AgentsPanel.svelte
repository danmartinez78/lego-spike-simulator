<script lang="ts">
    // Coach page: how to use an AI assistant to write lessons, either connected
    // to the site over MCP or by making a lesson package to import.
    import { Button } from 'flowbite-svelte';
    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher<{ lessons: void }>();

    const origin = typeof window == 'undefined' ? '' : window.location.origin;
    const mcpUrl = `${origin}/mcp`;
    const guideUrl = `${origin}/api/lessons/guide`;
    const checkUrl = `${origin}/api/lessons/check`;
    const challengeCheckUrl = `${origin}/api/challenges/check`;

    const assistants: { name: string; steps: string }[] = [
        {
            name: 'Claude (web, desktop or phone)',
            steps: 'Settings → Connectors → Add custom connector. Name it "SPIKE Simulator" and paste the address.'
        },
        {
            name: 'ChatGPT',
            steps: 'In Settings, add a custom connector with the address and OAuth sign-in. Custom connectors may need developer mode turned on.'
        },
        {
            name: 'Meta Muse',
            steps: 'Settings → Connectors → Add custom connector, and paste the address.'
        },
        {
            name: 'Copilot in VS Code, Cursor and other editors',
            steps: 'Add an MCP server of type "http" with the address, in the editor\'s MCP settings.'
        }
    ];

    const tools: [string, string][] = [
        [
            'get_lesson_guide',
            "The lesson and challenge formats, plus this site's fields with their sizes"
        ],
        ['list_library', 'Lessons, challenges, fields, robots and example programs'],
        ['get_lesson, get_challenge', 'Read an existing one, to copy or improve it'],
        ['check_lesson, check_challenge', 'Check for mistakes without saving'],
        ['save_lesson, save_challenge', 'Save as a draft, with your name on it'],
        ['delete_lesson, delete_challenge', 'Delete one of your own drafts'],
        ['list_assignments', "Assignments with each student's progress, lesson by lesson"],
        [
            'save_assignment, delete_assignment',
            'Set an assignment (practice or prep) as a draft, or delete your own draft'
        ],
        ['get_field_guide, check_field', 'How to describe a field (a practice mat), and check one'],
        [
            'save_field, get_field',
            'Draw a new field from a description, or read one back to change it'
        ],
        ['upload_field, upload_robot', 'Add an existing .spk scene or .mpd/.ldr robot model'],
        ['delete_field, delete_robot', 'Delete a field or robot your assistant added']
    ];

    const claudeCode = `claude mcp add --transport http spike ${mcpUrl}`;

    const packagePrompt = `I want a lesson for the LEGO SPIKE simulator at ${origin}.
Read the lesson guide at ${guideUrl} first. It explains the lesson format and lists the fields, robots and programs this site has.
Write a lesson.json for: <describe the lesson, e.g. "turning 90° with the gyro on the turn rose field, with a check that the robot stops facing right">.
If you can make web requests, check it by POSTing it to ${checkUrl} and fix every error. Then give me the file to download.`;

    const examples = [
        'Write a lesson on driving a square with a repeat block, with a check that the robot ends back in the start box.',
        'Look at the "Sample lesson - Drive a square" lesson and make a harder version that uses a My Block.',
        'Make three short lessons on the colour sensor for beginners, using the colour stops field.',
        'Make a tricky challenge on the mini missions field: drive through P1, avoid the walls and park in P2 within 20 seconds.',
        'Look at the "Hit target A" challenge and make an easier version for beginners.',
        'Set the two colour sensor lessons as prep for next meeting, due next Friday.',
        "Who hasn't finished this week's assignment yet?",
        'Make a line-following field with an oval, a figure eight and a finish box, then a challenge on it.'
    ];

    let copied = '';

    async function copy(text: string, what: string) {
        try {
            await navigator.clipboard.writeText(text);
            copied = what;
            setTimeout(() => {
                if (copied == what) copied = '';
            }, 2000);
        } catch {
            copied = '';
        }
    }
</script>

<section class="flex flex-col gap-4">
    <div>
        <h2 class="text-lg font-semibold">AI assistants</h2>
        <p class="text-gray-600 text-sm">
            An AI assistant can write lessons and challenges for you (checks included), set
            assignments and see how students are getting on, and add robots and fields. There are
            two ways to use one. Lessons, challenges and assignments it makes arrive as
            <strong>drafts</strong>: students can't see them until you look them over and press
            Publish. Robots and fields go into the library straight away, marked "From an assistant"
            on the Robots and maps tab.
        </p>
    </div>

    <div class="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-3">
        <div>
            <h3 class="font-semibold">1. Connect your assistant to the site (MCP)</h3>
            <p class="text-sm text-gray-600">
                Best if your assistant supports custom connectors or MCP servers. It can then read
                the library and students' progress, check its work and save it here directly.
            </p>
        </div>

        <div class="flex flex-row flex-wrap items-center gap-2">
            <span class="text-sm font-medium">Connector address:</span>
            <code class="rounded bg-gray-100 px-2 py-1 text-sm break-all" data-testid="mcp-url"
                >{mcpUrl}</code
            >
            <Button size="xs" color="light" on:click={() => copy(mcpUrl, 'url')}
                >{copied == 'url' ? 'Copied' : 'Copy'}</Button
            >
        </div>

        <ul class="flex flex-col gap-2 text-sm">
            {#each assistants as a}
                <li><strong>{a.name}:</strong> {a.steps}</li>
            {/each}
            <li class="flex flex-col gap-1">
                <span
                    ><strong>Claude Code:</strong> run this, then type <code>/mcp</code> to sign in.</span
                >
                <span class="flex flex-row flex-wrap items-center gap-2">
                    <code class="rounded bg-gray-100 px-2 py-1 break-all">{claudeCode}</code>
                    <Button size="xs" color="light" on:click={() => copy(claudeCode, 'cli')}
                        >{copied == 'cli' ? 'Copied' : 'Copy'}</Button
                    >
                </span>
            </li>
        </ul>

        <p class="text-sm text-gray-700">
            When you connect, a sign-in page opens. Use the same email as for this page; you'll get
            a code by email. Everything the assistant saves shows your email, and it can only change
            or delete what your assistant made: never published lessons, challenges or assignments,
            or other coaches' work.
        </p>
        <p class="text-sm text-gray-600">
            If sign-in fails with a "redirect" error, the site owner needs to allow that assistant
            in Cloudflare once (see docs/mcp.md in the project).
        </p>

        <details class="text-sm">
            <summary class="cursor-pointer font-medium">What the assistant can do</summary>
            <ul class="mt-2 flex flex-col gap-1">
                {#each tools as [name, what]}
                    <li><code>{name}</code>: {what}</li>
                {/each}
            </ul>
        </details>
    </div>

    <div class="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-3">
        <div>
            <h3 class="font-semibold">2. Or have any assistant make a file, then import it</h3>
            <p class="text-sm text-gray-600">
                Works with any chatbot, no connector needed. The assistant reads the public lesson
                guide and gives you a <code>lesson.json</code> (or a <code>.zip</code> package with its
                own fields and programs), which you import here.
            </p>
        </div>
        <ol class="list-decimal ml-5 flex flex-col gap-1 text-sm">
            <li>Copy the prompt below into your assistant and fill in what the lesson is about.</li>
            <li>Download the file it gives you.</li>
            <li>
                On the <strong>Lessons</strong> tab, press
                <strong>Import a lesson</strong> and pick the file. It's added as a draft.
            </li>
            <li>Open it, check the steps and the check on the mat, then press Publish.</li>
        </ol>
        <div class="flex flex-col gap-2">
            <pre
                class="rounded bg-gray-100 p-3 text-sm whitespace-pre-wrap break-words"
                data-testid="package-prompt">{packagePrompt}</pre>
            <div class="flex flex-row flex-wrap gap-2">
                <Button size="xs" color="light" on:click={() => copy(packagePrompt, 'prompt')}
                    >{copied == 'prompt' ? 'Copied' : 'Copy the prompt'}</Button
                >
                <Button size="xs" color="light" href={guideUrl} target="_blank"
                    >Open the lesson guide</Button
                >
                <Button size="xs" color="light" on:click={() => dispatch('lessons')}
                    >Go to Lessons</Button
                >
            </div>
        </div>
        <p class="text-sm text-gray-700">
            <strong>For a challenge</strong>, ask for a challenge JSON instead (the guide covers
            both) and have it checked at <code class="break-all">{challengeCheckUrl}</code>. Then
            use <strong>Import a challenge</strong> on the Challenges tab. Assignments and new fields
            need the connector (way 1).
        </p>
    </div>

    <div class="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-2">
        <h3 class="font-semibold">Things to ask for</h3>
        <ul class="list-disc ml-5 flex flex-col gap-1 text-sm">
            {#each examples as e}
                <li>"{e}"</li>
            {/each}
        </ul>
    </div>
</section>
