// ==========================================
// PLAYER PROFILE (cookie-backed identity)
// ==========================================
// The player id is a random UUID that acts as the player's private key on the
// leaderboard; the username is the public display name. Both live in cookies.

const COOKIE_PLAYER_ID = 'spooka_player_id';
const COOKIE_USERNAME = 'spooka_username';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // 400 days, the browser maximum

// Pre-leaderboard local high score keys (migrated once, then removed)
const LEGACY_SCORE_KEYS = ['spooka_high_score', 'suika_high_score'];

export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,14}[A-Za-z0-9]$/;

const NAME_ADJECTIVES = [
    'Hollow', 'Grim', 'Wicked', 'Rotten', 'Eerie', 'Ghastly', 'Cursed', 'Moldy',
    'Shadow', 'Spectral', 'Creepy', 'Gloomy', 'Haunted', 'Withered', 'Murky', 'Feral',
    'Undead', 'Howling', 'Ashen', 'Crooked', 'Pale', 'Sinister', 'Misty', 'Bony'
];

const NAME_CREATURES = [
    'Wraith', 'Ghoul', 'Banshee', 'Goblin', 'Specter', 'Vampire', 'Zombie', 'Witch',
    'Phantom', 'Gremlin', 'Werewolf', 'Mummy', 'Imp', 'Pumpkin', 'Raven', 'Bat',
    'Skeleton', 'Lich', 'Poltergeist', 'Gargoyle', 'Hag', 'Revenant', 'Spider', 'Crow'
];

const readCookie = (name) => {
    const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
};

const writeCookie = (name, value) => {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class PlayerProfile {
    constructor() {
        this.playerId = readCookie(COOKIE_PLAYER_ID);
        this.username = readCookie(COOKIE_USERNAME);

        if (!this.playerId) {
            this.playerId = crypto.randomUUID();
            writeCookie(COOKIE_PLAYER_ID, this.playerId);
        }
    }

    get hasUsername() {
        return Boolean(this.username);
    }

    setUsername(name) {
        this.username = name;
        writeCookie(COOKIE_USERNAME, name);
    }

    static normalizeUsername(name) {
        return (name || '').trim().replace(/\s+/g, ' ');
    }

    static isValidUsername(name) {
        return USERNAME_PATTERN.test(name);
    }

    // Spooky "Adjective Creature" name that always fits the 16 character limit
    static generateUsername() {
        let name;
        do {
            name = `${pick(NAME_ADJECTIVES)} ${pick(NAME_CREATURES)}`;
        } while (name.length > 16);
        return name;
    }

    loadLegacyHighScore() {
        try {
            const saved = LEGACY_SCORE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
            return saved ? parseInt(saved, 10) || 0 : 0;
        } catch {
            return 0;
        }
    }

    clearLegacyHighScore() {
        try {
            LEGACY_SCORE_KEYS.forEach((key) => localStorage.removeItem(key));
        } catch {
            // LocalStorage might be disabled or restricted
        }
    }
}
