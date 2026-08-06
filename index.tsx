import React from 'react';
import { createRoot } from 'react-dom/client';
import './src/index.css';
import App from './src/App';
import { watchForAppUpdates } from './src/utils/swUpdate';
import { preventPinchZoom } from './src/utils/preventPinchZoom';

watchForAppUpdates();
preventPinchZoom();

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}
