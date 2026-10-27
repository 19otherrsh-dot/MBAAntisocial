import type { DetailedHTMLProps, HTMLAttributes } from 'react';

/** The subset of <model-viewer> attributes the app uses. */
interface ModelViewerAttributes extends HTMLAttributes<HTMLElement> {
  src?: string;
  poster?: string;
  alt?: string;
  loading?: 'auto' | 'lazy' | 'eager';
  reveal?: 'auto' | 'manual';
  'camera-controls'?: boolean | '';
  'disable-zoom'?: boolean | '';
  'disable-pan'?: boolean | '';
  'touch-action'?: string;
  'camera-orbit'?: string;
  'camera-target'?: string;
  'field-of-view'?: string;
  'min-camera-orbit'?: string;
  'max-camera-orbit'?: string;
  'interpolation-decay'?: string | number;
  'interaction-prompt'?: 'auto' | 'none';
  'shadow-intensity'?: string | number;
  'shadow-softness'?: string | number;
  exposure?: string | number;
  'environment-image'?: string;
  'tone-mapping'?: string;
  'auto-rotate'?: boolean | '';
  'rotation-per-second'?: string;
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<ModelViewerAttributes, HTMLElement>;
    }
  }
}
