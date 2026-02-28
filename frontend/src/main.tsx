import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WalletConnectProvider } from '@btc-vision/walletconnect';
import App from './App';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <WalletConnectProvider theme="dark">
            <App />
        </WalletConnectProvider>
    </StrictMode>,
);
