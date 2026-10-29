// ==========================================
// LEADERBOARD PANEL (HTML, outside the p5 canvas)
// ==========================================
// Desktop: fixed panel to the left of the canvas. When there is no room on the
// left (phones), it collapses into a toggle button + slide-in drawer.

const PANEL_WIDTH = 230;
const PANEL_GAP = 24;
const TOGGLE_SIZE = 44;

// p5 listens for these on window; stop them so the game ignores panel/dialog input
const ISOLATED_EVENTS = [
    'pointerdown', 'pointerup', 'pointercancel', 'pointermove',
    'click', 'dblclick', 'wheel', 'keydown', 'keyup', 'keypress'
];

const isolateFromGame = (element) => {
    ISOLATED_EVENTS.forEach((type) => element.addEventListener(type, (e) => e.stopPropagation()));
};

export class LeaderboardPanel {
    constructor(canvasElement, handlers) {
        this.canvasElement = canvasElement;
        this.handlers = handlers;

        this.root = document.createElement('aside');
        this.root.className = 'lb';
        this.root.innerHTML = `
            <button class="lb-toggle" type="button" aria-expanded="false" aria-controls="lb-panel" aria-label="Show leaderboard">🏆</button>
            <div class="lb-backdrop"></div>
            <section class="lb-panel" id="lb-panel" aria-label="Leaderboard">
                <header class="lb-header">
                    <h2 class="lb-title">Leaderboard</h2>
                    <button class="lb-close" type="button" aria-label="Close leaderboard">×</button>
                </header>
                <ol class="lb-list"></ol>
                <p class="lb-status"></p>
                <div class="lb-footer">
                    <span class="lb-player"></span>
                    <button class="lb-join" type="button" hidden>Join</button>
                </div>
            </section>
        `;

        this.dialog = document.createElement('div');
        this.dialog.className = 'lb-dialog-backdrop';
        this.dialog.hidden = true;
        this.dialog.innerHTML = `
            <form class="lb-dialog" novalidate>
                <h2 class="lb-title lb-dialog-title"></h2>
                <p class="lb-dialog-text"></p>
                <div class="lb-name-row">
                    <input class="lb-name-input" type="text" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Username">
                    <button class="lb-reroll" type="button" aria-label="Suggest another name" title="Suggest another name">🎲</button>
                </div>
                <p class="lb-error" role="alert"></p>
                <div class="lb-actions">
                    <button class="lb-skip" type="button">Not now</button>
                    <button class="lb-save" type="submit">Save</button>
                </div>
            </form>
        `;

        document.body.append(this.root, this.dialog);
        isolateFromGame(this.root);
        isolateFromGame(this.dialog);

        this.el = {
            toggle: this.root.querySelector('.lb-toggle'),
            backdrop: this.root.querySelector('.lb-backdrop'),
            close: this.root.querySelector('.lb-close'),
            list: this.root.querySelector('.lb-list'),
            status: this.root.querySelector('.lb-status'),
            player: this.root.querySelector('.lb-player'),
            join: this.root.querySelector('.lb-join'),
            form: this.dialog.querySelector('.lb-dialog'),
            dialogTitle: this.dialog.querySelector('.lb-dialog-title'),
            dialogText: this.dialog.querySelector('.lb-dialog-text'),
            input: this.dialog.querySelector('.lb-name-input'),
            reroll: this.dialog.querySelector('.lb-reroll'),
            error: this.dialog.querySelector('.lb-error'),
            skip: this.dialog.querySelector('.lb-skip'),
            save: this.dialog.querySelector('.lb-save')
        };

        this.el.toggle.addEventListener('click', () => this.setDrawerOpen(!this.root.classList.contains('lb--open')));
        this.el.close.addEventListener('click', () => this.setDrawerOpen(false));
        this.el.backdrop.addEventListener('click', () => this.setDrawerOpen(false));
        this.el.join.addEventListener('click', () => this.handlers.onJoin());
        this.el.reroll.addEventListener('click', () => {
            this.el.input.value = this.handlers.suggestName();
            this.el.error.textContent = '';
        });
        this.el.skip.addEventListener('click', () => {
            this.closeNameDialog();
            this.handlers.onSkip();
        });
        this.el.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitName();
        });

        // Keep the panel glued to the canvas' left edge as the window resizes
        this.layout = this.layout.bind(this);
        window.addEventListener('resize', this.layout);
        new ResizeObserver(this.layout).observe(this.canvasElement);
        this.layout();
    }

    layout() {
        const rect = this.canvasElement.getBoundingClientRect();
        const hasSideRoom = rect.left >= PANEL_WIDTH + PANEL_GAP * 2;

        this.root.classList.toggle('lb--side', hasSideRoom);
        this.root.classList.toggle('lb--drawer', !hasSideRoom);

        if (hasSideRoom) {
            this.setDrawerOpen(false);
            this.root.style.setProperty('--lb-left', `${rect.left - PANEL_GAP - PANEL_WIDTH}px`);
            this.root.style.setProperty('--lb-top', `${rect.top}px`);
            this.root.style.setProperty('--lb-max-height', `${rect.height}px`);
        } else {
            // Prefer the empty strip below the canvas; fall back to the bottom-right corner
            const spaceBelow = window.innerHeight - rect.bottom;
            const toggleBottom = spaceBelow >= TOGGLE_SIZE + 8 ? (spaceBelow - TOGGLE_SIZE) / 2 : 8;
            this.root.style.setProperty('--lb-toggle-bottom', `${toggleBottom}px`);
        }
    }

    setDrawerOpen(open) {
        this.root.classList.toggle('lb--open', open);
        this.el.toggle.setAttribute('aria-expanded', String(open));
    }

    renderScores(entries, currentUsername) {
        this.el.list.replaceChildren(
            ...entries.map((entry, i) => {
                const item = document.createElement('li');
                item.className = 'lb-entry';
                if (currentUsername && entry.username.toLowerCase() === currentUsername.toLowerCase()) {
                    item.classList.add('lb-entry--me');
                }

                const rank = document.createElement('span');
                rank.className = 'lb-rank';
                rank.textContent = `${i + 1}`;

                const name = document.createElement('span');
                name.className = 'lb-name';
                name.textContent = entry.username;

                const score = document.createElement('span');
                score.className = 'lb-score';
                score.textContent = entry.score;

                item.append(rank, name, score);
                return item;
            })
        );
        this.setStatus(entries.length ? '' : 'No scores yet. Be the first!');
    }

    setStatus(text) {
        this.el.status.textContent = text;
    }

    setPlayer(username, canJoin) {
        this.el.player.textContent = username ? `Playing as ${username}` : '';
        this.el.join.hidden = !canJoin;
    }

    openNameDialog({ title, text, suggestedName }) {
        this.el.dialogTitle.textContent = title;
        this.el.dialogText.textContent = text;
        this.el.input.value = suggestedName;
        this.el.error.textContent = '';
        this.el.save.disabled = false;
        this.dialog.hidden = false;

        // Skip auto-focus on touch screens so the keyboard doesn't cover the prompt
        if (window.matchMedia('(pointer: fine)').matches) {
            this.el.input.select();
        }
    }

    closeNameDialog() {
        this.dialog.hidden = true;
    }

    async submitName() {
        this.el.save.disabled = true;
        this.el.error.textContent = '';

        const error = await this.handlers.onSubmitName(this.el.input.value);

        this.el.save.disabled = false;
        if (error) {
            this.el.error.textContent = error;
        } else {
            this.closeNameDialog();
        }
    }
}
