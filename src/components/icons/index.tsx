import React from 'react';
import { Icon, type IconProps, type IconComponent } from './Icon';
import type { GlyphName } from './glyphs';

export { Icon };
export type { IconProps, IconComponent, GlyphName };

/** A glyph as a component of its own, so a page can pass it around (a nav
 *  item's icon, a settings row's) the way it passes any component. */
function glyph(name: GlyphName, displayName: string): IconComponent {
    const Glyph: IconComponent = props => <Icon name={name} {...props} />;
    Glyph.displayName = displayName;
    return Glyph;
}

// Places
export const House = glyph('home', 'House');
export const Log = glyph('log', 'Log');
export const Labs = glyph('labs', 'Labs');
export const Gear = glyph('gear', 'Gear');
export const Account = glyph('account', 'Account');
export const Shield = glyph('shield', 'Shield');
export const ShieldOff = glyph('shield-off', 'ShieldOff');
export const Sliders = glyph('sliders', 'Sliders');

// Actions
export const Plus = glyph('plus', 'Plus');
export const Minus = glyph('minus', 'Minus');
export const Close = glyph('close', 'Close');
export const Check = glyph('check', 'Check');
export const Trash = glyph('trash', 'Trash');
export const Copy = glyph('copy', 'Copy');
export const Pencil = glyph('pencil', 'Pencil');
export const Save = glyph('save', 'Save');
export const Retry = glyph('retry', 'Retry');
export const Undo = glyph('undo', 'Undo');
export const Repeat = glyph('repeat', 'Repeat');
export const Download = glyph('download', 'Download');
export const Upload = glyph('upload', 'Upload');
export const Logout = glyph('logout', 'Logout');
export const Share = glyph('share', 'Share');
export const Link = glyph('link', 'Link');
export const External = glyph('external', 'External');
export const ArrowUpRight = glyph('arrow-up-right', 'ArrowUpRight');
export const ArrowLeft = glyph('arrow-left', 'ArrowLeft');
export const ArrowRight = glyph('arrow-right', 'ArrowRight');
export const ChevronRight = glyph('chevron-right', 'ChevronRight');
export const ChevronLeft = glyph('chevron-left', 'ChevronLeft');
export const ChevronDown = glyph('chevron-down', 'ChevronDown');
export const ChevronUp = glyph('chevron-up', 'ChevronUp');
export const Search = glyph('search', 'Search');
export const Bookmark = glyph('bookmark', 'Bookmark');
export const BookmarkPlus = glyph('bookmark-plus', 'BookmarkPlus');
export const Select = glyph('select', 'Select');
export const Merge = glyph('merge', 'Merge');
export const ImagePlus = glyph('image-plus', 'ImagePlus');
export const ImageOff = glyph('image-off', 'ImageOff');

// State
export const Alert = glyph('alert', 'Alert');
export const Warning = glyph('warning', 'Warning');
export const Info = glyph('info', 'Info');
export const CheckCircle = glyph('check-circle', 'CheckCircle');
export const Off = glyph('off', 'Off');
/** Waiting. Spins only with `animate-spin`, and calmly (motion.css). */
export const Busy = glyph('busy', 'Busy');

// Things
export const Lock = glyph('lock', 'Lock');
export const LockKeyhole = glyph('lock-keyhole', 'LockKeyhole');
export const Eye = glyph('eye', 'Eye');
export const EyeOff = glyph('eye-off', 'EyeOff');
export const Password = glyph('password', 'Password');
export const Codes = glyph('codes', 'Codes');
export const Monitor = glyph('monitor', 'Monitor');
export const Phone = glyph('phone', 'Phone');
export const Devices = glyph('devices', 'Devices');
export const Drive = glyph('drive', 'Drive');
export const Database = glyph('database', 'Database');
export const Server = glyph('server', 'Server');
export const Cloud = glyph('cloud', 'Cloud');
export const CloudUp = glyph('cloud-up', 'CloudUp');
export const CloudDown = glyph('cloud-down', 'CloudDown');
export const CloudOff = glyph('cloud-off', 'CloudOff');
export const Megaphone = glyph('megaphone', 'Megaphone');
export const Users = glyph('users', 'Users');
export const Calendar = glyph('calendar', 'Calendar');
export const Clock = glyph('clock', 'Clock');

// Calibration methods
export const Gauge = glyph('gauge', 'Gauge');
export const Radar = glyph('radar', 'Radar');
export const Wind = glyph('wind', 'Wind');
export const Rewind = glyph('rewind', 'Rewind');
export const FastForward = glyph('fast-forward', 'FastForward');
