import { expect, test } from '@playwright/test';
import { API_ORIGIN, registerUser } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe('local Worker security contract (L3 browser harness)', () => {
    test('public endpoints carry the security headers and transparency stays aggregate-only', async ({ request }) => {
        const notice = await request.get(`${API_ORIGIN}/api/notice`);
        expect(notice.status()).toBe(200);
        const headers = notice.headers();
        expect(headers['content-security-policy']).toContain("default-src 'self'");
        expect(headers['content-security-policy']).toContain("object-src 'none'");
        expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
        expect(headers['strict-transport-security']).toBe('max-age=31536000');
        expect(headers['x-frame-options']).toBe('DENY');
        expect(headers['x-content-type-options']).toBe('nosniff');
        expect(headers['permissions-policy']).toContain('camera=()');

        const capability = await request.get(`${API_ORIGIN}/api/hrt/capability`);
        expect(capability.status()).toBe(200);
        expect(await capability.json()).toEqual({ supported: false });
        expect(capability.headers()['cache-control']).toBe('no-store');

        const transparency = await request.get(`${API_ORIGIN}/api/transparency`);
        expect(transparency.status()).toBe(200);
        expect(transparency.headers()['cache-control']).toBe('public, max-age=15');
        const body = await transparency.json();
        expect(body).toHaveProperty('total_users');
        expect(body).toHaveProperty('recent_registrations');
        expect(Array.isArray(body.recent_registrations)).toBe(true);
        const text = JSON.stringify(body);
        expect(text).not.toContain('username');
        expect(text).not.toContain('password');
        expect(text).not.toContain('@');
        for (const entry of body.recent_registrations) {
            expect(Object.keys(entry).sort()).toEqual(['anon_id', 'created_at']);
            expect(entry.anon_id).toMatch(/^[a-f0-9]{4}$/);
        }
    });

    test('avatar upload accepts only small JPEG/PNG, serves it publicly, and rejects traversal', async ({
        request,
    }) => {
        const user = await registerUser(request, 'avatar');

        // An account with no avatar must not make the browser log a 404 every
        // time Account renders; an unknown username still gets a plain 404.
        const missing = await request.get(`${API_ORIGIN}/api/user/avatar/${user.user.username}`);
        expect(missing.status()).toBe(204);
        const unknown = await request.get(`${API_ORIGIN}/api/user/avatar/no-such-user-${Date.now()}`);
        expect(unknown.status()).toBe(404);

        const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
        const put = await request.put(`${API_ORIGIN}/api/user/avatar`, {
            headers: { ...auth(user.token), 'Content-Type': 'image/jpeg' },
            data: jpeg,
        });
        expect(put.status()).toBe(200);

        const get = await request.get(`${API_ORIGIN}/api/user/avatar/${user.user.username}`);
        expect(get.status()).toBe(200);
        expect(get.headers()['content-type']).toBe('image/jpeg');
        expect(get.headers()['x-content-type-options']).toBe('nosniff');
        expect(get.headers()['cache-control']).toBe('public, max-age=3600');
        expect(Buffer.from(await get.body())).toEqual(jpeg);

        const svg = await request.put(`${API_ORIGIN}/api/user/avatar`, {
            headers: { ...auth(user.token), 'Content-Type': 'image/svg+xml' },
            data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
        });
        expect(svg.status()).toBe(415);

        const html = await request.put(`${API_ORIGIN}/api/user/avatar`, {
            headers: { ...auth(user.token), 'Content-Type': 'text/html' },
            data: Buffer.from('<!doctype html><script>alert(1)</script>'),
        });
        expect(html.status()).toBe(415);

        const oversized = await request.put(`${API_ORIGIN}/api/user/avatar`, {
            headers: { ...auth(user.token), 'Content-Type': 'image/jpeg' },
            data: Buffer.alloc(5 * 1024 * 1024 + 1, 0xff),
        });
        expect(oversized.status()).toBe(413);

        const anonymous = await request.put(`${API_ORIGIN}/api/user/avatar`, {
            headers: { 'Content-Type': 'image/jpeg' },
            data: jpeg,
        });
        expect(anonymous.status()).toBe(401);

        const traversal = await request.get(`${API_ORIGIN}/api/user/avatar/..%2F..%2Fetc%2Fpasswd`);
        expect(traversal.status()).toBe(404);
        const scriptName = await request.get(`${API_ORIGIN}/api/user/avatar/%3Cscript%3Ealert(1)%3C%2Fscript%3E`);
        expect(scriptName.status()).toBe(404);
        expect(await scriptName.text()).not.toContain('<script>');
    });

    test('avatar upload rejects XML external entities without storing or expanding them', async ({ request }) => {
        const user = await registerUser(request, 'xxe');
        const avatarUrl = `${API_ORIGIN}/api/user/avatar/${user.user.username}`;
        expect((await request.get(avatarUrl)).status()).toBe(204);

        const xxe = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>`;
        const upload = await request.put(`${API_ORIGIN}/api/user/avatar`, {
            headers: { ...auth(user.token), 'Content-Type': 'image/svg+xml' },
            data: Buffer.from(xxe),
        });
        expect(upload.status()).toBe(415);
        expect((await request.get(avatarUrl)).status()).toBe(204);
    });

    test('one account cannot read or delete another account content', async ({ request }) => {
        const owner = await registerUser(request, 'owner');
        const other = await registerUser(request, 'other');

        const created = await request.post(`${API_ORIGIN}/api/content`, {
            headers: auth(owner.token),
            data: { data: { marker: 'owner-secret', events: [] } },
        });
        expect(created.status()).toBe(201);
        const { id } = await created.json();

        const otherList = await request.get(`${API_ORIGIN}/api/content`, { headers: auth(other.token) });
        expect(otherList.status()).toBe(200);
        expect(await otherList.text()).not.toContain(id);

        const otherRead = await request.get(`${API_ORIGIN}/api/content/${id}`, { headers: auth(other.token) });
        expect(otherRead.status()).toBe(404);

        // The delete route is scoped by user_id even though it still answers 200
        // for an id it did not touch; the record must remain for its owner.
        const otherDelete = await request.delete(`${API_ORIGIN}/api/content/${id}`, { headers: auth(other.token) });
        expect(otherDelete.status()).toBe(200);

        const ownerRead = await request.get(`${API_ORIGIN}/api/content/${id}`, { headers: auth(owner.token) });
        expect(ownerRead.status()).toBe(200);
        expect(JSON.stringify(await ownerRead.json())).toContain('owner-secret');
    });
});
