import type { CSSProperties } from 'react';
import { themes, type ThemeId } from '../shared/themes';

export function themeStyle(id: ThemeId): CSSProperties {
  const theme = themes[id];
  return {
    ...Object.fromEntries(
      Object.entries(theme.palette).map(([name, value]) => [`--${name}`, value]),
    ),
    colorScheme: theme.mode,
  } as CSSProperties;
}
