export type AdminCat = 'users' | 'notice' | 'donation' | 'system';
export type MobileView = 'list' | AdminCat;
export type UserTool = 'menu' | 'backups' | '2fa' | 'password' | 'edit';

export const CAT_ORDER: readonly AdminCat[] = ['users', 'notice', 'donation', 'system'];
export const MOBILE_ORDER: readonly MobileView[] = ['list', ...CAT_ORDER];
export const TOOL_ORDER: readonly UserTool[] = ['menu', 'backups', '2fa', 'password', 'edit'];
