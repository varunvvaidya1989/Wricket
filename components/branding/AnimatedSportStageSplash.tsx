import React from 'react';

import { SportStageLoader } from '@/components/ui/SportStageLoader';

export function AnimatedSportStageSplash() {
  return (
    <SportStageLoader
      message="Every sport. One stage."
      detail="Preparing your live sports network"
    />
  );
}
