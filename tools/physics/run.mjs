// Headless physics checks for the simulator (see tools/physics/README.md).
//
// Sets up a fake browser, then loads harness.ts through Vite's SSR loader so
// the app's own modules ($lib aliases, TypeScript) run unchanged.
//
// Usage: node tools/physics/run.mjs [script.ts]   (default: validate.ts)
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const require = createRequire(path.join(repo, 'package.json'));

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const k of [
    'window',
    'document',
    'navigator',
    'localStorage',
    'HTMLElement',
    'Element',
    'Node',
    'DOMParser',
    'XMLSerializer'
]) {
    // Node has its own navigator; keep it.
    if (!(k in globalThis)) globalThis[k] = dom.window[k];
}
globalThis.Audio = class {
    pause() {}
    play() {}
    get ended() {
        return true;
    }
};
globalThis.AudioContext = class {
    createOscillator() {
        return {
            connect() {},
            start() {},
            stop() {},
            frequency: { value: 0, setValueAtTime() {} }
        };
    }
    get destination() {
        return {};
    }
};
globalThis.requestAnimationFrame = () => 0;

// Blockly's Node build is CommonJS; give Vite an ES module with its names so
// `import * as Blockly from 'blockly/core'` works, sharing one Blockly with
// the @blockly plugins (which Node loads itself).
const Blockly = require('blockly/core');
Blockly.utils.xml.injectDependencies(dom.window);
const shim = path.join(here, '.blockly-shim.mjs');
const names = Object.keys(Blockly).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k) && k != 'default');
fs.writeFileSync(
    shim,
    `import { createRequire } from 'module';\nconst B = createRequire(${JSON.stringify(path.join(repo, 'package.json'))})('blockly/core');\nexport default B;\n` +
        names.map((k) => `export const ${k} = B.${k};`).join('\n') +
        '\n'
);

const server = await createServer({
    root: repo,
    configFile: path.join(repo, 'vite.config.ts'),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
    resolve: { alias: [{ find: /^blockly\/core$/, replacement: shim }] }
});
let failed = false;
try {
    const harness = await server.ssrLoadModule(path.join(here, 'harness.ts'));
    const script = path.resolve(process.argv[2] ?? path.join(here, 'validate.ts'));
    const mod = await server.ssrLoadModule(script);
    failed = (await mod.default(harness)) === false;
} finally {
    await server.close();
}
process.exit(failed ? 1 : 0);
