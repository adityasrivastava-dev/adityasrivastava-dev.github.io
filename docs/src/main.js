// ── MAIN — entry point only. Import Application, create instance, call start. ─
import * as THREE from 'three';
// Expose as global — all src/ files reference window.THREE directly (no bundler)
window.THREE = THREE;

import Application from './core/Application.js';

const canvas = document.querySelector('canvas.webgl');
const app    = new Application(canvas);
app.start();

// Expose for mobile joystick and external tooling (devtools, tests)
window._appInstance = app;
