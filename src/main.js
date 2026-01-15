import './style.css';
import { AppState } from './state/AppState.js';
import { SettingsPanel } from './components/SettingsPanel.js';
import { Viewport3D } from './components/Viewport3D.js';

// Initialize application state
const appState = new AppState();

// Initialize UI components
const settingsPanel = new SettingsPanel(
  document.getElementById('settings-panel'),
  appState
);

const viewport3D = new Viewport3D(
  document.getElementById('viewport-3d'),
  appState
);

// Subscribe to state changes
appState.subscribe(() => {
  viewport3D.update();
});

// Initial render
settingsPanel.render();
viewport3D.init();

console.log('Pack3D-JS initialized');
