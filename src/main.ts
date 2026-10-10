import './app.css';
import App from './App.svelte';
import { loadLibraryDefaults } from '$lib/library';

const target = document.getElementById('app');
const app = new App({ target: target! });

loadLibraryDefaults();

export default app;
