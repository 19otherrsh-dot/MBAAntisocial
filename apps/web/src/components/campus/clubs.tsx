import { getInitials, hashToIndex } from '@/lib/utils';
import cs from './campus.module.css';
import { backgroundForWhiteText } from '@/lib/color';

export const CLUB_CATEGORY_LABEL: Record<string, string> = { professional: 'Professional', cultural: 'Cultural', sports: 'Sports', 'social-impact': 'Social impact', entrepreneurship: 'Entrepreneurship', media: 'Media', committee: 'Committee', hobby: 'Hobby' };
const LOGO_COLORS = ['#5b4bdb', '#0c8599', '#d9480f', '#2b8a3e', '#c2255c', '#e67700', '#1971c2'];

export function ClubLogo({ name, logo, size = 48 }: { name: string; logo: string; size?: number }) {
  return (
    <span className={cs.logo} style={{ width: size, height: size, background: logo ? undefined : backgroundForWhiteText(LOGO_COLORS[hashToIndex(name, LOGO_COLORS.length)]) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo ? <img src={logo} alt="" /> : getInitials(name)}
    </span>
  );
}
