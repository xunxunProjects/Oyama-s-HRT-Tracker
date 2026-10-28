import { describe, expect, it } from 'vitest';
import { DEVELOPERS } from '../src/data/developers';

describe('Credits developer list', () => {
    it('has one entry per login', () => {
        const logins = DEVELOPERS.map(developer => developer.login);
        expect(new Set(logins).size).toBe(logins.length);
    });

    it('gives every developer a login, a role and an introduction', () => {
        for (const developer of DEVELOPERS) {
            expect(developer.login).toMatch(/^[A-Za-z0-9-]+$/);
            expect(developer.role.trim()).not.toBe('');
            expect(developer.bio.trim()).not.toBe('');
            expect(developer.avatar).toBeTruthy();
        }
    });

    it('keeps donation labels unique and values non-empty', () => {
        for (const developer of DEVELOPERS) {
            const donations = developer.donations ?? [];
            expect(new Set(donations.map(donation => donation.label)).size).toBe(donations.length);
            for (const donation of donations) {
                expect(donation.value.trim()).not.toBe('');
            }
        }
    });
});
