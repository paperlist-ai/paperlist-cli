export function resolveNpmCli(): string;
export function runNpm(args: string[], opts?: object): string | Buffer;
export function selectPackedTarball(destinationDir: string, npmPackStdout?: string): string;
export function packToDirectory(
  destinationDir: string,
  opts?: { ignoreScripts?: boolean },
): string;
export function assertPublishedContents(tarball: string): string[];
