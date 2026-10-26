import { createRoot } from 'react-dom/client';
import { App } from '../ui/App';
import { PanelConnection } from './connection';
import './styles.css';

const connection = new PanelConnection();
createRoot(document.getElementById('root')!).render(<App connection={connection} />);
