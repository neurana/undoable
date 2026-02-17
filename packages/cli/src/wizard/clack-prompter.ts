import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  note,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import type { WizardProgress, WizardPrompter } from "./prompts.js";
import { WizardCancelledError } from "./prompts.js";

function guardCancel<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Setup cancelled.");
    throw new WizardCancelledError();
  }
  return value;
}

export function createClackPrompter(): WizardPrompter {
  return {
    intro: async (title) => {
      intro(title);
    },
    outro: async (message) => {
      outro(message);
    },
    note: async (message, title) => {
      note(message, title);
    },
    select: async (params) => {
      const result = await select({
        message: params.message,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        options: params.options as any,
        initialValue: params.initialValue,
      });
      return guardCancel(result);
    },
    multiselect: async (params) => {
      const result = await multiselect({
        message: params.message,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        options: params.options as any,
        initialValues: params.initialValues,
      });
      return guardCancel(result);
    },
    text: async (params) => {
      const validate = params.validate;
      return guardCancel(
        await text({
          message: params.message,
          initialValue: params.initialValue,
          placeholder: params.placeholder,
          validate: validate ? (value) => validate(value ?? "") : undefined,
        }),
      );
    },
    confirm: async (params) =>
      guardCancel(
        await confirm({
          message: params.message,
          initialValue: params.initialValue,
        }),
      ),
    progress: (label: string): WizardProgress => {
      const spin = spinner();
      spin.start(label);
      return {
        update: (message) => spin.message(message),
        stop: (message) => spin.stop(message),
      };
    },
  };
}
