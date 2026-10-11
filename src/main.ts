import './app.css';
import App from './App.svelte';
import CoachPage from '$pages/CoachPage.svelte';
import { loadLibraryDefaults } from '$lib/library';
import { startStudentSession } from '$lib/team';
import { startInactivitySignOut, startProgressSync } from '$lib/homework';
import { loadSettings, settingsStore } from '$lib/settings';
import { get } from 'svelte/store';
import PrivacyPage from '$pages/PrivacyPage.svelte';

const target = document.getElementById('app');

// The server sends the same page for /coach and /privacy; show those pages there.
const page = window.location.pathname.replace(/\/+$/, '');
const coach = page.endsWith('/coach');
const privacy = page.endsWith('/privacy');
const app = coach
    ? new CoachPage({ target: target! })
    : privacy
      ? new PrivacyPage({ target: target! })
      : new App({ target: target! });

if (!coach && !privacy) {
    loadLibraryDefaults();
    startProgressSync();
    startStudentSession();
    loadSettings().then(() => startInactivitySignOut(() => get(settingsStore).signOutAfterMinutes));
}

export default app;
