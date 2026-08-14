import React from 'react';
import {Composition} from 'remotion';
import {Film} from './Film';
import {DURATION, FPS, HEIGHT, WIDTH} from './theme';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="IncognitoFilm"
    component={Film}
    durationInFrames={DURATION}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
