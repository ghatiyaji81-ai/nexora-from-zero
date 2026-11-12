export const CREATE_CATEGORIES = [
  'image',
  'video',
  'graphic-design',
  'document',
  'presentation',
  'social-media',
  'marketing',
  'audio',
  'custom',
] as const;

export type CreateCategory = (typeof CREATE_CATEGORIES)[number];
export type CreateProjectType = 'image' | 'video' | 'design' | 'document' | 'presentation' | 'content' | 'audio' | 'custom';

export const CREATE_CATEGORY_LABELS: Record<CreateCategory, string> = {
  image: 'Image',
  video: 'Video',
  'graphic-design': 'Graphic design',
  document: 'Document',
  presentation: 'Presentation',
  'social-media': 'Social media content',
  marketing: 'Marketing material',
  audio: 'Audio content',
  custom: 'Custom project',
};

export const CREATE_PROJECT_TEMPLATES: Array<{
  title: string;
  category: CreateCategory;
  projectType: CreateProjectType;
  description: string;
  width?: number;
  height?: number;
}> = [
  { title: 'Square social post', category: 'social-media', projectType: 'design', description: 'A 1080 × 1080 social post.', width: 1080, height: 1080 },
  { title: 'Story cover', category: 'social-media', projectType: 'design', description: 'A vertical 1080 × 1920 story.', width: 1080, height: 1920 },
  { title: 'Video thumbnail', category: 'video', projectType: 'design', description: 'A 1280 × 720 video thumbnail.', width: 1280, height: 720 },
  { title: 'Poster', category: 'graphic-design', projectType: 'design', description: 'A portrait 900 × 1200 poster.', width: 900, height: 1200 },
  { title: 'Banner', category: 'marketing', projectType: 'design', description: 'A wide 1500 × 500 banner.', width: 1500, height: 500 },
  { title: 'Business card', category: 'marketing', projectType: 'design', description: 'A landscape 1050 × 600 card.', width: 1050, height: 600 },
  { title: 'Logo canvas', category: 'graphic-design', projectType: 'design', description: 'A square 1000 × 1000 identity canvas.', width: 1000, height: 1000 },
  { title: 'Advertisement', category: 'marketing', projectType: 'design', description: 'A square advertisement canvas.', width: 1080, height: 1080 },
  { title: 'Invitation', category: 'graphic-design', projectType: 'design', description: 'A portrait invitation canvas.', width: 900, height: 1200 },
  { title: 'Certificate', category: 'document', projectType: 'design', description: 'A landscape certificate canvas.', width: 1200, height: 850 },
];

export function projectTypeForCategory(category: CreateCategory): CreateProjectType {
  if (category === 'graphic-design' || category === 'social-media' || category === 'marketing') return 'design';
  return category === 'document' ? 'document'
    : category === 'presentation' ? 'presentation'
      : category === 'custom' ? 'custom'
        : category;
}

export function createInitialData(projectType: CreateProjectType, width = 1080, height = 1080) {
  if (projectType === 'design') return { width, height, background: '#ffffff', elements: [] as Array<Record<string, unknown>> };
  if (projectType === 'presentation') return {
    theme: 'studio',
    slides: [{ id: 'slide-1', title: 'A clear beginning', body: 'Add your first idea here.', background: '#f4f3ed', notes: '' }],
  };
  if (projectType === 'image') return { assetId: null, brightness: 100, contrast: 100, saturation: 100, blur: 0, rotation: 0, flipX: false };
  if (projectType === 'video') return { assetId: null, trimStart: 0, trimEnd: null, volume: 1, aspectRatio: 'source', captions: '' };
  if (projectType === 'audio') return { assetId: null, volume: 1 };
  return { text: '', format: projectType === 'document' ? 'markdown' : 'plain' };
}

export function safeCreateFilename(name: string) {
  const cleaned = name.normalize('NFKC').replace(/[\u0000-\u001f\u007f"\\/]/g, '_').trim().slice(0, 120);
  return cleaned || 'creative-asset';
}

export function hasSupportedCreateFileSignature(mimeType: string, bytes: Uint8Array) {
  if (bytes.length < 4) return false;
  if (mimeType === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/webp') return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
  if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6));
  if (mimeType === 'video/webm') return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (mimeType === 'video/mp4') return ascii(bytes, 4, 4) === 'ftyp';
  if (mimeType === 'audio/wav') return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE';
  if (mimeType === 'audio/mpeg') return ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (mimeType === 'text/plain') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return !bytes.includes(0);
    } catch { return false; }
  }
  if (mimeType === 'application/pdf') return ascii(bytes, 0, 5) === '%PDF-';
  return false;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
