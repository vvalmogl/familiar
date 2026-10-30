const cache = new Map<string, boolean>();

/**
 * Whether an image has a solid background (all four corners opaque) — such images are shown
 * as a rounded card with a themed frame instead of floating freely.
 */
export function hasSolidBackground(src: string): Promise<boolean> {
  const known = cache.get(src);
  if (known !== undefined) return Promise.resolve(known);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let solid = false;
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const corners = [[0, 0], [c.width - 1, 0], [0, c.height - 1], [c.width - 1, c.height - 1]];
        solid = corners.every(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3] > 127);
      } catch {
        solid = false; // unreadable (e.g. tainted canvas): assume transparent
      }
      cache.set(src, solid);
      resolve(solid);
    };
    img.onerror = () => resolve(false);
    img.src = src;
  });
}
