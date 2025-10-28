/**
 * Types for the src-context
 */

export interface BuildStats {
  totalFilesFound: number;
  filesToInclude: number;
  filesToMinify: number;
  filesIgnored: number;
  filesIgnoredByDefault: number;
  filesIgnoredByCustom: number;
  filesIgnoredByCli: number;
  binaryAndSvgFiles: number;
  skippedLargeFiles: number;
  totalTokenCount: number;
  totalFileSizeKB: number;
  topTokenConsumers: Array<{ path: string, tokenCount: number }>;
}