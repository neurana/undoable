export type WizardSelectOption<T = string> = {
  value: T;
  label: string;
  hint?: string;
};

export type WizardPrompter = {
  intro: (title: string) => Promise<void>;
  outro: (message: string) => Promise<void>;
  note: (message: string, title?: string) => Promise<void>;
  select: <T>(params: {
    message: string;
    options: WizardSelectOption<T>[];
    initialValue?: T;
  }) => Promise<T>;
  multiselect: <T>(params: {
    message: string;
    options: WizardSelectOption<T>[];
    initialValues?: T[];
  }) => Promise<T[]>;
  text: (params: {
    message: string;
    initialValue?: string;
    placeholder?: string;
    validate?: (value: string) => string | undefined;
  }) => Promise<string>;
  confirm: (params: {
    message: string;
    initialValue?: boolean;
  }) => Promise<boolean>;
  progress: (label: string) => WizardProgress;
};

export type WizardProgress = {
  update: (message: string) => void;
  stop: (message?: string) => void;
};

export class WizardCancelledError extends Error {
  constructor(message = "wizard cancelled") {
    super(message);
    this.name = "WizardCancelledError";
  }
}
