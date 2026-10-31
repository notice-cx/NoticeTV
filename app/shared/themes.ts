export const themeIds = ['graphite', 'midnight', 'paper', 'ember', 'moss'] as const;
export type ThemeId = (typeof themeIds)[number];
export const defaultTheme: ThemeId = 'graphite';

type Palette = {
  background: string;
  surface: string;
  raised: string;
  inset: string;
  text: string;
  secondary: string;
  muted: string;
  accent: string;
  'on-accent': string;
  'accent-soft': string;
  line: string;
  'line-strong': string;
  note: string;
  'note-text': string;
  'note-muted': string;
  weather: string;
  warning: string;
  'warning-bg': string;
  positive: string;
  negative: string;
};

export const themes: Record<
  ThemeId,
  { name: string; description: string; mode: 'dark' | 'light'; palette: Palette }
> = {
  graphite: {
    name: 'Graphite',
    description: 'Neutral charcoal',
    mode: 'dark',
    palette: {
      background: '#101114',
      surface: '#1b1d22',
      raised: '#24272e',
      inset: '#15171c',
      text: '#f0f1f5',
      secondary: '#b7bdc9',
      muted: '#969eae',
      accent: '#dce5f5',
      'on-accent': '#192334',
      'accent-soft': '#dce5f511',
      line: '#ffffff12',
      'line-strong': '#ffffff29',
      note: '#e0e6ef',
      'note-text': '#1f2937',
      'note-muted': '#526074',
      weather: '#e8c180',
      warning: '#e4bb7a',
      'warning-bg': '#34291a',
      positive: '#89c5a7',
      negative: '#e6a3a3',
    },
  },
  midnight: {
    name: 'Midnight',
    description: 'Deep navy & blue',
    mode: 'dark',
    palette: {
      background: '#0b1220',
      surface: '#152136',
      raised: '#1d2c45',
      inset: '#0d1729',
      text: '#edf3ff',
      secondary: '#b1c2de',
      muted: '#91a8c8',
      accent: '#a9c9ff',
      'on-accent': '#112746',
      'accent-soft': '#a9c9ff14',
      line: '#c5d6f219',
      'line-strong': '#c5d6f235',
      note: '#b8d0f3',
      'note-text': '#142b4c',
      'note-muted': '#3e5b7b',
      weather: '#e8c783',
      warning: '#e4bb7a',
      'warning-bg': '#34291a',
      positive: '#89c5b6',
      negative: '#edabad',
    },
  },
  paper: {
    name: 'Paper',
    description: 'Clean & light',
    mode: 'light',
    palette: {
      background: '#f1f2f4',
      surface: '#ffffff',
      raised: '#e8ebef',
      inset: '#f5f6f8',
      text: '#202632',
      secondary: '#495668',
      muted: '#606d7e',
      accent: '#345b88',
      'on-accent': '#ffffff',
      'accent-soft': '#345b8811',
      line: '#14283f16',
      'line-strong': '#14283f35',
      note: '#e1e8f1',
      'note-text': '#253951',
      'note-muted': '#4f627b',
      weather: '#94601c',
      warning: '#8b5719',
      'warning-bg': '#f8e7cc',
      positive: '#28694b',
      negative: '#9b414b',
    },
  },
  ember: {
    name: 'Ember',
    description: 'Warm charcoal & copper',
    mode: 'dark',
    palette: {
      background: '#191311',
      surface: '#281e1a',
      raised: '#342620',
      inset: '#1e1713',
      text: '#fff1e7',
      secondary: '#d6bfb0',
      muted: '#b09a8b',
      accent: '#f0b68f',
      'on-accent': '#3a2015',
      'accent-soft': '#f0b68f12',
      line: '#f7d4bd17',
      'line-strong': '#f7d4bd33',
      note: '#ebc5ac',
      'note-text': '#43291c',
      'note-muted': '#795641',
      weather: '#edc28c',
      warning: '#edc28c',
      'warning-bg': '#3b2918',
      positive: '#b6d0a7',
      negative: '#edb0a6',
    },
  },
  moss: {
    name: 'Moss',
    description: 'Earthy greens',
    mode: 'dark',
    palette: {
      background: '#101410',
      surface: '#1b2119',
      raised: '#23291f',
      inset: '#141a10',
      text: '#e7eadf',
      secondary: '#bdcbb1',
      muted: '#9aa98a',
      accent: '#c9ddb0',
      'on-accent': '#28361f',
      'accent-soft': '#c9ddb010',
      line: '#d5e9c111',
      'line-strong': '#d5e9c12b',
      note: '#c9d9b4',
      'note-text': '#293920',
      'note-muted': '#536543',
      weather: '#e1c795',
      warning: '#dbc089',
      'warning-bg': '#30291d',
      positive: '#a9c995',
      negative: '#dbb09c',
    },
  },
};
