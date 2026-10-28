import fantuanmtfAvatar from '../assets/fantuanmtf-avatar.webp';
import laozhongAvatar from '../assets/laozhong-avatar.webp';
import maintainerAvatar from '../assets/maintainer-avatar.webp';

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
    },
    {
        login: 'LaoZhong-Mihari',
        avatar: laozhongAvatar,
        role: 'Original author',
        bio: 'Created the original HRT-Recorder and the pharmacokinetic model this app builds on. Studies chemistry and biology.',
        focus: ['PK model', 'Swift', 'Research'],
        languages: ['Swift', 'TypeScript', 'Python'],
    },
];
