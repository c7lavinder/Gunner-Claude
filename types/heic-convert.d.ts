// types/heic-convert.d.ts
// Hand-rolled types for heic-convert (no @types package published).

declare module 'heic-convert' {
  interface ConvertOptions {
    buffer: Buffer | Uint8Array | ArrayBuffer
    format: 'JPEG' | 'PNG'
    quality?: number
  }
  function convert(options: ConvertOptions): Promise<Uint8Array>
  export default convert
}
