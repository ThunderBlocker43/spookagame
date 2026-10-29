import { isolateFromGame } from './domUtils.js';

// ==========================================
// MODE NAV (game mode picker, HTML outside the canvas)
// ==========================================
// Mirrors the leaderboard: a fixed panel to the right of the canvas on desktop,
// a 🎮 toggle + slide-in drawer from the right on phones. Modes come from
// MODE_LIST in config/modesConfig.js, so new ones only need a config entry.

const PANEL_WIDTH = 200;
const PANEL_GAP = 24;
const TOGGLE_SIZE = 44;

export class ModeNav {
    constructor(canvasElement, modes, { onSelect }) {
        this.canvasElement = canvasElement;
        this.onSelect = onSelect;

        this.root = document.createElement('nav');
        this.root.className = 'modes';
        this.root.setAttribute('aria-label', 'Game modes');
        this.root.innerHTML = `
            <button class="modes-toggle" type="button" aria-expanded="false" aria-controls="modes-panel" aria-label="Show game modes">🎮</button>
            <div class="modes-backdrop"></div>
            <section class="lb-panel modes-panel" id="modes-panel">
                <header class="lb-header">
                    <h2 class="lb-title">Modes</h2>
                    <button class="modes-close" type="button" aria-label="Close game modes">×</button>
                </header>
                <div class="modes-list"></div>
            </section>
        `;
        document.body.append(this.root);
        isolateFromGame(this.root);

        this.el = {
            toggle: this.root.querySelector('.modes-toggle'),
            backdrop: this.root.querySelector('.modes-backdrop'),
            close: this.root.querySelector('.modes-close'),
            list: this.root.querySelector('.modes-list')
        };

        this.el.list.append(...modes.map((mode) => {
            const button = document.createElement('button');
            button.className = 'modes-item';
            button.type = 'button';
            button.dataset.mode = mode.id;
            button.innerHTML = `
                <span class="modes-icon" aria-hidden="true"></span>
                <span class="modes-text">
                    <span class="modes-name"></span>
                    <span class="modes-description"></span>
                </span>
            `;
            button.querySelector('.modes-icon').textContent = mode.icon;
            button.querySelector('.modes-name').textContent = mode.name;
            button.querySelector('.modes-description').textContent = mode.description;
            button.addEventListener('click', () => {
                this.setDrawerOpen(false);
                this.onSelect(mode.id);
            });
            return button;
        }));

        this.el.toggle.addEventListener('click', () => this.setDrawerOpen(!this.root.classList.contains('modes--open')));
        this.el.close.addEventListener('click', () => this.setDrawerOpen(false));
        this.el.backdrop.addEventListener('click', () => this.setDrawerOpen(false));

        this.layout = this.layout.bind(this);
        window.addEventListener('resize', this.layout);
        new ResizeObserver(this.layout).observe(this.canvasElement);
        this.layout();
    }

    setActive(modeId) {
        this.el.list.querySelectorAll('.modes-item').forEach((item) => {
            item.setAttribute('aria-current', String(item.dataset.mode === modeId));
        });
    }

    layout() {
        const rect = this.canvasElement.getBoundingClientRect();
        const hasSideRoom = window.innerWidth - rect.right >= PANEL_WIDTH + PANEL_GAP * 2;

        this.root.classList.toggle('modes--side', hasSideRoom);
        this.root.classList.toggle('modes--drawer', !hasSideRoom);

        if (hasSideRoom) {
            this.setDrawerOpen(false);
            this.root.style.setProperty('--modes-left', `${rect.right + PANEL_GAP}px`);
            this.root.style.setProperty('--modes-top', `${rect.top}px`);
            this.root.style.setProperty('--modes-max-height', `${rect.height}px`);
        } else {
            // Same strip as the leaderboard toggle, just left of it
            const spaceBelow = window.innerHeight - rect.bottom;
            const toggleBottom = spaceBelow >= TOGGLE_SIZE + 8 ? (spaceBelow - TOGGLE_SIZE) / 2 : 8;
            this.root.style.setProperty('--modes-toggle-bottom', `${toggleBottom}px`);
        }
    }

    setDrawerOpen(open) {
        this.root.classList.toggle('modes--open', open);
        this.el.toggle.setAttribute('aria-expanded', String(open));
    }
}
