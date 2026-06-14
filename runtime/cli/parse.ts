export interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | boolean>;
}

export function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "-h") {
      flags.set("help", true);
      continue;
    }

    if (arg === "-g") {
      flags.set("global", true);
      continue;
    }

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const inlineEqualsIndex = withoutPrefix.indexOf("=");
    if (inlineEqualsIndex >= 0) {
      flags.set(
        withoutPrefix.slice(0, inlineEqualsIndex),
        withoutPrefix.slice(inlineEqualsIndex + 1),
      );
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(withoutPrefix, next);
      index += 1;
    } else {
      flags.set(withoutPrefix, true);
    }
  }

  return { positionals, flags };
}

export function getStringFlag(parsed: ParsedArgs, name: string) {
  const value = parsed.flags.get(name);
  return typeof value === "string" ? value : null;
}

export function hasFlag(parsed: ParsedArgs, name: string) {
  return parsed.flags.get(name) === true;
}
