import { buildPath } from './paths.js';
import { buildSection } from './sections.js';
import { sweep, twistProfile, widthProfile } from './sweep.js';

export const QUALITY = {
  draft: { along: 900, around: 48 },
  final: { along: 2400, around: 96 },
};

// Params to triangle mesh data, in units where the path's radius is 1.
export function buildForm(params, quality = QUALITY.draft) {
  const path = buildPath(params, quality.along);
  const section = buildSection(params, quality.around);
  return sweep(path, section, {
    width: params['form.width'],
    thickness: params['form.thickness'],
    widthAt: widthProfile(params['form.width.profile'], params['form.width.amount'], path.closed),
    twistTurns: params['form.twist.turns'],
    twistAt: twistProfile(params['form.twist.profile']),
  });
}
