export enum ExitCode {
  Success = 0,
  GeneralError = 1,
  InvalidArgument = 2,
  NotImplemented = 3,
  LegacyFailed = 4,
  ValidationFailed = 5,
}

export interface CommandResult {
  exitCode: ExitCode;
  message: string;
  data?: Record<string, unknown>;
}

export interface CliOptions {
  json: boolean;
  dryRun: boolean;
  verbose: boolean;
}

export interface PlatformOption {
  platform?: string;
}

export interface ProfileOption {
  profile?: string;
}
