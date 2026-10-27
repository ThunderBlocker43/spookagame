import Matter from 'matter-js';
import decomp from 'poly-decomp';

// Register poly-decomp with Matter.js for concave polygon decomposition
Matter.Common.setDecomp(decomp);

/**
 * Utility to extract clean, smooth, rollable outer collision contours from SVG and sprite images.
 * Designed specifically for physics-driven Suika merge games:
 * - Accurately traces the outer silhouette/envelope of the fruit
 * - Ignores internal decorative paths, eyes, cutouts, and texture lines
 * - Produces smooth, non-jagged polygons that roll and stack naturally
 * - Runs once asynchronously during startup / preload (0 per-frame overhead)
 */
export class SvgHitboxParser {
    /**
     * Extracts an outer contour polygon directly from a rendered sprite image (p5.Image or HTMLCanvasElement).
     * @param {Object} p5Image - The loaded p5.Image or Image object
     * @param {Object} options - Configuration options (samples, smoothingPasses, alphaThreshold)
     * @returns {Array<{x: number, y: number}>} Normalized vertices in [-0.5, 0.5] coordinate space
     */
    static generateHitboxFromImage(p5Image, options = {}) {
        if (!p5Image) return null;

        const numSamples = options.samples || 28;
        const alphaThreshold = options.alphaThreshold || 25;
        const smoothingPasses = options.smoothingPasses !== undefined ? options.smoothingPasses : 2;
        const size = 256;

        try {
            // Create offscreen canvas to sample the rasterized sprite
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return null;

            // Draw image centered and scaled to fill canvas
            const imgElement = p5Image.elt || (p5Image.canvas ? p5Image.canvas : p5Image);
            ctx.clearRect(0, 0, size, size);
            ctx.drawImage(imgElement, 0, 0, size, size);

            const imgData = ctx.getImageData(0, 0, size, size);
            const pixels = imgData.data;

            const cx = size / 2;
            const cy = size / 2;
            const maxRadius = size * 0.49;
            const rawVertices = [];

            // Cast radial rays from outer boundary inward to locate the external silhouette
            for (let i = 0; i < numSamples; i++) {
                const angle = (i / numSamples) * Math.PI * 2;
                const cosA = Math.cos(angle);
                const sinA = Math.sin(angle);
                let hitDist = null;

                // Step inward from maxRadius to center to find the outermost opaque pixel
                for (let r = maxRadius; r >= 4; r -= 1) {
                    const px = Math.round(cx + r * cosA);
                    const py = Math.round(cy + r * sinA);

                    if (px >= 0 && px < size && py >= 0 && py < size) {
                        const alpha = pixels[(py * size + px) * 4 + 3];
                        if (alpha > alphaThreshold) {
                            hitDist = r;
                            break;
                        }
                    }
                }

                // If ray did not find any pixel, fallback to default circular radius
                if (hitDist === null) {
                    hitDist = size * 0.44;
                }

                // Normalize coordinate to [-0.5, 0.5] space relative to center
                rawVertices.push({
                    x: (hitDist * cosA) / size,
                    y: (hitDist * sinA) / size
                });
            }

            // Apply smoothing filter to ensure stable rolling without jagged snags
            return this.smoothVertices(rawVertices, smoothingPasses);
        } catch (err) {
            console.warn('[SvgHitboxParser] Error extracting contour from image:', err);
            return null;
        }
    }

    /**
     * Applies moving-average smoothing around the circular vertex loop.
     * @param {Array<{x: number, y: number}>} vertices
     * @param {number} passes
     * @returns {Array<{x: number, y: number}>}
     */
    static smoothVertices(vertices, passes = 2) {
        if (!vertices || vertices.length < 3 || passes <= 0) return vertices;
        let current = vertices.slice();
        const len = current.length;

        for (let p = 0; p < passes; p++) {
            const next = [];
            for (let i = 0; i < len; i++) {
                const prev = current[(i - 1 + len) % len];
                const curr = current[i];
                const nxt = current[(i + 1) % len];
                next.push({
                    x: 0.25 * prev.x + 0.5 * curr.x + 0.25 * nxt.x,
                    y: 0.25 * prev.y + 0.5 * curr.y + 0.25 * nxt.y
                });
            }
            current = next;
        }
        return current;
    }

    /**
     * Fallback / Alternative: Parses SVG string path elements and extracts the outer contour.
     * @param {string} svgUrl
     * @param {Object} options
     * @returns {Promise<Array<{x: number, y: number}>>}
     */
    static async loadAndParseSvg(svgUrl, options = {}) {
        try {
            const response = await fetch(svgUrl);
            if (!response.ok) return null;
            const svgText = await response.text();
            return this.parseSvgString(svgText, options);
        } catch (err) {
            console.warn(`[SvgHitboxParser] Failed to load SVG from ${svgUrl}:`, err);
            return null;
        }
    }

    /**
     * Extracts outer path vertices from SVG XML.
     * @param {string} svgText
     * @param {Object} options
     * @returns {Array<{x: number, y: number}>}
     */
    static parseSvgString(svgText, options = {}) {
        if (typeof document === 'undefined') return null;

        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (!svgEl) return null;

        let vbX = 0, vbY = 0, vbWidth = 256, vbHeight = 256;
        const viewBoxAttr = svgEl.getAttribute('viewBox');
        if (viewBoxAttr) {
            const parts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
            if (parts.length === 4 && !parts.some(isNaN)) {
                [vbX, vbY, vbWidth, vbHeight] = parts;
            }
        }

        const centerX = vbX + vbWidth / 2;
        const centerY = vbY + vbHeight / 2;

        const pathElements = Array.from(doc.querySelectorAll('path'));
        if (pathElements.length === 0) return null;

        // Find the longest path (the main outer silhouette of the SVG)
        let longestD = '';
        for (const p of pathElements) {
            const d = p.getAttribute('d') || '';
            if (d.length > longestD.length) {
                longestD = d;
            }
        }

        if (!longestD) return null;

        const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tempPath.setAttribute('d', longestD);
        tempSvg.appendChild(tempPath);
        document.body.appendChild(tempSvg);

        const totalLen = tempPath.getTotalLength();
        const numSamples = options.samples || 28;
        const points = [];

        for (let i = 0; i < numSamples; i++) {
            const dist = (i / numSamples) * totalLen;
            const pt = tempPath.getPointAtLength(dist);
            points.push({
                x: (pt.x - centerX) / vbWidth,
                y: (pt.y - centerY) / vbHeight
            });
        }

        document.body.removeChild(tempSvg);
        return this.smoothVertices(points, options.smoothingPasses || 1);
    }
}
