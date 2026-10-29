// ==========================================
// LEADERBOARD PANEL (HTML, outside the p5 canvas)
// ==========================================
// Desktop: fixed panel to the left of the canvas. When there is no room on the
// left (phones), it collapses into a toggle button + slide-in drawer.

import { isolateFromGame } from './domUtils.js';

const PANEL_WIDTH = 230;
const PANEL_GAP = 24;
const TOGGLE_SIZE = 44;

const createCell = (className, text) => {
    const cell = document.createElement('span');
    cell.className = className;
    cell.textContent = text;
    return cell;
};

const formatDate = (isoString) => new Date(isoString).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
});

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
                <div class="lb-tabs" role="tablist" aria-label="Leaderboard views"></div>
                <form class="lb-friend-form" novalidate hidden>
                    <input class="lb-friend-input" type="text" maxlength="16" autocomplete="off" spellcheck="false" placeholder="Friend's name" aria-label="Friend's name">
                    <button class="lb-friend-add" type="submit">Add</button>
                </form>
                <p class="lb-error lb-friend-error" role="alert"></p>
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
            tabs: this.root.querySelector('.lb-tabs'),
            friendForm: this.root.querySelector('.lb-friend-form'),
            friendInput: this.root.querySelector('.lb-friend-input'),
            friendAdd: this.root.querySelector('.lb-friend-add'),
            friendError: this.root.querySelector('.lb-friend-error'),
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

        this.el.tabs.append(...this.handlers.boards.map((board) => {
            const tab = document.createElement('button');
            tab.className = 'lb-tab';
            tab.type = 'button';
            tab.setAttribute('role', 'tab');
            tab.dataset.board = board.id;
            tab.textContent = board.label;
            tab.addEventListener('click', () => this.handlers.onSelectBoard(board.id));
            return tab;
        }));

        this.el.toggle.addEventListener('click', () => this.setDrawerOpen(!this.root.classList.contains('lb--open')));
        this.el.close.addEventListener('click', () => this.setDrawerOpen(false));
        this.el.backdrop.addEventListener('click', () => this.setDrawerOpen(false));
        this.el.join.addEventListener('click', () => this.handlers.onJoin());
        this.el.friendForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitFriend();
        });
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

    // Highlight the active tab; the friend form only shows on Friends for named players
    showBoard(board, hasUsername) {
        this.el.tabs.querySelectorAll('.lb-tab').forEach((tab) => {
            tab.setAttribute('aria-selected', String(tab.dataset.board === board));
        });

        const showFriendForm = board === 'friends' && hasUsername;
        if (this.el.friendForm.hidden === showFriendForm) {
            this.el.friendForm.hidden = !showFriendForm;
            this.el.friendError.textContent = '';
        }
    }

    renderScores(entries, currentUsername, emptyText = 'No scores yet. Be the first!') {
        this.el.list.replaceChildren(
            ...entries.map((entry, i) => {
                const item = document.createElement('li');
                item.className = 'lb-entry';
                if (currentUsername && entry.username.toLowerCase() === currentUsername.toLowerCase()) {
                    item.classList.add('lb-entry--me');
                }
                item.append(
                    createCell('lb-rank', `${i + 1}`),
                    createCell('lb-name', entry.username),
                    createCell('lb-score', entry.score)
                );
                return item;
            })
        );
        this.setStatus(entries.length ? '' : emptyText);
    }

    renderFriends(entries) {
        this.el.list.replaceChildren(
            ...entries.map((entry, i) => {
                const item = document.createElement('li');
                item.className = 'lb-entry lb-entry--friend';
                if (entry.is_me) {
                    item.classList.add('lb-entry--me');
                }
                const name = createCell('lb-name', entry.username);
                if (entry.online && !entry.is_me) {
                    name.classList.add('lb-name--online');
                    name.title = 'Online now';
                }
                item.append(
                    createCell('lb-rank', `${i + 1}`),
                    name,
                    createCell('lb-score', entry.score)
                );

                // Drop Battle challenge
                if (!entry.is_me) {
                    const challenge = document.createElement('button');
                    challenge.className = 'lb-challenge';
                    challenge.type = 'button';
                    challenge.textContent = '⚔️';
                    challenge.title = `Challenge ${entry.username} to Drop Battle`;
                    challenge.setAttribute('aria-label', `Challenge ${entry.username} to Drop Battle`);
                    challenge.addEventListener('click', () => this.handlers.onChallengeFriend(entry.username));
                    item.append(challenge);
                } else {
                    item.append(createCell('lb-remove-spacer', ''));
                }

                if (!entry.is_me) {
                    const remove = document.createElement('button');
                    remove.className = 'lb-remove';
                    remove.type = 'button';
                    remove.textContent = '×';
                    remove.title = `Remove ${entry.username}`;
                    remove.setAttribute('aria-label', `Remove ${entry.username}`);
                    remove.addEventListener('click', () => {
                        remove.disabled = true;
                        this.handlers.onRemoveFriend(entry.username);
                    });
                    item.append(remove);
                } else {
                    item.append(createCell('lb-remove-spacer', ''));
                }
                return item;
            })
        );
        this.setStatus(entries.length > 1 ? '' : 'Add friends by their exact name.');
    }

    renderHistory(entries) {
        this.el.list.replaceChildren(
            ...entries.map((entry) => {
                const item = document.createElement('li');
                item.className = 'lb-entry lb-entry--history';
                const date = createCell('lb-name', formatDate(entry.achieved_at));
                // Season label stays hidden until the seasonal board is switched on
                if (this.handlers.showSeason) {
                    date.append(createCell('lb-season', entry.season_name || entry.season));
                }
                item.append(date, createCell('lb-score', entry.score));
                return item;
            })
        );
        this.setStatus(entries.length ? '' : 'No high scores yet. Finish a game!');
    }

    get statusText() {
        return this.el.status.textContent;
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

    async submitFriend() {
        this.el.friendAdd.disabled = true;
        this.el.friendError.textContent = '';

        const error = await this.handlers.onAddFriend(this.el.friendInput.value);

        this.el.friendAdd.disabled = false;
        if (error) {
            this.el.friendError.textContent = error;
        } else {
            this.el.friendInput.value = '';
        }
    }
}
