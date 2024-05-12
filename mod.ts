let envPath: string | undefined;

try {
  envPath = Deno.env.get("TESSERACT_PATH");
} catch (e) {}

/** Default path for Tesseract Binary */
export let TESSERACT_PATH = envPath ?? "tesseract";

/** OCR Engine Mode */
export enum OEM {
  Original,
  NeuralLSTMOnly,
  TesseractLSTM,
  Default,
}

/** Page Segmentation Mode */
export enum PSM {
  OSD,
  AutoPageSegment_OSD,
  AutoPageSegment,
  AutoPageSegment_OCR,
  SingleColumnText,
  SingleUniformVerticalText,
  SingleUniformText,
  SingleTextLine,
  SingleWord,
  SingleWordInCircle,
  SingleCharacter,
  SparseText,
  SparseText_OSD,
  RawLine,
}

/** Various options to configure Tesseract */
export interface TesseractOptions {
  /** Language */
  lang?: string;
  /** Tesseract Path */
  path?: string;
  /** Tessdata directory path */
  tessdata?: string;
  /** Page Segmentation Mode */
  psm?: number | PSM;
  /** OCR Engine Mode */
  oem?: number | OEM;
  /** DPI (Resolution) for Image */
  dpi?: number;
  /** Path to user_words file */
  words?: string;
  /** Path to user_patterns file */
  patterns?: string;
  /** Custom flags to pass on with Tesseract Command */
  flags?: { [name: string]: string };
  /** -c flags to pass */
  config?: { [name: string]: string };
  /** Output file path or "stdout" or "-" */
  output?: "stdout" | "-" | string;
  /** Whether file should be written into Stdin or read from path */
  stdin?: boolean;
}

/** Set default Tesseract Binary Path. */
export function setPath(path: string) {
  TESSERACT_PATH = path;
}

const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

/**
 * Execute Tesseract
 *
 * @param file File path or file string or file binary (Uint8Array)
 * @param options Options to configure Tesseract
 */
export async function recognize(
  file: string | Uint8Array,
  options: TesseractOptions = {},
): Promise<string> {
  if (options === undefined) options = {};
  if (typeof file !== "string" && !(file instanceof Uint8Array)) {
    throw new Error("File must be string (path) or Uint8Array");
  }
  if (typeof options !== "object") throw new Error("Options must be object");

  const args: string[] = [];
  const input = typeof file === "string" && options.stdin !== true
    ? file
    : "stdin";
  args.push(input);

  const output = options.output ?? "stdout";
  args.push(options.output ?? "stdout");

  if (typeof options.lang === "string") {
    args.push("-l");
    args.push(`${options.lang.replaceAll('"', '\\"')}`);
  }
  if (typeof options.tessdata === "string") {
    args.push(`--tessdata-dir="${options.tessdata.replaceAll('"', '\\"')}"`);
  }
  if (typeof options.psm === "number") {
    if (options.psm < 0 || options.psm > 13) {
      throw new Error(`Invalid PSM: ${options.psm}. Must be between 0-13`);
    }
    args.push(`--psm`, options.psm.toString());
  }
  if (typeof options.oem === "number") {
    if (options.oem < 0 || options.oem > 3) {
      throw new Error(`Invalid OEM: ${options.oem}. Must be between 0-3`);
    }
    args.push(`--oem ${options.oem}`);
  }
  if (typeof options.dpi === "number") args.push(`--dpi ${options.dpi}`);
  if (typeof options.words === "string") {
    args.push(`--user-words="${options.words.replaceAll('"', '\\"')}"`);
  }
  if (typeof options.patterns === "string") {
    args.push(`--user-patterns="${options.patterns.replaceAll('"', '\\"')}"`);
  }

  if (typeof options.flags === "object") {
    for (const [k, v] of Object.entries(options.flags)) {
      args.push(
        `-${k.length > 1 ? "-" : ""}${k}="${v.replaceAll('"', '\\"')}"`,
      );
    }
  }

  if (typeof options.config === "object") {
    for (const [k, v] of Object.entries(options.config)) {
      args.push("-c");
      args.push(`${k}=${v}`);
    }
  }

  const command = new Deno.Command(options.path ?? TESSERACT_PATH, {
    args,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const proc = command.spawn();

  if (input === "stdin" || input === "-") {
    const writer = proc.stdin.getWriter();
    await writer.write(typeof file === "object" ? file : encoder.encode(file));
    writer.releaseLock();
  }
  await proc.stdin.close();

  const { stdout, stderr } = await proc.output();
  if (stderr.byteLength > 0) {
    const err = decoder.decode(stderr);
    throw new Error(err);
  }

  if (output !== "stdout" && output !== "-") return "";
  else {
    return decoder.decode(stdout);
  }
}

/**
 * Get a list of available languages
 *
 * @param path Tesseract Binary Path
 */
export async function getLanguages(path?: string): Promise<string[]> {
  const command = new Deno.Command(path ?? TESSERACT_PATH, {
    args: ["--list-langs"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const proc = command.spawn();

  const { stdout, stderr } = await proc.output();
  if (stderr.byteLength > 0) {
    const err = decoder.decode(stderr);
    await proc.stdin.close();
    throw new Error(err);
  }

  await proc.stdin.close();
  return decoder
    .decode(stdout)
    .replaceAll("\r", "")
    .split("\n")
    .filter((e) => !e.startsWith("List of available languages"))
    .map((e) => e.trim())
    .filter((e) => e != "");
}

/**
 * Get a list of available languages
 *
 * @param path Tesseract Binary Path
 */
export async function getVersion(path?: string) {
  const command = new Deno.Command(path ?? TESSERACT_PATH, {
    args: ["-v"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const proc = command.spawn();

  const { stdout, stderr } = await proc.output();
  if (stderr.byteLength > 0) {
    const err = decoder.decode(stderr);
    throw new Error(err);
  }

  await proc.stdin.close();
  return (
    decoder
      .decode(stdout)
      .replaceAll("\r", "")
      .split("\n")[0]
      ?.split(" ")
      .pop() ?? "unknown"
  );
}
