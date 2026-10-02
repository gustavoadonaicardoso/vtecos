"use client";

import React from 'react';
import { SiFacebook, SiInstagram } from 'react-icons/si';
import type { SocialPlatform } from '@/types';

export const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  instagram: '#E4405F',
  facebook: '#1877F2',
};

export default function PlatformIcon({ platform, size = 14 }: { platform: SocialPlatform; size?: number }) {
  const Icon = platform === 'instagram' ? SiInstagram : SiFacebook;
  return <Icon size={size} color={PLATFORM_COLORS[platform]} aria-label={platform === 'instagram' ? 'Instagram' : 'Facebook'} />;
}
