
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Import Global Styles
import './styles/palette.css';
import './styles/theme.css';
import './styles/glass.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
