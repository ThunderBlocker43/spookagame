import { DESIGN_WIDTH, CANVAS_HEIGHT } from '../config/gameConfig.js';
import { BATTLE_CONFIG } from '../config/battleConfig.js';
import { isolateFromGame } from './domUtils.js';

// ==========================================
// BATTLE PANEL (Drop Battle HTML: lobby, match card, invites, results)
// ==========================================
// Layout during a match:
// - Wide screens: opponent card (clock, name, score, live board) to the right
//   of the player's canvas, at OPPONENT_SCALE of its size.
// - Narrow screens: the card becomes a strip across the top with a small
//   picture-in-picture board; the player's canvas gets everything below it.
// Nothing ever overlaps the player's own canvas.

const ASPECT = DESIGN_WIDTH / CANVAS_HEIGHT;
const OPPONENT_SCALE = 0.7;
const EDGE = 12;
const GAP = 16;
const CARD_HEADER = 92;

const formatClock = (ms) => {
    const total = Math.ceil(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const createCell = (className, text) => {
    const cell = document.createElement('span');
    cell.className = className;
    cell.textContent = text;
    return cell;
};

const RESULT_TITLES = { win: 'You win!', lose: 'You lose', draw: "It's a draw" };

export class BattlePanel {
    constructor(appElement, canvasElement, handlers) {
        this.app = appElement;
        this.canvasElement = canvasElement;
        this.handlers = handlers;
        this.matchVisible = false;
        this.layoutMode = null;

        // ------------------------------------------
        // Lobby / result dialog
        // ------------------------------------------
        this.dialog = document.createElement('div');
        this.dialog.className = 'lb-dialog-backdrop bt-backdrop';
        this.dialog.hidden = true;
        this.dialog.innerHTML = `
            <section class="lb-dialog bt-dialog" aria-live="polite">
                <h2 class="lb-title bt-title"></h2>
                <p class="lb-dialog-text bt-text"></p>

                <div class="bt-view bt-view--menu">
                    <h3 class="bt-subtitle">Match length</h3>
                    <div class="lb-tabs bt-lengths" role="tablist" aria-label="Match length"></div>
                    <button class="bt-primary bt-create" type="button">Create invite link</button>
                    <h3 class="bt-subtitle">Challenge a friend</h3>
                    <ol class="lb-list bt-friends"></ol>
                    <p class="lb-status bt-friends-status"></p>
                    <button class="bt-secondary bt-join" type="button" hidden>Join the leaderboard</button>
                </div>

                <div class="bt-view bt-view--waiting">
                    <div class="bt-link-row">
                        <input class="lb-name-input bt-link" type="text" readonly aria-label="Invite link">
                        <button class="bt-secondary bt-copy" type="button">Copy</button>
                    </div>
                    <button class="bt-primary bt-share" type="button" hidden>Share link</button>
                </div>

                <div class="bt-view bt-view--result">
                    <div class="bt-scores">
                        <div class="bt-score-row bt-score-row--me"><span class="bt-score-name">You</span><span class="bt-score-value bt-my-score"></span></div>
                        <div class="bt-score-row"><span class="bt-score-name bt-opp-result-name"></span><span class="bt-score-value bt-opp-result-score"></span></div>
                    </div>
                    <p class="lb-dialog-text bt-rematch-text"></p>
                </div>

                <p class="lb-error bt-error" role="alert"></p>
                <div class="lb-actions bt-actions">
                    <button class="lb-skip bt-back" type="button"></button>
                    <button class="lb-save bt-action" type="button" hidden></button>
                </div>
            </section>
        `;

        // ------------------------------------------
        // Match card (opponent feed + clock)
        // ------------------------------------------
        this.card = document.createElement('section');
        this.card.className = 'bt-card';
        this.card.hidden = true;
        this.card.setAttribute('aria-label', 'Opponent');
        this.card.innerHTML = `
            <div class="bt-card-info">
                <div class="bt-clock-row">
                    <div class="bt-clock" aria-label="Time left">3:00</div>
                    <span class="bt-clock-label"></span>
                </div>
                <div class="bt-opp">
                    <span class="bt-opp-name"></span>
                    <span class="bt-opp-score">0</span>
                </div>
                <p class="bt-status" role="status"></p>
                <button class="bt-leave" type="button">Leave</button>
            </div>
            <div class="bt-opp-view"></div>
        `;

        // ------------------------------------------
        // Incoming challenge toast
        // ------------------------------------------
        this.toast = document.createElement('div');
        this.toast.className = 'bt-toast';
        this.toast.hidden = true;
        this.toast.setAttribute('role', 'alert');
        this.toast.innerHTML = `
            <span class="bt-toast-text"></span>
            <div class="bt-toast-actions">
                <button class="bt-secondary bt-decline" type="button">Decline</button>
                <button class="bt-primary bt-accept" type="button">Accept</button>
            </div>
        `;

        document.body.append(this.dialog, this.card, this.toast);
        [this.dialog, this.card, this.toast].forEach(isolateFromGame);

        const q = (root, selector) => root.querySelector(selector);
        this.el = {
            dialogBox: q(this.dialog, '.bt-dialog'),
            title: q(this.dialog, '.bt-title'),
            text: q(this.dialog, '.bt-text'),
            create: q(this.dialog, '.bt-create'),
            friends: q(this.dialog, '.bt-friends'),
            friendsStatus: q(this.dialog, '.bt-friends-status'),
            join: q(this.dialog, '.bt-join'),
            link: q(this.dialog, '.bt-link'),
            copy: q(this.dialog, '.bt-copy'),
            share: q(this.dialog, '.bt-share'),
            myScore: q(this.dialog, '.bt-my-score'),
            oppResultName: q(this.dialog, '.bt-opp-result-name'),
            oppResultScore: q(this.dialog, '.bt-opp-result-score'),
            rematchText: q(this.dialog, '.bt-rematch-text'),
            error: q(this.dialog, '.bt-error'),
            back: q(this.dialog, '.bt-back'),
            action: q(this.dialog, '.bt-action'),
            lengths: q(this.dialog, '.bt-lengths'),
            clock: q(this.card, '.bt-clock'),
            clockLabel: q(this.card, '.bt-clock-label'),
            oppName: q(this.card, '.bt-opp-name'),
            oppScore: q(this.card, '.bt-opp-score'),
            status: q(this.card, '.bt-status'),
            leave: q(this.card, '.bt-leave'),
            oppView: q(this.card, '.bt-opp-view'),
            toastText: q(this.toast, '.bt-toast-text'),
            accept: q(this.toast, '.bt-accept'),
            decline: q(this.toast, '.bt-decline')
        };

        // Buttons whose meaning changes per view call the current callback
        this.backHandler = null;
        this.actionHandler = null;
        this.el.back.addEventListener('click', () => this.backHandler?.());
        this.el.action.addEventListener('click', () => this.actionHandler?.());

        this.el.lengths.append(...BATTLE_CONFIG.matchLengths.map((length) => {
            const tab = document.createElement('button');
            tab.className = 'lb-tab';
            tab.type = 'button';
            tab.setAttribute('role', 'tab');
            tab.dataset.length = length.id;
            tab.textContent = length.label;
            tab.addEventListener('click', () => this.handlers.onSelectLength(length.id));
            return tab;
        }));

        this.el.create.addEventListener('click', () => this.handlers.onCreateLink());
        this.el.join.addEventListener('click', () => this.handlers.onJoinLeaderboard());
        this.el.copy.addEventListener('click', () => this.copyLink());
        this.el.share.addEventListener('click', () => {
            navigator.share({ title: 'Spooka Drop Battle', text: 'Battle me in Spooka!', url: this.el.link.value }).catch(() => {});
        });
        this.el.leave.addEventListener('click', () => this.onLeaveClick());
        this.el.accept.addEventListener('click', () => this.handlers.onAcceptInvite(this.toast.dataset.code));
        this.el.decline.addEventListener('click', () => this.handlers.onDeclineInvite(this.toast.dataset.code));

        this.layout = this.layout.bind(this);
        window.addEventListener('resize', this.layout);
        new ResizeObserver(() => this.positionCard()).observe(this.canvasElement);
    }

    get opponentViewElement() {
        return this.el.oppView;
    }

    // ------------------------------------------
    // Dialog views
    // ------------------------------------------
    openDialog(view, { title, text = '', back = null, action = null, wide = false }) {
        this.dialog.dataset.view = view;
        this.el.dialogBox.classList.toggle('bt-dialog--wide', wide);
        this.el.title.textContent = title;
        this.el.text.textContent = text;
        this.el.error.textContent = '';

        this.el.back.hidden = !back;
        this.el.back.textContent = back?.label || '';
        this.backHandler = back?.onClick || null;

        this.el.action.hidden = !action;
        this.el.action.disabled = false;
        this.el.action.textContent = action?.label || '';
        this.actionHandler = action?.onClick || null;

        this.dialog.hidden = false;
    }

    closeDialog() {
        this.dialog.hidden = true;
    }

    get isMenuOpen() {
        return !this.dialog.hidden && this.dialog.dataset.view === 'menu';
    }

    setError(text) {
        this.el.error.textContent = text;
    }

    setBusy(busy) {
        this.el.create.disabled = busy;
        this.el.friends.querySelectorAll('button').forEach((button) => {
            button.disabled = busy;
        });
    }

    showMenu({ rules, matchLength, onBack }) {
        this.openDialog('menu', {
            title: 'Drop Battle',
            text: rules,
            back: { label: 'Back to Classic', onClick: onBack },
            wide: true
        });
        this.setMatchLength(matchLength, rules);
        this.setBusy(false);
    }

    // Highlight the picked length; the rules text describes it
    setMatchLength(lengthId, rules) {
        this.el.lengths.querySelectorAll('.lb-tab').forEach((tab) => {
            tab.setAttribute('aria-selected', String(tab.dataset.length === lengthId));
        });
        this.el.text.textContent = rules;
    }

    // entries: rows from get_friends_leaderboard; message replaces the list
    renderFriends(entries, { message = '', showJoin = false } = {}) {
        const friends = entries.filter((entry) => !entry.is_me);
        this.el.friends.replaceChildren(
            ...friends.map((entry) => {
                const item = document.createElement('li');
                item.className = 'lb-entry bt-friend';
                const name = createCell('lb-name', entry.username);
                if (entry.online) {
                    name.classList.add('lb-name--online');
                }
                const challenge = document.createElement('button');
                challenge.className = 'bt-secondary bt-challenge';
                challenge.type = 'button';
                challenge.textContent = 'Challenge';
                challenge.addEventListener('click', () => this.handlers.onChallenge(entry.username));
                item.append(name, createCell('bt-online', entry.online ? 'online' : ''), challenge);
                return item;
            })
        );
        this.el.friendsStatus.textContent = message || (friends.length ? '' : 'No friends yet. Add them by name on the leaderboard’s Friends tab.');
        this.el.join.hidden = !showJoin;
    }

    showWaiting({ link, friendName, onCancel }) {
        this.openDialog('waiting', {
            title: friendName ? `Waiting for ${friendName}` : 'Waiting for an opponent',
            text: friendName
                ? `${friendName} gets your challenge within a few seconds while the game is open. You can also send them this link.`
                : 'Send this link to a friend. The match starts as soon as they open it. The link works for 10 minutes.',
            back: { label: 'Cancel', onClick: onCancel }
        });
        this.el.link.value = link;
        this.el.copy.textContent = 'Copy';
        this.el.share.hidden = typeof navigator.share !== 'function';
    }

    async copyLink() {
        try {
            await navigator.clipboard.writeText(this.el.link.value);
            this.el.copy.textContent = 'Copied!';
        } catch {
            this.el.link.select();
        }
    }

    showMessage({ title, text, back = null, action = null }) {
        this.openDialog('message', { title, text, back, action });
    }

    showResult(result, opponentName, { onRematch, onBack }) {
        this.openDialog('result', {
            title: RESULT_TITLES[result.outcome],
            text: result.text,
            back: { label: 'Back to Classic', onClick: onBack },
            action: { label: 'Rematch', onClick: onRematch }
        });
        this.dialog.dataset.outcome = result.outcome;
        this.el.myScore.textContent = result.myScore;
        this.el.oppResultName.textContent = opponentName;
        this.el.oppResultScore.textContent = result.opponentScore;
        this.el.rematchText.textContent = '';
    }

    // Result view: rematch state (text + what the action button does)
    setRematch(text, action = null) {
        this.el.rematchText.textContent = text;
        this.el.action.hidden = !action;
        this.el.action.disabled = false;
        if (action) {
            this.el.action.textContent = action.label;
            this.actionHandler = action.onClick;
        }
    }

    setActionBusy(busy) {
        this.el.action.disabled = busy;
    }

    // ------------------------------------------
    // Match card
    // ------------------------------------------
    showMatch(opponentName) {
        this.matchVisible = true;
        this.card.hidden = false;
        document.body.classList.add('bt-match');
        this.handlers.onMatchVisibility?.(true);
        this.setOpponent(opponentName);
        this.setOpponentScore(0);
        this.setStatus('');
        this.resetLeave();
        this.layout();
    }

    hideMatch() {
        this.matchVisible = false;
        this.card.hidden = true;
        document.body.classList.remove('bt-match');
        this.handlers.onMatchVisibility?.(false);
        this.layout();
    }

    setOpponent(name) {
        this.el.oppName.textContent = name || 'Waiting…';
    }

    setOpponentScore(score) {
        this.el.oppScore.textContent = score;
    }

    // Timed: time left (turns orange in the last 30 s). Endless: time survived.
    setClock(ms, { endless = false } = {}) {
        this.el.clock.textContent = formatClock(ms);
        this.el.clock.setAttribute('aria-label', endless ? 'Time played' : 'Time left');
        this.el.clockLabel.textContent = endless ? 'Endless' : '';
        this.el.clock.classList.toggle('bt-clock--low', !endless && ms > 0 && ms <= 30000);
    }

    setStatus(text) {
        this.el.status.textContent = text;
    }

    // Leaving a running match is a forfeit: ask once by turning the button into a confirm
    onLeaveClick() {
        if (!this.handlers.isMatchRunning() || this.el.leave.dataset.confirm) {
            this.resetLeave();
            this.handlers.onLeave();
            return;
        }
        this.el.leave.dataset.confirm = 'true';
        this.el.leave.textContent = 'Forfeit?';
        clearTimeout(this.leaveTimer);
        this.leaveTimer = setTimeout(() => this.resetLeave(), 3000);
    }

    resetLeave() {
        clearTimeout(this.leaveTimer);
        delete this.el.leave.dataset.confirm;
        this.el.leave.textContent = 'Leave';
    }

    // ------------------------------------------
    // Incoming challenge toast
    // ------------------------------------------
    showInvite(code, hostName) {
        this.toast.dataset.code = code;
        this.el.toastText.textContent = `⚔️ ${hostName} challenges you to Drop Battle!`;
        this.el.accept.disabled = false;
        this.el.decline.disabled = false;
        this.toast.hidden = false;
    }

    hideInvite() {
        this.toast.hidden = true;
        delete this.toast.dataset.code;
    }

    get shownInviteCode() {
        return this.toast.hidden ? null : this.toast.dataset.code;
    }

    // ------------------------------------------
    // Layout
    // ------------------------------------------
    // Reserves room for the card by padding #app, then lets the game re-fit its canvas
    layout() {
        if (!this.matchVisible) {
            if (this.layoutMode) {
                this.layoutMode = null;
                this.app.style.removeProperty('padding');
                this.handlers.onLayout();
            }
            return;
        }

        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Wide: own board + 70% opponent board side by side
        const wideOwnH = Math.min(vh - EDGE * 2, (vw - EDGE * 2 - GAP) / (ASPECT * (1 + OPPONENT_SCALE)));
        // Narrow: opponent strip on top
        const strip = Math.round(Math.min(150, Math.max(104, vh * 0.2)));
        const narrowOwnH = Math.min(vh - strip - EDGE * 2 - GAP / 2, (vw - EDGE * 2) / ASPECT);
        const wide = wideOwnH * OPPONENT_SCALE >= CARD_HEADER * 2 && wideOwnH >= narrowOwnH;

        this.layoutMode = wide ? 'wide' : 'narrow';
        this.card.classList.toggle('bt-card--wide', wide);
        this.card.classList.toggle('bt-card--narrow', !wide);

        if (wide) {
            const oppW = Math.floor(wideOwnH * ASPECT * OPPONENT_SCALE);
            this.card.style.setProperty('--bt-opp-w', `${oppW}px`);
            this.card.style.setProperty('--bt-opp-h', `${Math.floor(Math.min(oppW / ASPECT, wideOwnH - CARD_HEADER))}px`);
            this.app.style.padding = `${EDGE}px ${oppW + GAP + EDGE}px ${EDGE}px ${EDGE}px`;
        } else {
            const oppH = strip - 16;
            this.card.style.setProperty('--bt-strip', `${strip}px`);
            this.card.style.setProperty('--bt-opp-w', `${Math.floor(oppH * ASPECT)}px`);
            this.card.style.setProperty('--bt-opp-h', `${oppH}px`);
            this.app.style.padding = `${strip + EDGE + GAP / 2}px ${EDGE}px ${EDGE}px`;
        }

        this.handlers.onLayout();
        this.positionCard();
    }

    positionCard() {
        if (!this.matchVisible) return;
        const rect = this.canvasElement.getBoundingClientRect();
        if (this.layoutMode === 'wide') {
            this.card.style.left = `${rect.right + GAP}px`;
            this.card.style.top = `${rect.top}px`;
            this.card.style.width = '';
        } else {
            const width = Math.max(rect.width, Math.min(window.innerWidth - EDGE * 2, 480));
            this.card.style.left = `${(window.innerWidth - width) / 2}px`;
            this.card.style.top = `${EDGE}px`;
            this.card.style.width = `${width}px`;
        }
    }
}
