/* The PDF's fonts in the browser: Inter (the app's number face, with ₹, arrows and sub/superscripts) as static TTFs from
   @expo-google-fonts/inter, emitted by Vite as assets and fetched only when a PDF is built. The PDF embeds a subset. */
import regular from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf?url';
import italic from '@expo-google-fonts/inter/400Regular_Italic/Inter_400Regular_Italic.ttf?url';
import semibold from '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf?url';
import semiboldItalic from '@expo-google-fonts/inter/600SemiBold_Italic/Inter_600SemiBold_Italic.ttf?url';
import type { PdfFontFiles } from './pdf';

const get = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());
export async function loadPdfFonts(): Promise<PdfFontFiles> {
  const [normal, bold, italics, bolditalics] = await Promise.all([get(regular), get(semibold), get(italic), get(semiboldItalic)]);
  return { normal, bold, italics, bolditalics };
}
