<script lang="ts">
  import { onMount } from 'svelte';

  let canvas: HTMLCanvasElement;

  onMount(() => {
    const context = canvas.getContext('2d');
    if (!context) return;
    let scheduled = 0;

    function paint() {
      scheduled = 0;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height || !context) return;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);

      // A stationary phosphor texture, not animated television static. Use a
      // deterministic, seamless tile so resizing never makes the grain jump.
      const grain = document.createElement('canvas');
      grain.width = grain.height = 192;
      const grainContext = grain.getContext('2d');
      if (grainContext) {
        const pixels = grainContext.createImageData(192, 192);
        let seed = 7183;
        for (let i = 0; i < pixels.data.length; i += 4) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          const value = seed >>> 24;
          const light = value > 128;
          pixels.data[i] = light ? 139 : 0;
          pixels.data[i + 1] = light ? 221 : 0;
          pixels.data[i + 2] = light ? 158 : 0;
          pixels.data[i + 3] = Math.abs(value - 128) / 25;
        }
        grainContext.putImageData(pixels, 0, 0);
        const pattern = context.createPattern(grain, 'repeat');
        if (pattern) { context.fillStyle = pattern; context.fillRect(0, 0, width, height); }
      }

      // The raster follows the face of the tube: rows gently bow outward
      // above/below the center. Their soft shoulders approximate the beam's
      // falloff instead of drawing hard, rectangular CSS rules over the text.
      for (let y = -12; y < height + 12; y += 4) {
        const edge = (y / height - .5) * 12;
        const variation = .92 + Math.sin(y * 1.618) * .08;
        context.beginPath();
        context.moveTo(-2, y + edge);
        context.quadraticCurveTo(width / 2, y - edge, width + 2, y + edge);
        for (const [thickness, opacity] of [[2.6, .018], [1.35, .035], [.55, .075]]) {
          context.lineWidth = thickness;
          context.strokeStyle = `rgba(0, 5, 1, ${opacity * variation})`;
          context.stroke();
        }
      }
    }

    function schedule() {
      if (!scheduled) scheduled = requestAnimationFrame(paint);
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);
    window.addEventListener('resize', schedule);
    paint();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(scheduled);
    };
  });
</script>

<canvas bind:this={canvas} class="crt-raster" aria-hidden="true"></canvas>
