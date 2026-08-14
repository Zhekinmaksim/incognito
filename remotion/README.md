# Incognito Film

Remotion source for the 30-second hackathon film. The composition is 1920x1080,
30 fps, and 900 frames long. The edit is defined once in `src/theme.ts`.

```bash
npm install
npm run build
npm run check
npm run render
```

The existing theme track is used from 41 seconds into the source audio at 34%
volume. The render needs Remotion's Chromium browser installed in the local
environment; TypeScript and timeline checks do not require Chromium.
