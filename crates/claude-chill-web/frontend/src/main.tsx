import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router';
import '@/index.css';
import App from '@/App';
import HomePage from '@/pages/home';
import SessionPage from '@/pages/session';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<App />}>
                    <Route element={<HomePage />}>
                        <Route index element={null} />
                        <Route path="session/:sessionId" element={<SessionPage />} />
                    </Route>
                </Route>
            </Routes>
        </BrowserRouter>
    </StrictMode>
);
