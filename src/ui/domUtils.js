// ==========================================
// DOM HELPERS shared by the HTML overlays
// ==========================================

// p5 listens for these on window; stop them so the game ignores panel/dialog input
const ISOLATED_EVENTS = [
    'pointerdown', 'pointerup', 'pointercancel', 'pointermove',
    'click', 'dblclick', 'wheel', 'keydown', 'keyup', 'keypress'
];

export const isolateFromGame = (element) => {
    ISOLATED_EVENTS.forEach((type) => element.addEventListener(type, (e) => e.stopPropagation()));
};
