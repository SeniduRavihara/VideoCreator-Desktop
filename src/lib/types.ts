export interface AppState {
  title: string;
  text: string;
  speed: number;
  resolution: '720p' | '1080p';
  fontTitle: string;
  fontContent: string;
  bgColor: string;
  titleColor: string;
  contentColor: string;
  titleFontSize: number;
  contentFontSize: number;
  content: any; // Tiptap JSON
  audioFile: File | null;
}

export const defaultState: AppState = {
  title: '',
  text: '',
  content: {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  },
  speed: 1.5,
  resolution: '720p',
  fontTitle: 'Orbitron',
  fontContent: 'Inter',
  bgColor: '#000000',
  titleColor: '#eab308',
  contentColor: '#ffffff',
  titleFontSize: 80,
  contentFontSize: 40,
  audioFile: null,
};

export const SINHALA_FONTS = [
  'Abhaya',
  'Abhaya Bold',
  'Arjuna',
  'Baron',
  'Basuru',
  'Siri',
  'Samantha',
  'Malithi'
];

export const ENGLISH_FONTS = [
  'Orbitron',
  'Inter',
  'Roboto',
  'Poppins',
  'Serif',
  'Sans-serif'
];
