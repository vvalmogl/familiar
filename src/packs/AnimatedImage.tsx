import { decompressFrame, parseGIF, type ParsedFrame } from "gifuct-js";
import { useEffect, useRef } from "react";

interface Props {
  src: string;
  className?: string;
  /** Natural size, once known (for the window's aspect ratio). */
  onSize?: (w: number, h: number) => void;
}

const isGif = (src: string) => /\.gif$/i.test(decodeURIComponent(new URL(src, location.href).pathname));

/**
 * An image that always animates. WebKit pauses GIFs when the system setting
 * "Auto-play animated images" is off, so GIFs are decoded and played on a canvas here.
 */
export default function AnimatedImage({ src, className, onSize }: Props) {
  if (!isGif(src)) {
    return (
      <img
        className={className}
        src={src}
        alt=""
        draggable={false}
        onLoad={(e) => onSize?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
      />
    );
  }
  return <GifCanvas key={src} src={src} className={className} onSize={onSize} />;
}

function GifCanvas({ src, className, onSize }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sizeCb = useRef(onSize);
  sizeCb.current = onSize;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    (async () => {
      const gif = parseGIF(await (await fetch(src)).arrayBuffer());
      const c = canvas.current;
      if (!alive || !c) return;
      const { width, height } = gif.lsd;
      c.width = width;
      c.height = height;
      sizeCb.current?.(width, height);
      const ctx = c.getContext("2d")!;
      // Each frame is a patch drawn over the previous picture; a scratch canvas lets it blend.
      const scratch = document.createElement("canvas").getContext("2d")!;
      const frames = gif.frames.filter((f) => "image" in f) as Parameters<typeof decompressFrame>[0][];
      if (frames.length === 0) return;

      let i = 0;
      let restore: ImageData | null = null;
      let previous: ParsedFrame | null = null;
      const step = () => {
        if (!alive) return;
        // Dispose of the previous frame the way it asked to.
        if (previous?.disposalType === 2) {
          const d = previous.dims;
          ctx.clearRect(d.left, d.top, d.width, d.height);
        } else if (previous?.disposalType === 3 && restore) {
          ctx.putImageData(restore, 0, 0);
        }
        if (i === 0) ctx.clearRect(0, 0, width, height);

        const f = decompressFrame(frames[i], gif.gct, true);
        restore = f.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null;
        const { dims } = f;
        if (dims.width > 0 && dims.height > 0) {
          scratch.canvas.width = dims.width;
          scratch.canvas.height = dims.height;
          scratch.putImageData(new ImageData(f.patch as Uint8ClampedArray<ArrayBuffer>, dims.width, dims.height), 0, 0);
          ctx.drawImage(scratch.canvas, dims.left, dims.top);
        }
        previous = f;
        i = (i + 1) % frames.length;
        // Browsers treat tiny delays as 100 ms; keep the same feel.
        timer = setTimeout(step, f.delay < 20 ? 100 : f.delay);
      };
      step();
    })().catch(console.error);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [src]);

  return <canvas ref={canvas} className={className} />;
}
