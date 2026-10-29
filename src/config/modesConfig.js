// ==========================================
// GAME MODES (mode picker on the right of the canvas)
// ==========================================
// Add a mode here and handle its id in main.js (selectMode).

export const MODES = {
    CLASSIC: 'classic',
    BATTLE: 'battle'
};

export const MODE_LIST = [
    { id: MODES.CLASSIC, icon: '🎃', name: 'Classic', description: 'Stack, merge, chase the high score.' },
    { id: MODES.BATTLE, icon: '⚔️', name: 'Drop Battle', description: 'Live 1v1 against a friend.' }
];
