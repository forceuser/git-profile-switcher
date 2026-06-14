import { createInterface as createLineInterface } from "node:readline";
import { createInterface as createQuestionInterface } from "node:readline/promises";

const CLEAR_SCREEN = "\x1b[2J";
const CLEAR_LINE = "\x1b[2K";
const CURSOR_HOME = "\x1b[H";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const DEFAULT_TERMINAL_ROWS = 24;
const PRODUCT_TITLE = "Git Profile Switcher";

type PromptColor = "accent" | "dim" | "title";

const COLORS: Record<PromptColor, string> = {
  accent: "\x1b[36m",
  dim: "\x1b[2m",
  title: "\x1b[1;36m",
};
const RESET = "\x1b[0m";

export class PromptCancelError extends Error {
  constructor() {
    super("Prompt cancelled.");
  }
}

export class PromptInterruptError extends Error {
  constructor() {
    super("Prompt interrupted.");
  }
}

interface PromptInteraction {
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
  askLine?: (prompt: string) => Promise<string>;
  screen?: {
    messages: string[];
  };
}

export interface PromptSession {
  ask(prompt: string): Promise<string>;
  askRequired(prompt: string): Promise<string>;
  selectOne<T>(input: {
    prompt: string;
    emptyMessage: string;
    options: T[];
    renderOption(option: T): string;
    getValue(option: T): string;
    defaultIndex?: number;
  }): Promise<T>;
  close(): void;
}

export function isPromptCancelError(error: unknown) {
  return error instanceof PromptCancelError;
}

export function isPromptInterruptError(error: unknown) {
  return error instanceof PromptInterruptError;
}

export function createPromptSession(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): PromptSession {
  const lineRl = input.isTTY ? null : createLineInterface({ input, terminal: false });
  const lines: string[] = [];
  let isClosed = false;
  let waiting: {
    resolve(value: string): void;
    reject(error: Error): void;
  } | null = null;

  lineRl?.on("line", (line) => {
    if (waiting) {
      const current = waiting;
      waiting = null;
      current.resolve(line);
      return;
    }
    lines.push(line);
  });
  lineRl?.on("close", () => {
    isClosed = true;
    if (waiting) {
      const current = waiting;
      waiting = null;
      current.reject(new Error("Input ended before a value was provided."));
    }
  });

  return {
    async ask(prompt) {
      return (
        await readLine(
          input,
          output,
          lines,
          prompt,
          (pending) => {
            waiting = pending;
          },
          isClosed,
        )
      ).trim();
    },
    async askRequired(prompt) {
      for (;;) {
        const value = (
          await readLine(
            input,
            output,
            lines,
            prompt,
            (pending) => {
              waiting = pending;
            },
            isClosed,
          )
        ).trim();
        if (value) {
          return value;
        }
        output.write("Value is required.\n");
      }
    },
    async selectOne(selection) {
      if (selection.options.length === 0) {
        throw new Error(selection.emptyMessage);
      }

      const interaction = { input, output } satisfies PromptInteraction;
      if (canUseArrowKeys(interaction)) {
        const choice = await promptMenu(
          interaction,
          selection.prompt.trimEnd(),
          selection.options.map((option) => selection.renderOption(option)),
          (selection.defaultIndex ?? 0) + 1,
        );
        if (choice === null) {
          throw new PromptCancelError();
        }
        return selection.options[choice - 1]!;
      }

      for (const [index, option] of selection.options.entries()) {
        output.write(`${index + 1}. ${selection.renderOption(option)}\n`);
      }

      for (;;) {
        const answer = (
          await readLine(
            input,
            output,
            lines,
            selection.prompt,
            (pending) => {
              waiting = pending;
            },
            isClosed,
          )
        ).trim();
        if (answer === "" && selection.defaultIndex !== undefined) {
          const defaultOption = selection.options[selection.defaultIndex];
          if (defaultOption) {
            return defaultOption;
          }
        }

        const selectedByNumber = Number.parseInt(answer, 10);
        if (
          Number.isInteger(selectedByNumber) &&
          selectedByNumber >= 1 &&
          selectedByNumber <= selection.options.length
        ) {
          return selection.options[selectedByNumber - 1]!;
        }

        const selectedByValue = selection.options.find(
          (option) => selection.getValue(option) === answer,
        );
        if (selectedByValue) {
          return selectedByValue;
        }

        output.write("Choose one of the listed options.\n");
      }
    },
    close() {
      lineRl?.close();
    },
  };
}

async function promptMenu(
  interaction: PromptInteraction,
  title: string,
  options: string[],
  initialChoice = 1,
) {
  if (!interaction.askLine && canUseArrowKeys(interaction)) {
    return promptArrowMenu(interaction, title, options, initialChoice);
  }

  renderScreen(interaction, title);

  for (const [index, option] of options.entries()) {
    interaction.output.write(`  ${index + 1}. ${option}\n`);
  }

  const answer = interaction.askLine
    ? await interaction.askLine("Choose number: ")
    : await askLine(interaction, "Choose number: ");
  if (!answer) {
    clearScreenMessage(interaction);
    return null;
  }

  const choice = Number.parseInt(answer, 10);
  if (
    !Number.isInteger(choice) ||
    String(choice) !== answer ||
    choice < 1 ||
    choice > options.length
  ) {
    clearScreenMessage(interaction);
    interaction.output.write("Invalid choice.\n");
    return null;
  }

  clearScreenMessage(interaction);
  return choice;
}

async function promptArrowMenu(
  interaction: PromptInteraction,
  title: string,
  options: string[],
  initialChoice: number,
) {
  let selectedIndex = normalizeInitialChoice(initialChoice, options.length) - 1;
  let firstVisibleIndex = 0;
  const input = interaction.input;
  const previousRawMode = input.isRaw;

  input.setRawMode?.(true);
  input.resume();
  interaction.output.write(HIDE_CURSOR);

  const render = () => {
    const headerLines = [
      color(interaction, "title", PRODUCT_TITLE),
      "",
      color(interaction, "accent", title),
      color(interaction, "dim", "Use Up/Down and Enter. Press q or Esc to go back. Ctrl+C quits."),
      ...renderScreenMessages(interaction),
    ];
    const menuRows = getMenuRowCapacity(interaction, headerLines.length);
    const visibleMenu = getVisibleMenu(options, selectedIndex, firstVisibleIndex, menuRows);
    firstVisibleIndex = visibleMenu.firstIndex;

    const lines = [
      ...headerLines,
      ...visibleMenu.lines.map(({ option, index }) =>
        renderMenuOption(interaction, option, index === selectedIndex),
      ),
    ];

    interaction.output.write(`${CLEAR_SCREEN}${CURSOR_HOME}`);
    interaction.output.write(lines.map((line) => `${CLEAR_LINE}${line}`).join("\n"));
    interaction.output.write("\n");
  };

  render();

  try {
    return await new Promise<number | null>((resolve, reject) => {
      let finished = false;
      const cleanup = () => {
        input.off("data", onData);
        interaction.output.off("resize", onResize);
        input.setRawMode?.(previousRawMode ?? false);
        input.pause();
        interaction.output.write(SHOW_CURSOR);
      };
      const finish = (choice: number | null, error?: Error) => {
        if (finished) {
          return;
        }

        finished = true;
        cleanup();
        clearScreenMessage(interaction);
        if (error) {
          reject(error);
          return;
        }

        resolve(choice);
      };
      const onData = (chunk: Buffer | string) => {
        const key = String(chunk);

        if (key === "\u0003") {
          finish(null, new PromptInterruptError());
          return;
        }

        if (key === "\x1b" || key === "q") {
          finish(null);
          return;
        }

        if (key === "\x1b[A") {
          selectedIndex = selectedIndex === 0 ? options.length - 1 : selectedIndex - 1;
          render();
          return;
        }

        if (key === "\x1b[B") {
          selectedIndex = selectedIndex === options.length - 1 ? 0 : selectedIndex + 1;
          render();
          return;
        }

        if (key === "\r" || key === "\n") {
          finish(selectedIndex + 1);
        }
      };
      const onResize = () => {
        if (!finished) {
          render();
        }
      };

      input.on("data", onData);
      interaction.output.on("resize", onResize);
    });
  } finally {
    interaction.output.write("\n");
  }
}

async function askLine(interaction: PromptInteraction, prompt: string) {
  if (interaction.askLine) {
    interaction.output.write(prompt);
    return (await interaction.askLine(prompt)).trim();
  }

  return await readTtyQuestion(interaction.input, interaction.output, prompt).then((answer) =>
    answer.trim(),
  );
}

function canUseArrowKeys(interaction: PromptInteraction) {
  return (
    interaction.input.isTTY &&
    interaction.output.isTTY &&
    typeof interaction.input.setRawMode === "function"
  );
}

function getMenuRowCapacity(interaction: PromptInteraction, headerLineCount: number) {
  const terminalRows = getTerminalRows(interaction);
  return Math.max(1, terminalRows - headerLineCount - 2);
}

function getTerminalRows(interaction: PromptInteraction) {
  const rows = interaction.output.rows ?? process.stdout.rows;
  if (Number.isInteger(rows) && rows > 0) {
    return rows;
  }

  return DEFAULT_TERMINAL_ROWS;
}

function getVisibleMenu(
  options: string[],
  selectedIndex: number,
  firstVisibleIndex: number,
  rowCapacity: number,
) {
  if (options.length <= rowCapacity) {
    return {
      firstIndex: 0,
      lines: options.map((option, index) => ({ option, index })),
    };
  }

  const canShowScrollHints = rowCapacity >= 3;
  const visibleOptionCount = canShowScrollHints ? rowCapacity - 2 : rowCapacity;
  let nextFirstVisibleIndex = firstVisibleIndex;

  if (selectedIndex < nextFirstVisibleIndex) {
    nextFirstVisibleIndex = selectedIndex;
  }

  if (selectedIndex >= nextFirstVisibleIndex + visibleOptionCount) {
    nextFirstVisibleIndex = selectedIndex - visibleOptionCount + 1;
  }

  nextFirstVisibleIndex = clamp(
    nextFirstVisibleIndex,
    0,
    Math.max(0, options.length - visibleOptionCount),
  );

  const visibleOptions = options
    .slice(nextFirstVisibleIndex, nextFirstVisibleIndex + visibleOptionCount)
    .map((option, offset) => ({
      option,
      index: nextFirstVisibleIndex + offset,
    }));
  const hasPrevious = nextFirstVisibleIndex > 0;
  const hasNext = nextFirstVisibleIndex + visibleOptionCount < options.length;

  return {
    firstIndex: nextFirstVisibleIndex,
    lines: canShowScrollHints
      ? [
          {
            option: hasPrevious ? "↑" : "",
            index: -1,
          },
          ...visibleOptions,
          {
            option: hasNext ? "↓" : "",
            index: -1,
          },
        ]
      : visibleOptions,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function renderScreen(interaction: PromptInteraction, title: string) {
  interaction.output.write(`${CLEAR_SCREEN}${CURSOR_HOME}`);
  interaction.output.write(`${color(interaction, "title", PRODUCT_TITLE)}\n\n`);
  interaction.output.write(`${color(interaction, "accent", title)}\n`);

  for (const message of renderScreenMessages(interaction)) {
    interaction.output.write(`${message}\n`);
  }
}

function renderScreenMessages(interaction: PromptInteraction) {
  const messages = interaction.screen?.messages ?? [];
  if (messages.length === 0) {
    return [""];
  }

  return ["", ...messages, ""];
}

function clearScreenMessage(interaction: PromptInteraction) {
  if (interaction.screen) {
    interaction.screen.messages = [];
  }
}

function renderMenuOption(interaction: PromptInteraction, option: string, selected: boolean) {
  if (!selected) {
    return `  ${option}`;
  }

  return color(interaction, "accent", `› ${option}`);
}

function normalizeInitialChoice(initialChoice: number, optionCount: number) {
  if (!Number.isInteger(initialChoice) || initialChoice < 1 || initialChoice > optionCount) {
    return 1;
  }

  return initialChoice;
}

function color(interaction: PromptInteraction, colorName: PromptColor, value: string) {
  if (!interaction.output.isTTY || process.env.NO_COLOR) {
    return value;
  }

  return `${COLORS[colorName]}${value}${RESET}`;
}

function readLine(
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream,
  lines: string[],
  prompt: string,
  setWaiting: (pending: { resolve(value: string): void; reject(error: Error): void }) => void,
  isClosed: boolean,
) {
  if (input.isTTY) {
    return readTtyQuestion(input, output, prompt);
  }

  output.write(prompt);
  const existing = lines.shift();
  if (existing !== undefined) {
    return Promise.resolve(existing);
  }
  if (isClosed) {
    return Promise.reject(new Error("Input ended before a value was provided."));
  }
  return new Promise<string>((resolve, reject) => {
    setWaiting({ resolve, reject });
  });
}

function readTtyQuestion(input: NodeJS.ReadStream, output: NodeJS.WriteStream, prompt: string) {
  const questionRl = createQuestionInterface({ input, output });
  input.resume();

  return new Promise<string>((resolve, reject) => {
    let finished = false;
    const cleanup = () => {
      questionRl.off("SIGINT", onSigint);
      input.off("data", onData);
      questionRl.close();
    };
    const finish = (answer: string | null, error?: Error) => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      if (error) {
        reject(error);
        return;
      }
      resolve(answer ?? "");
    };
    const onSigint = () => {
      finish(null, new PromptInterruptError());
    };
    const onData = (chunk: Buffer | string) => {
      if (String(chunk) === "\x1b") {
        finish(null, new PromptCancelError());
      }
    };

    questionRl.once("SIGINT", onSigint);
    input.on("data", onData);
    questionRl.question(prompt).then(
      (answer) => {
        finish(answer);
      },
      (error: unknown) => {
        finish(null, error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
