import './styles.css';
import { SessionManager } from './session-manager.js';

// Initialize session manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.sessionManager = new SessionManager();
});
