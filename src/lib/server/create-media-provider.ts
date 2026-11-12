import 'server-only';

export type CreateMediaCapability = 'image' | 'video' | 'audio' | 'editing';

export type CreateMediaRequest = {
  prompt: string;
  width?: number;
  height?: number;
  inputAssetIds?: string[];
};

export type CreateMediaResult = {
  bytes: Uint8Array;
  mimeType: string;
  name: string;
};

export interface CreateMediaProvider {
  readonly id: string;
  readonly capabilities: CreateMediaCapability[];
  isConfigured(): boolean;
  generate(capability: CreateMediaCapability, request: CreateMediaRequest, signal: AbortSignal): Promise<CreateMediaResult>;
}

export class CreateProviderUnavailableError extends Error {
  constructor(capability: CreateMediaCapability) {
    super(`No ${capability} generation provider is configured for CREATE.`);
    this.name = 'CreateProviderUnavailableError';
  }
}

export function getCreateMediaProviderStatus() {
  return {
    image: { configured: false, message: 'No image-generation adapter is configured. Local image editing remains available.' },
    video: { configured: false, message: 'No video-generation adapter is configured. Browser-native video editing remains available.' },
    audio: { configured: false, message: 'No audio-generation adapter is configured. Browser-native playback remains available.' },
    editing: { configured: false, message: 'No cloud editing adapter is configured. Local creative tools remain available.' },
  } satisfies Record<CreateMediaCapability, { configured: boolean; message: string }>;
}

export function createUnavailableMediaProvider(capability: CreateMediaCapability): CreateMediaProvider {
  return {
    id: 'unconfigured',
    capabilities: [capability],
    isConfigured: () => false,
    async generate() {
      throw new CreateProviderUnavailableError(capability);
    },
  };
}
