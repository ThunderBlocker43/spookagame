import p5 from 'p5';
import { DESIGN_WIDTH, DESIGN_HEIGHT, MAX_PIXEL_DENSITY, THEME } from '../config/gameConfig.js';
import { isolateFromGame } from './domUtils.js';

// ==========================================
// OPPONENT VIEW (read-only live feed of the opponent's board)
// ==========================================
// A second, input-free p5 instance that steps and draws the mirror session.
// Sprites were already loaded by the main sketch and are shared via FRUIT_TIERS.

export class OpponentView {
    constructor(parentElement) {
        this.parent = parentElement;
        this.session = null;
        this.aimX = DESIGN_WIDTH / 2;
        isolateFromGame(this.parent);

        this.instance = new p5((p) => {
            let scale = 1;

            const fit = () => {
                const rect = this.parent.getBoundingClientRect();
                scale = Math.max(0.05, Math.min(rect.width / DESIGN_WIDTH, rect.height / DESIGN_HEIGHT));
                const w = Math.max(1, Math.floor(DESIGN_WIDTH * scale));
                const h = Math.max(1, Math.floor(DESIGN_HEIGHT * scale));
                if (p.width !== w || p.height !== h) {
                    p.resizeCanvas(w, h);
                }
            };

            p.setup = () => {
                p.createCanvas(1, 1).parent(this.parent);
                p.pixelDensity(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_DENSITY));
                p.frameRate(30);
                fit();
                new ResizeObserver(fit).observe(this.parent);
            };

            p.draw = () => {
                p.resetMatrix();
                p.scale(scale);
                p.background(THEME.canvasBackground);
                if (!this.session) return;

                this.session.update(Math.min(p.deltaTime, 1000 / 30), Math.min(p.deltaTime / 1000, 1 / 30));
                this.session.render(p, this.aimX);
            };
        });
    }

    setSession(session) {
        this.session = session;
        this.aimX = DESIGN_WIDTH / 2;
    }

    destroy() {
        this.instance.remove();
    }
}
