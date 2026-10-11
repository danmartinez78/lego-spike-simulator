import './app.css';
import App from './App.svelte';
import CoachPage from '$pages/CoachPage.svelte';
import { loadLibraryDefaults } from '$lib/library';
import { startStudentSession } from '$lib/team';
import { startProgressSync } from '$lib/homework';

const target = document.getElementById('app');

// The server sends the same page for /coach; show the coach tools there.
const coach = window.location.pathname.replace(/\/+$/, '').endsWith('/coach');
const app = coach ? new CoachPage({ target: target! }) : new App({ target: target! });

if (!coach) {
    loadLibraryDefaults();
    startProgressSync();
    startStudentSession();
}

export default app;
