import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './rtl.css';

console.log("main.tsx executing...");
createRoot(document.getElementById('root')!).render(
  <App />
);
