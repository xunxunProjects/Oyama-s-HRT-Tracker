import fantuanmtfAvatar from '../assets/fantuanmtf-avatar.webp';
import maintainerAvatar from '../assets/maintainer-avatar.webp';

/**
 * One way to support a developer personally. A developer can list any mix of
 * these; without donations they get no support block at all.
 *
 * - `address`: a wallet address, shown in full and copyable.
 * - `link`: a payment page, opened in a new tab.
 * - `qr`: a payment code. `value` is encoded into a QR locally, or `image`
 *   points at a bundled payment code.
 */
export type Donation =
    | { kind: 'address'; label: string; value: string; network?: string }
    | { kind: 'link'; label: string; value: string; href: string }
    | { kind: 'qr'; label: string; value: string; image?: string };

export interface Developer {
    /** GitHub login; also the GitHub portal at the bottom of the card. */
    login: string;
    /** Shown instead of the login when set. */
    name?: string;
    /** Bundled with the app, like the other Credits pictures. */
    avatar: string;
    role: string;
    /** A short introduction, in English like the rest of this page. */
    bio: string;
    /** What they look after, e.g. Frontend, Backend, Security. */
    focus?: string[];
    /** Languages they usually write. */
    languages?: string[];
    website?: { label: string; href: string };
    /** Personal support only. The project itself has no donation channel. */
    donations?: Donation[];
}

/**
 * The developer list on the Credits page. To add someone, append one object;
 * the row, the expandable card and the GitHub link are generated from it.
 * Leave a field out and its block is not rendered.
 *
 * The details here come from public GitHub profiles and repository history.
 * Anyone adding themselves should edit their own entry.
 */
export const DEVELOPERS: Developer[] = [
    {
        login: 'SmirnovaOyama',
        avatar: maintainerAvatar,
        role: 'Maintainer',
        bio: "Maintainer of Oyama's HRT Tracker. Works on the interface, the design system, and the words the app uses.",
        focus: ['Frontend', 'Design', 'i18n'],
        languages: ['TypeScript', 'Swift', 'Java'],
        website: { label: 'mahiro.uk', href: 'https://mahiro.uk' },
    },
    {
        login: 'fantuanmtf',
        avatar: fantuanmtfAvatar,
        role: 'Maintainer',
        bio: "Maintainer of Oyama's HRT Tracker. Works on the backend, security, and deployment; runs Gentoo and writes code with AI.",
        focus: ['Backend', 'Security', 'Deployment'],
        languages: ['Rust', 'C++', 'JavaScript', 'Python'],
        website: {
            label: 'Onion site (Tor only)',
            href: 'http://lgbtqiadfu5epuzzc52vsmw657srrg4ud3b3fm6wtigono5ii3ldw3qd.onion/',
        },
        donations: [
            {
                kind: 'address',
                label: 'Bitcoin',
                value: 'bc1qdgfj0rm0tguna4nk36lxmeq45h59hscusrthk2',
            },
            {
                kind: 'address',
                label: 'Ethereum',
                value: '0x0Ad817F7Ca658B3D2D83Ab019F2AeA5645a5b672',
            },
        ],
    },
];
