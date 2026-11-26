import { useEffect, useRef, useState } from 'react';
import { molToSvg, type Mol } from '../lib/molsvg';
import Doodle, { type DoodleName } from './Doodle';

/* A medicine drawn as its skeletal formula, laid out as PubChem lays it out
   (the standard depiction, as in textbooks and on Wikipedia) and drawn in one
   ink like everything else on the page (lib/molsvg.ts), as Oyama Journal
   draws its substances. The drawings are PubChem's 2D records (public
   domain), kept in src/data/structures.json, which loads with the first
   page that draws one. A medicine without a drawing (the GnRH agonists,
   peptides too long to read at this size) keeps its route's doodle. */

export interface Structure extends Mol {
    cid: number;
    /** PubChem's name for the compound drawn */
    name: string;
    formula?: string;
    /** g/mol */
    mass?: number;
}

let all: Promise<Record<string, Structure>> | null = null;
export function loadStructures(): Promise<Record<string, Structure>> {
    all ??= import('../data/structures.json')
        .then(m => (m.default ?? m) as unknown as Record<string, Structure>)
        .catch(() => ({}));
    return all;
}

/** A medicine's drawing data, once loaded: null when it has none. */
export function useStructure(id: string): Structure | null | undefined {
    const [s, setS] = useState<Structure | null | undefined>(undefined);
    useEffect(() => {
        let live = true;
        loadStructures().then(m => live && setS(m[id] ?? null));
        return () => {
            live = false;
        };
    }, [id]);
    return s;
}

const drawn = new Map<string, string | null>();

/* Drawings wait their turn, one per frame, so a long list stays smooth. */
const queue: (() => void)[] = [];
let pumping = false;
function schedule(job: () => void) {
    queue.push(job);
    if (pumping) return;
    pumping = true;
    const pump = () => {
        const next = queue.shift();
        if (!next) {
            pumping = false;
            return;
        }
        next();
        requestAnimationFrame(pump);
    };
    requestAnimationFrame(pump);
}

/** In the renderer's units, where a bond is 30: four bonds. */
const MIN_FRAME = 120;

/** Frames the drawing on what was actually drawn, measured off-screen with
 *  the styles the page will draw it with, so no label is ever cut off. */
function fitToContent(markup: string): string {
    const host = document.createElement('div');
    host.className = 'molecule-ink';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
        'position:absolute;left:-10000px;top:0;width:240px;height:240px;overflow:hidden;visibility:hidden;pointer-events:none';
    host.innerHTML = markup;
    document.body.appendChild(host);
    const svg = host.querySelector('svg');
    try {
        const b = svg?.getBBox();
        if (svg && b && b.width > 0 && b.height > 0) {
            const m = Math.max(2, Math.max(b.width, b.height) * 0.04);
            const w = Math.max(b.width + 2 * m, MIN_FRAME),
                h = Math.max(b.height + 2 * m, MIN_FRAME);
            svg.setAttribute('viewBox', `${b.x + b.width / 2 - w / 2} ${b.y + b.height / 2 - h / 2} ${w} ${h}`);
        }
    } catch {
        /* keep the renderer's frame */
    }
    const out = svg ? svg.outerHTML : markup;
    host.remove();
    return out;
}

async function drawMolecule(id: string): Promise<string | null> {
    if (drawn.has(id)) return drawn.get(id)!;
    const s = (await loadStructures())[id];
    if (!s) {
        drawn.set(id, null);
        return null;
    }
    return new Promise(resolve => {
        schedule(() => {
            if (drawn.has(id)) return resolve(drawn.get(id)!);
            let markup: string | null;
            try {
                const raw = molToSvg(s);
                markup = /<line|<polygon/.test(raw) ? fitToContent(raw) : null;
            } catch {
                markup = null;
            }
            drawn.set(id, markup);
            resolve(markup);
        });
    });
}

export function Molecule({
    id,
    fallback,
    size = 'sm',
}: {
    id: string;
    fallback: DoodleName;
    size?: 'xs' | 'sm' | 'lg';
}) {
    const box = useRef<HTMLSpanElement>(null);
    const [markup, setMarkup] = useState<string | null | undefined>(() => drawn.get(id));

    useEffect(() => {
        if (drawn.has(id)) {
            setMarkup(drawn.get(id));
            return;
        }
        const el = box.current;
        if (!el) return;
        let live = true;
        const io = new IntersectionObserver(
            ([e]) => {
                if (!e.isIntersecting) return;
                io.disconnect();
                drawMolecule(id).then(m => live && setMarkup(m));
            },
            { rootMargin: '300px' },
        );
        io.observe(el);
        return () => {
            live = false;
            io.disconnect();
        };
    }, [id]);

    const doodle = { xs: 1.1, sm: 1.75, lg: 3.25 }[size];
    return (
        <span ref={box} className={`molecule molecule-${size}`} aria-hidden="true">
            {markup ? (
                <span className="molecule-ink" dangerouslySetInnerHTML={{ __html: markup }} />
            ) : markup === null ? (
                <Doodle name={fallback} size={doodle} />
            ) : null}
        </span>
    );
}

/** A chemical formula with its counts set low: C₁₈H₂₄O₂. */
export function Formula({ of }: { of: string }) {
    const parts = of.split(/(\d+)/).filter(Boolean);
    return (
        <span>
            {parts.map((p, i) =>
                /^\d+$/.test(p) ? (
                    <sub key={i} className="text-[0.75em]">
                        {p}
                    </sub>
                ) : (
                    <span key={i}>{p}</span>
                ),
            )}
        </span>
    );
}

export default Molecule;
