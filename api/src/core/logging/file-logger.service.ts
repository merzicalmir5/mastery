import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

@Injectable()
export class FileLogger extends ConsoleLogger {
  private readonly logFilePath: string;

  constructor(context = 'App', options: { logLevels?: LogLevel[] } = {}) {
    super(context, options);
    const dir = join(process.cwd(), 'logs');
    mkdirSync(dir, { recursive: true });
    this.logFilePath = join(dir, 'app.log');
  }

  override log(message: unknown, context?: string): void {
    super.log(message, context);
    this.writeLine('LOG', message, context);
  }

  override error(message: unknown, stack?: string, context?: string): void {
    super.error(message, stack, context);
    const combined = stack ? `${this.stringify(message)} | stack=${stack}` : message;
    this.writeLine('ERROR', combined, context);
  }

  override warn(message: unknown, context?: string): void {
    super.warn(message, context);
    this.writeLine('WARN', message, context);
  }

  override debug(message: unknown, context?: string): void {
    super.debug(message, context);
    this.writeLine('DEBUG', message, context);
  }

  override verbose(message: unknown, context?: string): void {
    super.verbose(message, context);
    this.writeLine('VERBOSE', message, context);
  }

  private writeLine(level: string, message: unknown, context?: string): void {
    const ts = new Date().toISOString();
    const ctx = context || this.context || 'App';
    const line = `${ts} [${level}] [${ctx}] ${this.stringify(message)}\n`;
    appendFileSync(this.logFilePath, line, { encoding: 'utf8' });
  }

  private stringify(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}

