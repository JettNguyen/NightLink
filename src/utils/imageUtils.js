/**
 * Compress and crop an image file to a square JPEG.
 *
 * @param {File} file - Source image file
 * @param {{ x: number, y: number, width: number, height: number }} cropRect - Crop region in natural-image pixels
 * @param {number} [maxDimension=400] - Output size in pixels (square)
 * @param {number} [quality=0.82] - JPEG quality 0-1
 * @returns {Promise<Blob>} Compressed JPEG blob
 */
export const compressImage = ({ file, cropRect, maxDimension = 400, quality = 0.82 }) =>
  new Promise((resolve, reject) => {
    const objectURL = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectURL);
      const { x, y, width, height } = cropRect;
      const canvas = document.createElement('canvas');
      canvas.width = maxDimension;
      canvas.height = maxDimension;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, x, y, width, height, 0, 0, maxDimension, maxDimension);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
          resolve(blob);
        },
        'image/jpeg',
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectURL);
      reject(new Error('Failed to load image'));
    };

    img.src = objectURL;
  });
