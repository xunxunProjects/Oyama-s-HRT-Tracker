import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';

// Everyone this app is built on. Kept as a plain static list on purpose: the
// page loads nothing from GitHub or anywhere else, so opening it tells no
// third party who is looking. The page is in English in every language, as
// credits pages usually are, so names and project titles read the same for
// everyone.

const REPO = 'https://github.com/xunxunProjects/Oyama-s-HRT-Tracker';

interface Entry {
    name: string;
    href: string;
    /** A one-line description. */
    desc?: string;
    /** Shown as is, for things like a license name. */
    note?: string;
}

const ORIGINAL: Entry[] = [
    {
        name: 'HRT-Recorder-online',
        href: 'https://github.com/LaoZhong-Mihari/HRT-Recorder-online',
        desc: 'The repository this project is forked from',
    },
    {
        name: 'HRT-Recorder-PKcomponent-Test',
        href: 'https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test',
        desc: 'Where the level estimation algorithm comes from',
    },
];

// Everyone in the repository's contributor list except the maintainer, the
// original author (credited above) and automated accounts, in the order
// GitHub lists them.
const CONTRIBUTORS = [
    'TianmoFu06',
    'Zikinn',
    'kons10',
    'dongguacute',
    'xzdmycbx',
    'qwen-intl',
    'Vsxbamboo',
    'glutinouscloud',
];

const REFERENCES: Entry[] = [
    { name: 'MtF.wiki', href: 'https://mtf.wiki/' },
    { name: 'Transfem Science', href: 'https://transfemscience.org/' },
    { name: 'estrannai.se', href: 'https://estrannai.se/' },
    { name: 'hrt.transmtf.com', href: 'https://hrt.transmtf.com/' },
];

const LIBRARIES: Entry[] = [
    { name: 'React', href: 'https://react.dev/', note: 'MIT' },
    { name: 'Vite', href: 'https://vite.dev/', note: 'MIT' },
    { name: 'Tailwind CSS', href: 'https://tailwindcss.com/', note: 'MIT' },
    { name: 'Lucide', href: 'https://lucide.dev/', note: 'ISC' },
    { name: 'jsPDF', href: 'https://github.com/parallax/jsPDF', note: 'MIT' },
    { name: 'jsPDF-AutoTable', href: 'https://github.com/simonbengtsson/jsPDF-AutoTable', note: 'MIT' },
    { name: 'qrcode.react', href: 'https://github.com/zpao/qrcode.react', note: 'ISC' },
    { name: 'react-easy-crop', href: 'https://github.com/ValentinH/react-easy-crop', note: 'MIT' },
    { name: 'jose', href: 'https://github.com/panva/jose', note: 'MIT' },
    { name: 'bcrypt.js', href: 'https://github.com/dcodeIO/bcrypt.js', note: 'BSD-3-Clause' },
    { name: 'uuid', href: 'https://github.com/uuidjs/uuid', note: 'MIT' },
    { name: 'Vite PWA', href: 'https://vite-pwa-org.netlify.app/', note: 'MIT' },
    { name: 'Workbox', href: 'https://developer.chrome.com/docs/workbox', note: 'MIT' },
    { name: 'Tauri', href: 'https://tauri.app/', note: 'Apache-2.0 / MIT' },
];

const heading = 'mt-8 mb-1 text-xs font-medium text-[var(--text-muted)]';
const inlineLink =
    'text-[var(--text)] underline decoration-[var(--border)] underline-offset-[3px] hover:decoration-current break-words';
const row =
    'group flex items-center justify-between gap-4 py-3.5 border-b border-[var(--border)] last:border-b-0 text-start';

const LinkRow: React.FC<{ entry: Entry }> = ({ entry }) => {
    return (
        <a href={entry.href} target="_blank" rel="noopener noreferrer" className={row}>
            <span className="min-w-0">
                <span className="block text-[0.9375rem] text-[var(--text)] break-words">{entry.name}</span>
                {entry.desc && <span className="block text-xs text-[var(--text-muted)] mt-0.5">{entry.desc}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--text-muted)]">
                {entry.note}
                <ArrowUpRight
                    size={16}
                    strokeWidth={1.75}
                    className="opacity-60 group-hover:opacity-100 rtl:-scale-x-100"
                />
            </span>
        </a>
    );
};

interface CreditsProps {
    onBack: () => void;
}

const Credits: React.FC<CreditsProps> = ({ onBack }) => {
    return (
        <div lang="en" dir="ltr" className="pb-32">
            <PageHeader onBack={onBack} title="Credits" />

            <div className={PAGE_COLUMN}>
                <p className="text-sm text-[var(--text-muted)]">
                    This app is built on the work of many people. Thank you.
                </p>

                <h2 className={heading}>Original work</h2>
                <p className="text-xs text-[var(--text-muted)]">
                    This project was first created by LaoZhong-Mihari, and its dose and level estimates come from their
                    work.
                </p>
                <div>
                    {ORIGINAL.map(entry => (
                        <LinkRow key={entry.href} entry={entry} />
                    ))}
                </div>

                <h2 className={heading}>Maintainer</h2>
                <div>
                    <LinkRow
                        entry={{
                            name: 'SmirnovaOyama',
                            href: 'https://github.com/SmirnovaOyama',
                            desc: 'Current maintainer',
                        }}
                    />
                </div>

                <h2 className={heading}>Contributors</h2>
                <p className="flex flex-wrap gap-x-4 gap-y-2 pt-2 pb-3.5 border-b border-[var(--border)] text-[0.9375rem]">
                    {CONTRIBUTORS.map(login => (
                        <a
                            key={login}
                            href={`https://github.com/${login}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={inlineLink}
                        >
                            {login}
                        </a>
                    ))}
                </p>
                <div>
                    <LinkRow entry={{ name: 'See all contributors on GitHub', href: `${REPO}/graphs/contributors` }} />
                </div>

                <h2 className={heading}>References</h2>
                <p className="text-xs text-[var(--text-muted)]">
                    The estimation model draws on these community resources, along with papers and drug labels.
                </p>
                <div>
                    {REFERENCES.map(entry => (
                        <LinkRow key={entry.href} entry={entry} />
                    ))}
                    <LinkRow
                        entry={{
                            name: 'See the full reference list',
                            href: `${REPO}/blob/main/Algorithm%20Explanation.md`,
                        }}
                    />
                </div>

                <h2 className={heading}>Open source software</h2>
                <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 pt-2 text-[0.9375rem]">
                    {LIBRARIES.map(entry => (
                        <li key={entry.href} className="min-w-0">
                            <a href={entry.href} target="_blank" rel="noopener noreferrer" className={inlineLink}>
                                {entry.name}
                            </a>
                            <span className="block text-xs text-[var(--text-muted)]">{entry.note}</span>
                        </li>
                    ))}
                </ul>

                <p className="mt-8 text-sm text-[var(--text-muted)]">
                    And thank you to everyone who uses this app, reports problems and shares ideas.
                </p>
            </div>
        </div>
    );
};

export default Credits;
