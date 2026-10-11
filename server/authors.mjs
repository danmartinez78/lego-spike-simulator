// Which coach's AI assistant added a robot or field to the library, kept in
// LIBRARY_DIR/.assistant-files.json as { "scenes/<file>": { author, saved } }.
// Robots and fields have no room for this in the files themselves. An
// assistant may only replace or delete files listed here under its coach;
// when a coach replaces, renames or deletes one on the coach page, the
// listing follows.

import fsp from 'node:fs/promises';
import path from 'node:path';

export function createAuthors(libraryDir) {
    const file = path.join(libraryDir, '.assistant-files.json');

    async function load() {
        try {
            return JSON.parse(await fsp.readFile(file, 'utf8'));
        } catch {
            return {};
        }
    }

    async function store(all) {
        await fsp.writeFile(file + '.tmp', JSON.stringify(all, null, 2));
        await fsp.rename(file + '.tmp', file);
    }

    return {
        load,
        async get(kind, name) {
            return (await load())[`${kind}/${name}`]?.author;
        },
        async set(kind, name, author) {
            const all = await load();
            all[`${kind}/${name}`] = { author, saved: new Date().toISOString() };
            await store(all);
        },
        async remove(kind, name) {
            const all = await load();
            if (!all[`${kind}/${name}`]) return;
            delete all[`${kind}/${name}`];
            await store(all);
        },
        async rename(kind, from, to) {
            const all = await load();
            if (!all[`${kind}/${from}`]) return;
            all[`${kind}/${to}`] = all[`${kind}/${from}`];
            delete all[`${kind}/${from}`];
            await store(all);
        }
    };
}
