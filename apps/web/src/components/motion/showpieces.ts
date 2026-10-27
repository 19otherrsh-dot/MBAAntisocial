import type { ShowpieceProps } from './Showpiece';

/**
 * The few sections that earn a 3D centrepiece. Both models are photographic
 * showcase assets from the Khronos Group's glTF Sample Assets, optimised for
 * the web (WebP textures, simplified meshes) by scripts/optimise-model.mjs.
 * A section without a showpiece that fits stays without one.
 */
export const SHOWPIECES: Partial<Record<string, ShowpieceProps>> = {
  play: {
    src: '/models/a-beautiful-game.glb',
    poster: '/models/a-beautiful-game.webp',
    alt: 'A marble and jade chess set, mid-game',
    orbit: [-25, 45],
    polar: 58,
    radius: '40%',
    aspect: '4 / 3',
    exposure: 1.1,
    credit: { title: 'A Beautiful Game', by: 'MaterialX Project (ASWF), glTF by Ed Mackey', license: 'CC BY 4.0', href: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ABeautifulGame' },
  },
  academics: {
    src: '/models/stained-glass-lamp.glb',
    poster: '/models/stained-glass-lamp.webp',
    alt: 'A Tiffany-style stained glass desk lamp',
    orbit: [-30, 60],
    polar: 82,
    radius: '115%',
    aspect: '3 / 4',
    credit: { title: 'Stained Glass Lamp', by: 'Wayfair', license: 'CC BY 4.0', href: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/StainedGlassLamp' },
  },
};
