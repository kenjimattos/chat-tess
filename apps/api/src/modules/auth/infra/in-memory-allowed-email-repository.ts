import type { AllowedEmailRepository } from '../domain/ports';

export class InMemoryAllowedEmailRepository implements AllowedEmailRepository {
  private readonly patterns: Set<string>;

  constructor(initialPatterns: string[] = []) {
    this.patterns = new Set(initialPatterns);
  }

  async listPatterns(): Promise<string[]> {
    return [...this.patterns];
  }

  async addPatterns(patterns: string[]): Promise<void> {
    patterns.forEach((pattern) => this.patterns.add(pattern));
  }
}
