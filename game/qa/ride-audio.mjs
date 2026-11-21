// Render the real street mixer to stereo PCM to catch flipped patrol cues.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { withQaBrowser } from './browser.mjs';
import { project } from './doorstep-source.mjs';

const server = await createServer({ root: project, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false, open: false } });
try {
  await server.listen();
  await withQaBrowser(async ({ page, errors, external }) => {
    await page.goto(new URL('src/ride-audio.js', server.resolvedUrls.local[0]).href);
    const result = await page.evaluate(async () => {
      const { createRideAudio } = await import('/src/ride-audio.js');
      const sampleRate = 24000;
      async function levels({ heading = 0, cart, shop, phase = 'chasing', indoor = false, muted = false }) {
        const audio = new OfflineAudioContext(2, sampleRate / 2, sampleRate);
        const master = audio.createGain();
        master.connect(audio.destination);
        const noise = audio.createBuffer(1, sampleRate / 2, sampleRate);
        const hiss = noise.getChannelData(0);
        let seed = 231;
        for (let i = 0; i < hiss.length; i++) {
          seed = Math.imul(seed, 1664525) + 1013904223 | 0;
          hiss[i] = seed / 2147483648;
        }
        const mixer = createRideAudio(audio, master, noise, shop ?? { x: 75, z: 75 });
        mixer.update({ stage: 'drive', cameraHeading: heading, elapsed: 2,
          actor: { x: 0, z: 0, indoors: indoor }, guard: { phase },
          pursuer: cart && { ...cart, active: true, visible: true, speed: 8 } }, !muted);
        const pcm = await audio.startRendering();
        return Array.from({ length: 2 }, (_, channel) => {
          const samples = pcm.getChannelData(channel).subarray(sampleRate / 4);
          return Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
        });
      }
      // The game's forward vector is (-sin h, cos h). Test both ears after
      // turning through all four street orientations, including due east/west.
      const sides = [];
      for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        for (const sign of [-1, 1]) {
          const cart = { x: -4 * sign * Math.cos(heading), z: -4 * sign * Math.sin(heading) };
          sides.push({ sign, rms: await levels({ heading, cart }) });
        }
      }
      const cart = { x: -4, z: 0 };
      return { sides, posted: await levels({ cart, phase: 'posted' }), indoors: await levels({ cart, indoor: true }),
        muted: await levels({ cart, muted: true }), distant: await levels({ cart: { x: -40, z: 0 } }),
        shopNear: await levels({ shop: { x: 3, z: 0 } }), shopFar: await levels({ shop: { x: 35, z: 0 } }) };
    });
    for (const { sign, rms: [left, right] } of result.sides) {
      assert.ok(sign > 0 ? right > left * 2 : left > right * 2, '巡逻车声道与镜头方向不符');
    }
    for (const key of ['posted', 'indoors', 'muted', 'distant', 'shopFar']) {
      assert.deepEqual(result[key], [0, 0], key);
    }
    assert.ok(result.shopNear[0] > 2 * result.shopNear[1] && result.shopNear[0] > .001);
    assert.deepEqual([...errors, ...external], []);
    console.log('巡逻车四向左右声道、守岗静音、建筑内外及红棚锅汽声通过');
  });
} finally {
  await server.close();
}
