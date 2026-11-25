import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { BusyLabel } from '../../components/StableLabel';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { donationService, DonationAddresses } from '../../services/donation';
import { BusyState, errorMessage, muted } from './shared';

export function useDonation({ active }: { active: boolean }) {
    const { token } = useAuth();
    const { showDialog } = useDialog();

    const [donation, setDonation] = useState<DonationAddresses | null>(null);
    const [donationLoading, setDonationLoading] = useState(false);
    const [donationSaving, setDonationSaving] = useState(false);
    const [donationMonero, setDonationMonero] = useState('');
    const [donationPayout, setDonationPayout] = useState('');
    const [donationError, setDonationError] = useState<string | null>(null);

    const applyDonation = (d: DonationAddresses | null) => {
        setDonation(d);
        setDonationMonero(d?.monero ?? '');
        setDonationPayout(d?.moneroPayout ?? '');
    };

    const fetchDonation = useCallback(async () => {
        if (!token) return;
        setDonationLoading(true);
        setDonationError(null);
        try {
            applyDonation(await donationService.getStored(token));
        } catch (e: unknown) {
            setDonationError(errorMessage(e) || 'Could not load the donation addresses.');
        } finally {
            setDonationLoading(false);
        }
    }, [token]);

    // Loaded on opening the category, like the notice editor: the users list
    // is what the page opens on, and this is a request nobody asked for yet.
    useEffect(() => {
        if (active) void fetchDonation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    const saveDonation = async () => {
        if (!token) return;
        setDonationSaving(true);
        setDonationError(null);
        try {
            applyDonation(
                await donationService.save(token, {
                    monero: donationMonero,
                    moneroPayout: donationPayout,
                }),
            );
            showDialog('alert', 'Donation addresses saved.');
        } catch (e: unknown) {
            showDialog('alert', errorMessage(e) || 'Could not save the donation addresses.');
        } finally {
            setDonationSaving(false);
        }
    };

    const directConfigured = !!donation?.monero;
    const trocadorConfigured = !!donation?.moneroPayout;

    return {
        donation,
        donationLoading,
        donationSaving,
        donationMonero,
        setDonationMonero,
        donationPayout,
        setDonationPayout,
        donationError,
        saveDonation,
        directConfigured,
        trocadorConfigured,
    };
}

export type DonationState = ReturnType<typeof useDonation>;

export const DonationPanel: FC<{ state: DonationState }> = ({ state }) => {
    const {
        donationLoading,
        donationSaving,
        donationMonero,
        setDonationMonero,
        donationPayout,
        setDonationPayout,
        donationError,
        saveDonation,
        directConfigured,
        trocadorConfigured,
    } = state;

    if (donationLoading) return <BusyState />;

    return (
        <div>
            <p className={`text-xs ${muted} mb-4`}>
                Shown on the community funding page after the vote closes. The direct address is public; the Trocador
                payout address is only used server-side for swapped coins and is never returned to the browser.
            </p>

            <label className="field-label mb-2" htmlFor="donation-monero">
                Direct Monero address (public)
            </label>
            <input
                id="donation-monero"
                value={donationMonero}
                onChange={e => setDonationMonero(e.target.value)}
                className="input-base font-mono text-xs"
                placeholder="8…"
                autoComplete="off"
                spellCheck={false}
            />
            <p className="field-hint">
                Validated with the Monero Base58 checksum. Leave empty to hide the direct option.
            </p>

            <label className="field-label mb-2 mt-4" htmlFor="donation-payout">
                Trocador payout address (private)
            </label>
            <input
                id="donation-payout"
                value={donationPayout}
                onChange={e => setDonationPayout(e.target.value)}
                className="input-base font-mono text-xs"
                placeholder="8…"
                autoComplete="off"
                spellCheck={false}
            />
            <p className="field-hint">
                Use a different Monero subaddress from the public one. Trocador sends BTC, ETH and other swapped coins
                here. Leave empty to disable the exchange option.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <span className={`text-xs ${muted}`}>
                    Direct: {directConfigured ? 'set' : 'not set'} · Trocador:{' '}
                    {trocadorConfigured ? 'ready' : 'not set'}
                </span>
                <button
                    onClick={saveDonation}
                    disabled={donationSaving}
                    className="btn-primary disabled:opacity-45 disabled:pointer-events-none"
                >
                    <BusyLabel busy={donationSaving} size={16}>
                        Save
                    </BusyLabel>
                </button>
            </div>
            {donationError && <p className="field-hint is-error">{donationError}</p>}
        </div>
    );
};
