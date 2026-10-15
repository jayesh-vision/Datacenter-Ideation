/* Minimal typing of pdfmake 0.3 as the review pack uses it (the package ships no types). */
declare module 'pdfmake' {
  export interface OutputDocument { getBuffer(): Promise<Uint8Array> }
  export interface PdfMake {
    virtualfs: { writeFileSync(name: string, content: string | Uint8Array, encoding?: string): void; existsSync(name: string): boolean };
    setFonts(fonts: Record<string, Record<string, string>>): void;
    addFonts(fonts: Record<string, Record<string, string>>): void;
    setUrlAccessPolicy?(cb: (url: string) => boolean): void;
    setLocalAccessPolicy?(cb: (path: string) => boolean): void;
    createPdf(doc: object, options?: object): OutputDocument;
  }
  const pdfMake: PdfMake;
  export default pdfMake;
}
