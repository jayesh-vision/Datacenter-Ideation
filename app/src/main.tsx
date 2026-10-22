import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../design-system/nst-design-system.css';
import '../design-system/components.css';
import './styles/app.css';
import './styles/base.css';
import App from './App';
import { installBigScreen } from './lib/bigscreen';
installBigScreen();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
